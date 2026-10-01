<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use App\Domain\Economy\CivilianEconomySeason;
use App\Domain\Resources\Quantity as Q;

$fixtures = require __DIR__ . '/../../tests/client/fixtures/civilian-economy/scenarios.php';
$options = getopt('', ['scenario:', 'seasons:', 'json', 'full', 'help']);
if (isset($options['help'])) {
    echo "Usage: php8.3 scripts/research/civilian-economy.php [--scenario=all|" . implode('|', array_keys($fixtures)) . "] [--seasons=80] [--full|--json]\n";
    echo "Default text shows opening, ten-season checkpoints, shocks and changes in issue types. --full and --json include every season.\n";
    exit(0);
}
$selection = $options['scenario'] ?? 'all';
$seasons = filter_var($options['seasons'] ?? 80, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 500]]);
if ($seasons === false || ($selection !== 'all' && !isset($fixtures[$selection]))) {
    fwrite(STDERR, "Invalid scenario or season count (1–500). Use --help.\n"); exit(1);
}
$reports = [];
foreach ($fixtures as $name => $fixture) {
    if ($selection !== 'all' && $name !== $selection) continue;
    $state = $fixture['state']; $rows = [];
    for ($season = 1; $season <= $seasons; ++$season) {
        if ($shock = $fixture['shocks'][$season] ?? null) $state['sites'][$shock['site']]['availability'] = $shock['availability'];
        $result = CivilianEconomySeason::resolve($fixture['resources'], $state, $fixture['policy'], $fixture['rules']);
        $rows[] = $result['report'] + ['shock' => $shock, 'inventories' => $result['state']['inventories']];
        $state = $result['state'];
    }
    $reports[$name] = ['description' => $fixture['description'], 'rules' => $fixture['rules'], 'opening' => $fixture['state'], 'seasons' => $rows, 'closing' => $state];
}
if (isset($options['json'])) {
    echo json_encode(['format' => 'civilian-milestone-1', 'status' => 'isolated illustrative model, not live balance', 'scenarios' => $reports], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), "\n";
    exit(0);
}
$number = static fn ($v) => number_format((float) $v, 2, '.', '');
foreach ($reports as $name => $run) {
    echo "\n", strtoupper($name), ' — ', $run['description'], "\n";
    foreach (['civilian_shortage' => 'Civilian needs unmet', 'maintenance_shortfall' => 'Equipment maintenance missed', 'public_service_shortfall' => 'Public services underdelivered', 'support_shortfall' => 'Income support below promise'] as $type => $label) {
        $affected = array_values(array_filter($run['seasons'], static fn ($row) => in_array($type, array_column($row['issues'], 'type'), true)));
        if ($affected) echo $label, ': ', count($affected), ' seasons (first ', $affected[0]['season'], ', last ', $affected[array_key_last($affected)]['season'], ").\n";
    }
    echo " Season | food met/need | goods met/need | copper | upkeep met/need | wages | taxes | treasury | household cash | issues\n";
    $previousIssues = null;
    foreach ($run['seasons'] as $row) {
        $issueTypes = array_values(array_unique(array_column($row['issues'], 'type')));
        $show = isset($options['full']) || $row['season'] <= 4 || $row['season'] % 10 === 0 || $row['season'] === $seasons || $row['shock'] !== null || $issueTypes !== $previousIssues;
        $previousIssues = $issueTypes;
        if (!$show) continue;
        $required = $delivered = '0.000000';
        foreach ($row['sites'] as $site) { $required = Q::add($required, $site['maintenance_required']); $delivered = Q::add($delivered, $site['maintenance_delivered']); }
        $food = $row['consumption']['food']; $goods = $row['consumption']['household_goods'];
        printf(" %6d | %s/%s | %s/%s | %s | %s/%s | %s | %s | %s | %s | %s\n", $row['season'], $number($food['fulfilled']), $number($food['requested']),
            $number($goods['fulfilled']), $number($goods['requested']), $number($row['sites']['mine']['produced']), $number($delivered), $number($required),
            $number($row['wages']), $number($row['taxes']), $number($row['accounts']['government']), $number($row['accounts']['households']), implode(', ', $issueTypes) ?: 'none');
        if ($row['shock'] !== null) echo '        Declared event: ', $row['shock']['site'], ' availability set to ', $number(Q::mul($row['shock']['availability'], '100')), "%.\n";
    }
    $last = $run['seasons'][array_key_last($run['seasons'])];
    echo 'Closing: subsistence ', $number($last['subsistence']), '; public services ', $number($last['public_services_delivered']), '/', $number($last['public_services_required']),
        '; workers ', $number($last['workers_used']), '/', $number($last['workforce']), '; conserved total cash ', $number($last['total_cash']), ".\n";
    foreach ($last['sites'] as $id => $site) echo "  $id: condition ", $number(Q::mul($site['closing_condition'], '100')), '%; constraints ', implode(', ', $site['constraints']) ?: 'none', ".\n";
    foreach ($last['consumption'] as $r => $use) echo "  $r: market need ", $number($use['market_requested']), ', affordable ', $number($use['funded']), ', purchased ', $number($use['purchased']), ".\n";
}
echo "\nFixtures use fixed prices, fixed population/assets, pooled territorial households and worker-season time. No military, trade, growth, investment, live DB or automatic rescue. JSON includes every season's inputs, constraints and accounts.\n";

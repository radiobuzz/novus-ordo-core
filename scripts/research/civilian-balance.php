<?php
// Read-only, pure resolver experiments. Never bootstraps the application/database.
require __DIR__ . '/../../vendor/autoload.php';
use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Resources\{Agriculture, Quantity as Q};
$fixture = json_decode(file_get_contents(__DIR__ . '/../../tests/client/fixtures/production-accounting/civilian-deficit.json'), true, flags: JSON_THROW_ON_ERROR);
$founding = json_decode(file_get_contents(__DIR__ . '/../../tests/client/fixtures/production-accounting/civilian-homeland.json'), true, flags: JSON_THROW_ON_ERROR)['founding'];
$resources = array_column(json_decode(file_get_contents(__DIR__ . '/../../database/resource-templates/civilian.json'), true, flags: JSON_THROW_ON_ERROR)['resources'], null, 'key');
$variants = [
    'baseline' => [],
    'upkeep-1' => ['infrastructure_upkeep' => '1'],
    'payout-1' => ['profit_distribution' => '1'],
    'upkeep-1-payout-1' => ['infrastructure_upkeep' => '1', 'profit_distribution' => '1'],
    'upkeep-1-payout-095' => ['infrastructure_upkeep' => '1', 'profit_distribution' => '0.95'],
    'upkeep-075-payout-1' => ['infrastructure_upkeep' => '0.75', 'profit_distribution' => '1'],
    'upkeep-1-no-farm-program' => ['infrastructure_upkeep' => '1'],
    'steady-growth' => ['infrastructure_upkeep' => '1', 'infrastructure_growth' => '0.0025'],
    'steady-growth-09' => ['infrastructure_upkeep' => '0.9', 'infrastructure_growth' => '0.0025'],
];
$selected = $argv[1] ?? null; $seasons = (int) ($argv[2] ?? 60); $case = $argv[3] ?? 'founding';
$artillery = (int) ($argv[4] ?? 0);
foreach ($variants as $name => $overrides) {
    if ($selected !== null && $selected !== $name) continue;
    $input = $case === 'founding' ? $founding : $fixture;
    if (in_array($name, ['upkeep-1-no-farm-program', 'steady-growth', 'steady-growth-09'], true)) $input['settings']['production.development_funding']['food'] = '0';
    $state = $input['state']; $firstDebt = $firstShortage = null; $minDelta = INF;
    for ($n = 1; $n <= $seasons; ++$n) {
        $military = $n >= 11 ? ['public_payroll' => (string) $artillery] : [];
        if ($n === 11 && $artillery > 0) $military += ['committed_payroll' => (string) (4 * $artillery), 'committed_goods' => ['ore' => (string) $artillery]];
        $r = Season::resolve($resources, $state, $military + ['settings' => $input['settings'], 'acquisitions' => $input['acquisitions'],
            'release_limits' => ['food' => $state['inventories']['government']['food']['quantity']]], $overrides + $fixture['rules']);
        $p = $r['report']; $c = $p['civilian'];
        $delta = (float) $p['closing_treasury'] - (float) $p['opening_treasury'];
        $minDelta = min($minDelta, $delta);
        if ($firstDebt === null && Q::cmp($p['fiscal']['closing_debt'], '0') > 0) $firstDebt = $n;
        if ($firstShortage === null && $r['warnings']) $firstShortage = [$n, $r['warnings']];
        if (in_array($n, [1, 10, 20, 30, 40, 60, 80, 100], true) || $n === $seasons)
            echo json_encode(['variant' => $name, 'case' => $case, 'artillery_after_season_10' => $artillery, 'season' => $n, 'treasury' => $p['closing_treasury'],
                'delta' => round($delta, 6), 'household' => $c['household_cash'], 'producer' => $c['producer_cash'],
                'debt' => $p['fiscal']['closing_debt'], 'first_debt' => $firstDebt, 'first_warning' => $firstShortage,
                'warnings' => $r['warnings'], 'population' => $p['population'],
                'constraints' => array_filter(array_map(fn ($row) => $row['constraints'], $r['resources']))]).PHP_EOL;
        $state = $r['state']; $growth = .01 * Agriculture::growthMultiplier($r['resources']['food'], []);
        foreach ($state['territories'] as $id => &$t) {
            $t['population'] = min($fixture['population_caps'][$id], (int) floor($t['population'] * (1 + $growth)));
            $t['workforce'] = (string) $t['population'];
        }
        unset($t);
    }
}

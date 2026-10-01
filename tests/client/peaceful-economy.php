<?php
require __DIR__ . '/../../vendor/autoload.php';
use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Resources\{Agriculture, Quantity as Q};
use App\Services\Policies\{PolicyRules, PolicyEffectRegistry};
use App\Services\Resources\ResourceCatalogue;

$resources = array_column(json_decode(file_get_contents(__DIR__.'/../../database/resource-templates/foundation.json'), true, flags: JSON_THROW_ON_ERROR)['resources'], null, 'key');
// Compile actual founding defaults so a stale fixture cannot hide a bad starting policy.
$policies = array_column(json_decode(file_get_contents(__DIR__.'/../../database/policy-templates/economy.json'), true, flags: JSON_THROW_ON_ERROR)['policies'], null, 'key');
$settings = (new PolicyEffectRegistry)->compile($policies, (new PolicyRules)->defaults($policies), new ResourceCatalogue([], $resources, []));
$checks = 0;
$check = function ($ok, $why) use (&$checks) { ++$checks; if (!$ok) throw new RuntimeException($why); };
$cash = fn ($s) => array_reduce($s['accounts'], fn ($sum, $a) => Q::add($sum, Q::parse($a['cash'])), '0.000000');
foreach (['peaceful-founding'=>24, 'fertile-founding'=>12] as $homeland => $seasons) {
    $input = json_decode(file_get_contents(__DIR__.'/fixtures/production-accounting/'.$homeland.'.json'), true, flags: JSON_THROW_ON_ERROR);
    $state = $input['state'];
    $openingCash = $cash($state);
    $check(array_sum(array_column($state['territories'], 'population')) === 5000000, 'Equal one-million founding populations');
    foreach (range(1, $seasons) as $season) {
        $r = Season::resolve($resources, $state, ['settings'=>$settings, 'acquisitions'=>$input['acquisitions'],
            'release_limits'=>['food'=>$state['inventories']['government']['food']['quantity'] ?? '0']]);
        $report = $r['report'];
        $check($r['resources']['food']['civilian']['unmet'] === '0.000000', "Season $season feeds civilians");
        $check($report['fiscal']['closing_debt'] === '0.000000', "Season $season needs no borrowing");
        $check(!array_intersect(['food_shortage','maintenance_shortfall','default'], array_column($r['warnings'], 'type')), "Season $season preserves basic conditions");
        $check($cash($r['state']) === $openingCash, "Season $season conserves all counterparties' cash");
        if ($season <= 3) $check(Q::cmp($report['closing_treasury'], $report['opening_treasury']) > 0, 'Ordinary peaceful opening has a surplus');
        $state = $r['state'];
        // Deliberately keep population growing without the live game's terrain population cap.
        // This is a bounded resolver stress test; lifecycle tests separately exercise real turns.
        $growth = .01 * Agriculture::growthMultiplier($r['resources']['food'], []);
        foreach ($state['territories'] as &$t) { $t['population'] = (int) floor($t['population'] * (1 + $growth)); $t['workforce'] = (string) $t['population']; } unset($t);
    }
    $check(Q::cmp($report['closing_treasury'], '15') > 0, 'Opening test period leaves a usable treasury');
    echo $homeland.': closing treasury '.$report['closing_treasury']."; debt ".$report['fiscal']['closing_debt']."\n";
}
echo "PASS: $checks peaceful-opening checks across two homelands; actual policy defaults, unchanged five-million starts, 24 modest-land seasons and 12 fertile-land seasons with food, maintenance, no debt and conserved cash.\n";

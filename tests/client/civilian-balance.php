<?php
require __DIR__ . '/../../vendor/autoload.php';

use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Resources\{Agriculture, Quantity as Q};
use App\Services\Policies\{PolicyRules, PolicyEffectRegistry};
use App\Services\Resources\ResourceCatalogue;

$current = json_decode(file_get_contents(__DIR__ . '/fixtures/production-accounting/civilian-deficit.json'), true, flags: JSON_THROW_ON_ERROR);
$founding = json_decode(file_get_contents(__DIR__ . '/fixtures/production-accounting/civilian-homeland.json'), true, flags: JSON_THROW_ON_ERROR)['founding'];
$resources = array_column(json_decode(file_get_contents(__DIR__ . '/../../database/resource-templates/civilian.json'), true, flags: JSON_THROW_ON_ERROR)['resources'], null, 'key');
$policies = array_column(json_decode(file_get_contents(__DIR__ . '/../../database/policy-templates/economy.json'), true, flags: JSON_THROW_ON_ERROR)['policies'], null, 'key');
$founding['settings'] = (new PolicyEffectRegistry)->compile($policies, (new PolicyRules)->defaults($policies), new ResourceCatalogue([], $resources, []));
$checks = 0;
$check = function ($ok, $why) use (&$checks) { ++$checks; if (!$ok) throw new RuntimeException($why); };
$cash = fn ($s) => array_reduce($s['accounts'], fn ($sum, $a) => Q::add($sum, Q::parse($a['cash'])), '0.000000');
$plan = fn ($input, $state) => ['settings' => $input['settings'], 'acquisitions' => $input['acquisitions'],
    'release_limits' => ['food' => $state['inventories']['government']['food']['quantity']]];

// The historical failure remains reproducible; tests may not hide it by editing the snapshot.
$old = Season::resolve($resources, $current['state'], $plan($current, $current['state']), $current['rules']);
$check(Q::cmp($old['report']['closing_treasury'], $old['report']['opening_treasury']) < 0, 'Historical peaceful deficit no longer reproduced.');
$check($old['report']['public_payroll_requested'] === '0.000000' && $old['report']['command_costs'] === '0.000000', 'Historical deficit must have no army costs.');

foreach (['founding' => 80, 'current' => 60] as $case => $seasons) {
    $input = $case === 'founding' ? $founding : $current;
    // The authorized existing-game calibration stops the optional farm program,
    // preserving its player's tax rate and all essential-service funding.
    if ($case === 'current') $input['settings']['production.development_funding']['food'] = '0';
    $state = $input['state']; $openingCash = $cash($state); $minimumSurplus = null; $oreLimitedSeasons = 0;
    for ($season = 1; $season <= $seasons; ++$season) {
        // New-game behavior defaults; the calibrated policy package stays fixed
        // throughout the run. No injected money or stocks.
        $r = Season::resolve($resources, $state, $plan($input, $state));
        $p = $r['report']; $c = $p['civilian'];
        $surplus = Q::sub($p['closing_treasury'], $p['opening_treasury']);
        // Guarantee an opening runway, not infinite cash extraction from a closed
        // domestic money pool. Later population growth may flatten/reverse a turn's
        // surplus; the extended run must still preserve reserves, solvency and supply.
        if ($season <= 40) {
            $minimumSurplus = $minimumSurplus === null ? $surplus : Q::min($minimumSurplus, $surplus);
            $check(Q::cmp($surplus, '0') > 0, "$case/$season has no peaceful opening surplus.");
        }
        $check(Q::cmp($p['closing_treasury'], $input['state']['accounts']['government']['cash']) > 0, "$case/$season depleted the starting treasury.");
        $check($p['fiscal']['borrowing'] === '0.000000' && $p['fiscal']['closing_debt'] === '0.000000', "$case/$season surplus is funded by borrowing.");
        // The extended current-game run reaches its finite ore ceiling. Previously
        // goods consumed maintenance's ore first, hiding the limit by drawing down
        // equipment reserves. Accept only that physical consumer-goods boundary,
        // never food, maintenance, affordability, infrastructure or fiscal failure.
        $oreLimited = $case === 'current' && $season > 40
            && Q::cmp($r['resources']['ore']['industrial_requested'], $r['resources']['ore']['production']['producer']) > 0
            && in_array('installed_capacity', $r['resources']['ore']['constraints'], true)
            && in_array('input:ore', $r['resources']['household_goods']['constraints'], true)
            && $r['resources']['household_goods']['civilian']['unaffordable'] === '0.000000'
            && Q::cmp($r['resources']['household_goods']['civilian']['unmet'], '0') > 0;
        if ($oreLimited) ++$oreLimitedSeasons;
        $check($r['warnings'] === ($oreLimited ? [['type' => 'civilian_shortage', 'resource' => 'household_goods']] : []), "$case/$season sacrificed services or supplies to balance the budget.");
        $check($cash($r['state']) === $openingCash, "$case/$season minted or lost money.");
        $check(Q::add(Q::sub($p['opening_treasury'], $p['treasury_outflows']), $p['treasury_inflows']) === $p['closing_treasury'], "$case/$season treasury does not reconcile.");
        $check($r['resources']['food']['civilian']['unmet'] === '0.000000', "$case/$season unmet food.");
        $check($oreLimited || $r['resources']['household_goods']['civilian']['unmet'] === '0.000000', "$case/$season unexplained unmet household goods.");
        $check($c['maintenance_delivered'] === $c['maintenance_required'], "$case/$season productive maintenance incomplete.");
        foreach ($p['infrastructure'] as $row) {
            $check($row['maintenance_paid'] === $row['maintenance'], "$case/$season infrastructure upkeep incomplete.");
            $check($row['improvement_paid'] === $row['improvement'], "$case/$season automatic improvements cut.");
        }
        $check(Q::cmp($c['workers_used'], $c['workforce']) <= 0, "$case/$season workforce exceeded.");
        foreach ($r['state']['accounts'] as $account) $check(Q::cmp($account['cash'], '0') >= 0, "$case/$season negative counterparty cash.");
        if ($season === 1 || $season === $seasons) $check($r === Season::resolve($resources, $state, $plan($input, $state)), "$case/$season unstable forecast.");
        $state = $r['state']; $growth = .01 * Agriculture::growthMultiplier($r['resources']['food'], []);
        foreach ($state['territories'] as $id => &$t) {
            $t['population'] = min($current['population_caps'][$id], (int) floor($t['population'] * (1 + $growth)));
            $t['workforce'] = (string) $t['population'];
        }
        unset($t);
    }
    echo "$case: 40 consecutive opening surpluses (minimum $minimumSurplus); $seasons solvent seasons with full food/upkeep; $oreLimitedSeasons ore-limited consumer-goods seasons; closing treasury {$p['closing_treasury']}.\n";
}
echo "PASS: $checks peaceful fiscal-balance checks.\n";

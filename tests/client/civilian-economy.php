<?php

declare(strict_types=1);

require __DIR__ . '/../../vendor/autoload.php';

use App\Domain\Economy\{CivilianEconomySeason as Season, ProductionAccounts as Accounts};
use App\Domain\Resources\Quantity as Q;

$fixtures = require __DIR__ . '/fixtures/civilian-economy/scenarios.php';
$checks = 0;
$check = static function (bool $ok, string $why) use (&$checks): void {
    ++$checks;
    if (!$ok) throw new RuntimeException($why);
};
$eq = static fn ($a, $b, $why) => $check($a === $b, $why . ': ' . json_encode([$a, $b]));
$amount = static fn ($a, $b, $why) => $check(Q::cmp($a, $b) === 0, $why . ': ' . json_encode([$a, $b]));
$throws = static function (callable $call, string $why) use ($check): void {
    try { $call(); } catch (DomainException | \Illuminate\Validation\ValidationException $e) { $check(true, $why); return; }
    $check(false, $why);
};
$sum = static fn ($values) => array_reduce($values, static fn ($a, $b) => Q::add($a, $b), '0.000000');
$stockTotal = static function (array $state, string $resource) use ($sum): string {
    return $sum(array_map(static fn ($stocks) => $stocks[$resource]['quantity'] ?? '0', $state['inventories'] ?? []));
};
$resolve = static fn ($f, $s = null) => Season::resolve($f['resources'], $s ?? $f['state'], $f['policy'], $f['rules']);
$history = [];
foreach ($fixtures as $name => $f) {
    $state = $f['state']; $openingCash = $sum(array_column($state['accounts'], 'cash'));
    for ($season = 1; $season <= 80; ++$season) {
        if ($shock = $f['shocks'][$season] ?? null) $state['sites'][$shock['site']]['availability'] = $shock['availability'];
        $before = $state;
        $result = $resolve($f, $state); $report = $result['report'];
        $eq($state, $before, "$name/$season: preview does not mutate caller state");
        $eq($report['total_cash'], $openingCash, "$name/$season: exact money conservation");
        $eq($report['population'], 100, "$name/$season: fixed population");
        $check(Q::cmp($report['workers_used'], $report['workforce']) <= 0, "$name/$season: finite shared workforce");
        $check(Q::cmp($report['support_paid'], $report['support_requested']) <= 0, "$name/$season: no overpayment of support");
        $workers = '0.000000';
        foreach ($result['events'] as $event) {
            if ($event['type'] === 'production') {
                $rate = ($event['activity'] ?? null) === 'subsistence' ? $state['territories']['region']['subsistence'][$event['resource']]['workers'] : $f['resources'][$event['resource']]['workers'];
                $workers = Q::add($workers, Q::mul($event['quantity'], $rate));
            }
            if ($event['type'] === 'maintenance') $workers = Q::add($workers, Q::mul($event['quantity'], $f['rules']['maintenance_workers']));
            if ($event['type'] === 'service_work') $workers = Q::add($workers, $event['quantity']);
        }
        $eq(array_intersect(['loan', 'investment'], array_column($result['events'], 'type')), [], "$name/$season: no external finance or growth");
        $amount($workers, $report['workers_used'], "$name/$season: labor reconstructs from actual activity");
        foreach ($f['resources'] as $resource => $_) {
            $quantity = $stockTotal($state, $resource);
            foreach ($result['events'] as $event) if (($event['resource'] ?? null) === $resource) {
                if ($event['type'] === 'production') $quantity = Q::add($quantity, $event['quantity']);
                if ($event['type'] === 'consumption') $quantity = Q::sub($quantity, $event['quantity']);
            }
            $eq($quantity, $stockTotal($result['state'], $resource), "$name/$season: $resource physical conservation");
        }
        foreach ($report['sites'] as $id => $site) {
            $amount($site['installed_capacity'], $f['state']['sites'][$id]['capacity'], "$name/$season: assets never reseeded or expanded");
            $check(Q::cmp($site['produced'], $site['effective_capacity']) <= 0, "$name/$season: output bounded by condition/capacity");
            $check(Q::cmp($site['closing_condition'], '0') >= 0 && Q::cmp($site['closing_condition'], '1') <= 0, "$name/$season: condition bounded");
        }
        foreach ($report['consumption'] as $use) {
            $amount(Q::add($use['fulfilled'], $use['unmet']), $use['requested'], "$name/$season: needs reconcile");
            $amount(Q::add($use['unaffordable'], $use['funded_unavailable']), $use['unmet'], "$name/$season: purchasing-power versus supply causes reconcile");
        }
        $amount(Q::sub($report['accounts']['government'], Q::parse($state['accounts']['government']['cash'])), $report['treasury_change'], "$name/$season: treasury report reconciles");
        if (in_array($name, ['supplied', 'subsistence'], true)) $eq($report['issues'], [], "$name/$season: civilian life and upkeep remain supplied");
        if ($season === 6 || $season === 14) $eq($result, $resolve($f, $state), "$name/$season: exact rollback/replay");
        $history[$name][$season] = $result;
        $state = $result['state'];
    }
    echo "$name: 80 seasons; closing treasury {$report['accounts']['government']}; food {$report['consumption']['food']['fulfilled']}/100; goods {$report['consumption']['household_goods']['fulfilled']}/10.\n";
}

$base = $fixtures['supplied'];
$steady = $history['supplied'][80];
$amount($steady['report']['sites']['mine']['produced'], '6', 'Civilian goods and replacement equipment sustain six copper units');
$amount($steady['report']['sites']['machine_shop']['produced'], '2', 'Existing assets sustain equipment replacement without investment');
$amount($steady['report']['treasury_change'], '0', 'Explicit baseline fiscal choices support a stationary circulation');
$eq($history['supplied'][40]['state']['accounts'], $steady['state']['accounts'], 'Steady accounts do not depend on continued depletion of opening cash');
$eq($history['supplied'][40]['state']['inventories'], $steady['state']['inventories'], 'Steady inventories do not depend on depletion of founding goods');
$amount($history['subsistence'][80]['report']['subsistence'], '70', 'Poor region uses its local subsistence ceiling');
$amount($history['subsistence'][80]['report']['consumption']['food']['purchased'], '30', 'Subsistence offsets market food demand');
$check(Q::cmp($history['subsistence'][80]['report']['workers_used'], $steady['report']['workers_used']) > 0, 'Subsistence-heavy livelihood uses more worker time in this fixture');
$amount($history['supply-shock'][8]['report']['sites']['mine']['produced'], '0', 'Outage stops extraction');
$check(in_array('availability', $history['supply-shock'][8]['report']['sites']['mine']['constraints'], true), 'Outage reason is visible');
$check(Q::cmp($history['supply-shock'][9]['report']['consumption']['household_goods']['unmet'], '0') > 0, 'Copper outage reaches civilian goods with supply-chain delay');
$check(Q::cmp($history['supply-shock'][15]['report']['sites']['farm']['closing_condition'], '1') < 0, 'Missing equipment damages agricultural capacity condition');
$eq($history['supply-shock'][40]['report']['issues'], [], 'Supply and maintenance recover without reseeding');
$amount($history['supply-shock'][80]['report']['sites']['farm']['closing_condition'], '1', 'Funded maintenance restores condition');
$check(Q::cmp($history['high-tax'][80]['report']['consumption']['food']['unaffordable'], '0') > 0, 'High tax with unchanged spending exposes purchasing-power failure');
$check(Q::cmp($history['high-tax'][80]['report']['accounts']['government'], $steady['report']['accounts']['government']) > 0, 'Treasury wealth is distinct from household wellbeing');
$amount($history['overbudget'][1]['report']['support_paid'], '400', 'Unaffordable support is capped by opening treasury');
$amount($history['overbudget'][1]['report']['public_services_delivered'], '0', 'Unfunded services have no fictitious delivery');
$amount($history['overbudget'][80]['report']['support_paid'], '26', 'Later support spends carried tax receipts, not a renewed opening gift');

// Serialization and enumeration must not select winners accidentally.
$reversed = $base;
foreach (['accounts', 'sites'] as $field) $reversed['state'][$field] = array_reverse($reversed['state'][$field], true);
$reversed['resources'] = array_reverse($reversed['resources'], true);
$eq($resolve($base), $resolve($reversed), 'Input enumeration has no effect');
$snapshot = json_decode(json_encode($history['supply-shock'][16]['state'], JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
$eq($resolve($base, $snapshot), $resolve($base, $history['supply-shock'][16]['state']), 'JSON snapshot replay is exact');

// Scarcity and extreme budgets are behavior, not validation errors or implicit bailouts.
$scarce = $base; $scarce['state']['territories']['region']['workforce'] = '3';
$r = $resolve($scarce);
$amount($r['report']['subsistence'], '15', 'Three worker-seasons cap own-use food');
$amount($r['report']['workers_used'], '3', 'Subsistence leaves no duplicated paid workforce');
$amount($r['report']['wages'], '0', 'No wages are invented when no paid work occurs');
$empty = $base; foreach ($empty['state']['accounts'] as &$account) $account['cash'] = '0'; unset($account);
$r = $resolve($empty);
$amount($r['report']['total_cash'], '0', 'Zero money does not cause a top-up');
$amount($r['report']['consumption']['food']['fulfilled'], '20', 'Own-use food survives cash starvation');
$amount($r['report']['public_services_delivered'], '0', 'No free public services');
$poorCap = $base; $poorCap['state']['territories']['region']['subsistence']['food']['capacity'] = '5';
$r = $resolve($poorCap); $amount($r['report']['subsistence'], '5', 'Subsistence cannot exceed geography');
$check(Q::cmp($r['report']['consumption']['food']['market_requested'], '80') > 0, 'Lost subsistence increases market food need');

// Policy/funding and labor sensitivity must stay bounded even when the outcome is poor.
foreach (['0', '0.05', '0.2', '0.5', '1'] as $taxRate) foreach (['0', '12', '80'] as $workforce) {
    $f = $base; $f['policy']['tax_rate'] = $taxRate; $f['state']['territories']['region']['workforce'] = $workforce;
    $state = $f['state'];
    for ($season = 1; $season <= 12; ++$season) {
        $r = $resolve($f, $state);
        $eq($r['report']['total_cash'], '1500.000000', "Sensitivity $taxRate/$workforce/$season conserves cash");
        $check(Q::cmp($r['report']['workers_used'], $workforce) <= 0, "Sensitivity $taxRate/$workforce/$season respects labor");
        $state = $r['state'];
    }
}

// Resource keys are identities, not branches encoding copper or food behavior.
$renamed = $base;
foreach (['resources'] as $field) { $renamed[$field]['metal'] = $renamed[$field]['copper']; unset($renamed[$field]['copper']); }
foreach ($renamed['resources'] as &$resource) if (isset($resource['inputs']['copper'])) { $resource['inputs']['metal'] = $resource['inputs']['copper']; unset($resource['inputs']['copper']); } unset($resource);
$renamed['state']['sites']['mine']['resource'] = 'metal';
$renamed['state']['territories']['region']['potential']['metal'] = '20'; unset($renamed['state']['territories']['region']['potential']['copper']);
foreach ($renamed['state']['inventories'] as &$stocks) if (isset($stocks['copper'])) { $stocks['metal'] = $stocks['copper']; unset($stocks['copper']); } unset($stocks);
$r = $resolve($renamed, null);
$eq($r['report']['accounts'], $resolve($base)['report']['accounts'], 'Renaming an intermediate preserves financial behavior');

// Bad shapes/identities/recipes must fail before producing a returned snapshot.
foreach (['negative-tax', 'high-tax', 'unknown-policy', 'bad-input', 'cycle', 'bad-population', 'extra-region', 'bad-condition', 'bad-owner', 'negative-capacity'] as $case) {
    $f = $base;
    switch ($case) {
        case 'negative-tax': $f['policy']['tax_rate'] = '-0.1'; break;
        case 'high-tax': $f['policy']['tax_rate'] = '1.1'; break;
        case 'unknown-policy': $f['policy']['free_money'] = '1'; break;
        case 'bad-input': $f['resources']['equipment']['inputs'] = ['missing' => '1']; break;
        case 'cycle': $f['resources']['copper']['inputs'] = ['equipment' => '1']; break;
        case 'bad-population': $f['state']['territories']['region']['population'] = 1; break;
        case 'extra-region': $f['state']['territories']['other'] = $f['state']['territories']['region']; break;
        case 'bad-condition': $f['state']['sites']['mine']['condition'] = '2'; break;
        case 'bad-owner': $f['state']['sites']['mine']['owner'] = 'households'; break;
        case 'negative-capacity': $f['state']['sites']['mine']['capacity'] = '-1'; break;
    }
    $throws(fn () => $resolve($f), "$case is rejected");
}

// Shared ledger contracts independently exercise the new mechanisms, including atomic rollback.
$ledgerState = $base['state'];
foreach ($ledgerState['sites'] as $site) $ledgerState['territories']['region']['capacity'][$site['owner']][$site['resource']] = $site['capacity'];
$ledgerState['territories']['region']['background_capacity']['government'] = '10';
$ledgerState['inventories']['machine_shop']['equipment'] = ['quantity' => '0', 'cost' => '0'];
$a = new Accounts($base['resources'], $ledgerState);
$amount($a->produce('region', 'machine_shop', 'equipment', '10', 'households'), '2', 'Manufacturing is capped by owned copper');
$amount($a->inventory('machine_shop', 'equipment')['cost'], '10', 'Input purchase cost and wages enter output cost once');
$amount($a->inventory('machine_shop', 'copper')['quantity'], '0', 'Manufacturing physically consumes copper');
$amount($a->produce('region', 'machine_shop', 'equipment', '10', 'households'), '0', 'Consumed inputs cannot be reused');
$throws(fn () => $a->purchaseInputs('machine_shop', 'mine', 'copper', '1'), 'Work cannot restart opening input trade');
$a->close();

$a = new Accounts($base['resources'], $ledgerState);
$before = $a->position();
$throws(fn () => $a->produce('region', 'machine_shop', 'equipment', '1', 'missing'), 'Invalid wage recipient rolls back input consumption');
$eq($a->position(), $before, 'Failed manufacture is atomic');
$amount($a->purchaseInputs('machine_shop', 'mine', 'copper', '1'), '1', 'Failed work also restores opening phase');
$a->close();

$a = new Accounts($base['resources'], $ledgerState);
$amount($a->subsist('region', 'households', 'food', '100'), '20', 'Subsistence bounded by local ceiling');
$amount($a->subsist('region', 'households', 'food', '100'), '0', 'Repeated subsistence calls cannot replenish capacity');
$r = $a->close();
$amount($sum(array_column($r['state']['accounts'], 'cash')), '1500', 'Subsistence has no monetary income');
$amount($r['used_workers']['region'], '4', 'Own-use production consumes labor');

$a = new Accounts($base['resources'], $ledgerState);
$amount($a->prepareService('region', 'government', '2', '2', 'households'), '2', 'Public service pays wages for work');
$amount($a->deliverPublicService('region', 'government', '10'), '2', 'Public delivery is capped by funded work');
$amount($a->deliverPublicService('region', 'government', '10'), '0', 'Public service cannot be delivered twice');
$r = $a->close();
$eq(count(array_filter($r['events'], fn ($e) => $e['type'] === 'service_sale')), 0, 'Public provision invents no service sale');

$sameOwner = $ledgerState;
$sameOwner['territories']['region']['capacity']['machine_shop']['copper'] = '20';
unset($sameOwner['territories']['region']['capacity']['mine']['copper']);
$sameOwner['inventories']['machine_shop']['copper'] = ['quantity' => '0', 'cost' => '0'];
$a = new Accounts($base['resources'], $sameOwner);
$amount($a->produce('region', 'machine_shop', 'copper', '2', 'households'), '2', 'Integrated owner extracts copper');
$amount($a->produce('region', 'machine_shop', 'equipment', '2', 'households'), '0', 'Common ownership cannot bypass the input delay');
$a->close();

// Fractional input bases are consumed exactly, including the final cost remainder.
$fractional = $ledgerState;
$fractional['inventories']['machine_shop']['copper'] = ['quantity' => '0.000003', 'cost' => '0.000011'];
$a = new Accounts($base['resources'], $fractional);
$amount($a->produce('region', 'machine_shop', 'equipment', '0.000006', 'households'), '0.000006', 'Fractional recipe output');
$amount($a->inventory('machine_shop', 'equipment')['cost'], '0.000029', 'Fractional output includes exact exhausted input basis');
$a->close();

echo "PASS: $checks civilian-economy checks; five 80-season scenarios, physical/cash/labor accounting, recovery, purchasing-power failure, finite subsistence, input timing and replay.\n";

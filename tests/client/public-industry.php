<?php
require __DIR__ . '/../../vendor/autoload.php';

use App\Domain\Economy\ProductionEconomySeason as Season;
use App\Domain\Resources\Quantity as Q;
use App\Services\Policies\PublicInvestmentPolicies;

$f = json_decode(file_get_contents(__DIR__ . '/fixtures/production-accounting/civilian-maintenance-crisis.json'), true, flags: JSON_THROW_ON_ERROR);
$input = $f['cases']['before_shortage']; $state = $input['state']; $plan = $input['plan'];
$checks = 0;
$check = function ($ok, $why) use (&$checks) { ++$checks; if (!$ok) throw new RuntimeException($why); };
$cash = fn ($s) => array_reduce($s['accounts'], fn ($sum, $a) => Q::add($sum, $a['cash']), '0.000000');
$resolve = fn ($s, $p = null) => Season::resolve($f['resources'], $s, $p ?? $plan, $f['rules']);
$state['inventories']['producer']['ore'] = ['quantity' => '0.3', 'cost' => '0.3'];
$r = $resolve($state); $ore = $r['resources']['ore'];
$check(Q::cmp($ore['public_industry_delivery'], '0') > 0, 'Idle public ore supplies civilian industry without a state order');
$check($ore['public_industry_revenue'] === Q::mul($ore['public_industry_delivery'], $ore['price']), 'Factories pay the reference price');
$check($ore['government_closing'] === Q::parse($state['inventories']['government']['ore']['quantity']), 'Opening state reserves are not sold');
$check($ore['public_delivery'] === '0.000000', 'Industry sale is not a government acquisition');
$check($cash($r['state']) === $cash($state), 'Industry purchases conserve cash');
$check($r === $resolve($state), 'Public/private forecast is deterministic');
$sales = array_filter($r['events'], fn ($e) => $e['type'] === 'sale' && $e['seller'] === 'government' && $e['buyer'] === 'producer' && $e['resource'] === 'ore');
$check(count($sales) === 1 && array_values($sales)[0]['revenue'] === $ore['public_industry_revenue'], 'Sale has an explicit paying counterparty');
$without = $state;
foreach ($without['territories'] as &$t) $t['productive_condition']['government']['ore'] = '0';
unset($t);
$baseline = $resolve($without);
$check($r['resources']['household_goods']['production']['producer'] === $baseline['resources']['household_goods']['production']['producer'], 'Newly bought ore cannot bypass opening-input timing');
$next = $resolve($r['state']); $baselineNext = $resolve($baseline['state']);
$check(Q::cmp($next['resources']['household_goods']['production']['producer'], $baselineNext['resources']['household_goods']['production']['producer']) > 0, 'Public ore improves consumer-goods output next season');

$protectedPlan = $plan;
$protectedPlan['committed_goods']['ore'] = '0.1';
$protectedPlan['military']['ore'] = '0.5';
$protectedPlan['acquisitions']['ore'] = ['quantity' => '0.01', 'spending_limit' => '0.02', 'priority' => 0];
$protected = $resolve($state, $protectedPlan); $o = $protected['resources']['ore'];
$check($o['military_fulfilled'] === '0.500000', 'Military opening commitments are served');
$check($o['public_delivery'] === '0.010000', 'Funded state procurement remains separate');
$check($o['government_closing'] === '0.410000', 'No reserve leakage or double-counted public delivery');
$check(Q::cmp($o['public_industry_delivery'], '0') > 0, 'Remaining public capacity still supplies industry');

$poor = $state; $poor['accounts']['producer']['cash'] = '0';
$check($resolve($poor)['resources']['ore']['public_industry_planned'] === '0.000000', 'No unfunded private purchases');
$poor = $state; $poor['accounts']['government']['cash'] = '0'; $poor['fiscal']['receipts'] = [];
$check($resolve($poor)['resources']['ore']['public_industry_delivery'] === '0.000000', 'Public production needs real operating funds');
$noWorkers = $state;
foreach ($noWorkers['territories'] as &$t) $t['workforce'] = '0';
unset($t);
$check($resolve($noWorkers)['resources']['ore']['public_industry_delivery'] === '0.000000', 'Public industry cannot invent workers');

// New construction stays opt-in, respects institutional permissions and is delayed.
$expand = $plan; $expand['settings']['production.development_funding']['ore'] = '1';
$built = $resolve($state, $expand);
$check(Q::cmp($built['resources']['ore']['development']['government'], '0') > 0, 'Player-funded public ore capacity can expand');
$check($built['resources']['ore']['production']['government'] === $r['resources']['ore']['production']['government'], 'Expansion cannot produce in its construction season');
$expand['investors'] = ['producer'];
$check($resolve($state, $expand)['resources']['ore']['development']['government'] === '0.000000', 'Private-only policy blocks new public investment');

$document = json_decode(file_get_contents(__DIR__ . '/../../database/policy-templates/economy.json'), true, flags: JSON_THROW_ON_ERROR);
$expanded = PublicInvestmentPolicies::appendMissing($document, $f['resources']);
$check(PublicInvestmentPolicies::appendMissing($expanded, $f['resources']) === $expanded, 'Policy installation is additive and idempotent');
$added = array_slice($expanded['policies'], count($document['policies']));
$check(count($added) === 5, 'All non-food stock resources get public investment controls; existing food policy is retained');
foreach ($added as $p) $check($p['parameters'][0]['default_value'] === '0.00', 'No unsolicited construction spending');
$custom = $f['resources']; $custom['copper_wire'] = $custom['ore']; unset($custom['ore']);
$customDocument = PublicInvestmentPolicies::appendMissing($document, $custom);
$check(in_array('public_investment_copper_wire', array_column($customDocument['policies'], 'key'), true), 'Public investment follows arbitrary catalogue identity');
echo "PASS: $checks public/private supply and investment checks.\n";

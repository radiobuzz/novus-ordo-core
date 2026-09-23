<?php
// Pure policy contract: no application bootstrap, model queries or database.
require __DIR__ . '/../../vendor/autoload.php';
use ExperimentalAI\V1Experimental;
$check = function ($value, $message) { if (!$value) throw new RuntimeException($message); };
$world = [
    ['id' => 1, 'name' => 'Home', 'owner' => 1, 'water' => false, 'terrain' => 'Plain', 'sea' => false, 'population' => 10000000, 'loyalty' => 1, 'can_deploy' => true, 'connections' => [2, 3], 'land_connections' => [2, 3]],
    ['id' => 2, 'name' => 'Neutral', 'owner' => null, 'water' => false, 'terrain' => 'Plain', 'sea' => false, 'population' => null, 'loyalty' => 0, 'can_deploy' => false, 'connections' => [1], 'land_connections' => [1]],
    ['id' => 3, 'name' => 'Human', 'owner' => 9, 'water' => false, 'terrain' => 'Plain', 'sea' => false, 'population' => 1000000, 'loyalty' => 1, 'can_deploy' => false, 'connections' => [1], 'land_connections' => [1]],
];
$view = ['nation_id' => 1, 'turn_number' => 30, 'territories' => $world,
    'divisions' => array_map(fn ($id) => ['id' => $id, 'type' => $id <= 2 ? 'Infantry' : 'Artillery', 'territory_id' => 1], range(1, 7)),
    'deployments' => [], 'budget' => ['max_recruitement_pool_expansion' => 0],
    'planning' => ['resources' => ['Food' => ['upkeep' => 5000000, 'stock' => 15000000], 'Ore' => ['stock' => 10000000]]],
    'pools' => [], 'production_raw' => [], 'opponents' => [9 => ['army' => 5, 'territories' => 5]], 'human_ids' => [9],
    'definitions' => ['Infantry' => ['attack_power' => 15], 'Artillery' => ['attack_power' => 30]]];
$forecast = fn () => ['Capital' => ['closing' => 20000000, 'balance' => 5000000],
    'Food' => ['closing' => 15000000, 'balance' => 0], 'Ore' => ['closing' => 10000000, 'balance' => 0]];
$settings = ['aggression' => 50, 'seed' => 'pure-test', 'protect_humans' => true];
$policy = new V1Experimental;
$plan = $policy->decide($view, [], $settings, $forecast);
$check(count($plan['orders']) === 7 && $plan['memory']['state'] === 'Attack', 'Seven-division neutral baseline did not attack together');
$check(count(array_filter($plan['orders'], fn ($o) => $o['destination_territory_id'] !== 2)) === 0, 'Split attack or human protection violation');
$check($plan === $policy->decide($view, [], $settings, $forecast), 'Fixed inputs are not deterministic');
$cautious = $policy->decide($view, [], [...$settings, 'aggression' => 20], $forecast);
$check(!$cautious['orders'], 'Cautious bot did not wait for stronger force');
$failed = $policy->decide($view, ['target' => 2, 'last_attack_turn' => 29], $settings, $forecast);
$check(!$failed['orders'] && $failed['memory']['required_power'] > 180, 'Repeated losing attack did not adapt');
$defense = $policy->decide([...$view, 'recent_attacks' => [1]], [], $settings, $forecast);
$check($defense['memory']['state'] === 'Defend' && !$defense['orders'], 'Recent attack did not keep defensive Infantry');
$warWorld = $world; $warWorld[1]['owner'] = 1;
$war = $policy->decide([...$view, 'turn_number' => 100, 'territories' => $warWorld], [], [...$settings, 'protect_humans' => false, 'aggression' => 85], $forecast);
$check($war['memory']['target'] === 3, 'Aggressive nation did not eventually target an opponent');

// Naval reach does not erase geography: local neutrals lead, while seeded land focus can prefer unification.
$regionalWorld = [
    ['id' => 10, 'name' => 'Core', 'owner' => 1, 'water' => false, 'terrain' => 'Plain', 'sea' => true, 'population' => 10000000, 'loyalty' => 1, 'can_deploy' => true, 'connections' => [11, 12], 'land_connections' => [11, 12]],
    ['id' => 11, 'name' => 'Local neutral', 'owner' => null, 'water' => false, 'terrain' => 'Plain', 'sea' => true, 'population' => null, 'loyalty' => 0, 'can_deploy' => false, 'connections' => [10, 12], 'land_connections' => [10, 12]],
    ['id' => 12, 'name' => 'Local rival', 'owner' => 8, 'water' => false, 'terrain' => 'Plain', 'sea' => true, 'population' => 1000000, 'loyalty' => 1, 'can_deploy' => false, 'connections' => [10, 11], 'land_connections' => [10, 11]],
    ['id' => 20, 'name' => 'Overseas neutral', 'owner' => null, 'water' => false, 'terrain' => 'Plain', 'sea' => true, 'population' => null, 'loyalty' => 0, 'can_deploy' => false, 'connections' => [], 'land_connections' => []],
    ['id' => 30, 'name' => 'Overseas rival', 'owner' => 9, 'water' => false, 'terrain' => 'Plain', 'sea' => true, 'population' => 1000000, 'loyalty' => 1, 'can_deploy' => false, 'connections' => [], 'land_connections' => []],
];
$regional = [...$view, 'territories' => $regionalWorld,
    'divisions' => array_map(fn ($division) => [...$division, 'territory_id' => 10], $view['divisions']),
    'opponents' => [8 => ['army' => 5, 'territories' => 5], 9 => ['army' => 5, 'territories' => 5]], 'human_ids' => []];
$local = $policy->decide($regional, [], [...$settings, 'protect_humans' => false], $forecast);
$check($local['memory']['target'] === 11 && $local['memory']['target_reason'] === 'local-neutral', 'Local neutral growth was not the first choice');
$regional['territories'][1]['owner'] = 1;
$continental = $policy->decide($regional, ['home_landmass_anchor' => 10, 'land_focus' => 99], [...$settings, 'protect_humans' => false], $forecast);
$check($continental['memory']['target'] === 12 && $continental['memory']['target_reason'] === 'landmass-control', 'Strong land focus did not supersede overseas neutral growth');
$frontier = $policy->decide($regional, ['home_landmass_anchor' => 10, 'land_focus' => 0], [...$settings, 'protect_humans' => false], $forecast);
$check($frontier['memory']['target'] === 20 && $frontier['memory']['target_reason'] === 'neutral-expansion', 'Low land focus did not retain neutral-first expansion');
$regional['territories'][2]['owner'] = 1;
$satisfied = $policy->decide($regional, ['home_landmass_anchor' => 10], [...$settings, 'protect_humans' => false, 'aggression' => 20], $forecast);
$check($satisfied['memory']['target'] === null && $satisfied['memory']['doctrine'] === 'regional', 'Cautious regional power did not stop after controlling its landmass');
$retaliation = $policy->decide($regional, ['home_landmass_anchor' => 10, 'conflicts' => ['9' => ['score' => 80, 'last_turn' => 30]], 'conflicts_updated_turn' => 30], [...$settings, 'protect_humans' => false, 'aggression' => 20], $forecast);
$check($retaliation['memory']['target'] === 30 && $retaliation['memory']['target_reason'] === 'conflict', 'Cautious nation ignored an active external conflict');
$conqueror = $policy->decide($regional, ['home_landmass_anchor' => 10], [...$settings, 'protect_humans' => false, 'aggression' => 85], $forecast);
$check($conqueror['memory']['target'] === 30 && $conqueror['memory']['doctrine'] === 'conqueror', 'Aggressive nation did not consider a wider war');
$conflictView = [...$regional, 'conflict_events' => [['id' => 101, 'turn_number' => 29, 'territory_id' => 10, 'opponent_id' => 9, 'defending' => true, 'won' => false, 'lost' => true]]];
$remembered = $policy->decide($conflictView, ['home_landmass_anchor' => 10], [...$settings, 'protect_humans' => false], $forecast)['memory'];
$check($remembered['conflicts']['9']['score'] === 22 && $remembered['last_conflict_battle_id'] === 101, 'Conflict was not recorded');
$rememberedAgain = $policy->decide([...$conflictView, 'turn_number' => 31], $remembered, [...$settings, 'protect_humans' => false], $forecast)['memory'];
$check($rememberedAgain['conflicts']['9']['score'] === 20, 'Conflict was duplicated instead of decaying');
$escalationWorld = [...$regional['territories'],
    ['id' => 31, 'name' => 'Second rival front', 'owner' => 9, 'water' => false, 'terrain' => 'Plain', 'sea' => true, 'population' => 1000000, 'loyalty' => 1, 'can_deploy' => false, 'connections' => [], 'land_connections' => []],
    ['id' => 32, 'name' => 'Third rival front', 'owner' => 9, 'water' => false, 'terrain' => 'Plain', 'sea' => true, 'population' => 1000000, 'loyalty' => 1, 'can_deploy' => false, 'connections' => [], 'land_connections' => []],
];
$largeForce = [];
for ($id = 1; $id <= 12; $id++) $largeForce[] = ['id' => $id, 'type' => 'Infantry', 'territory_id' => 10];
for ($id = 13; $id <= 57; $id++) $largeForce[] = ['id' => $id, 'type' => 'Artillery', 'territory_id' => 10];
$escalated = null;
for ($turn = 30; $turn <= 50 && !$escalated; $turn++) {
    $candidate = $policy->decide([...$regional, 'turn_number' => $turn, 'territories' => $escalationWorld, 'divisions' => $largeForce],
        ['home_landmass_anchor' => 10, 'conflicts' => ['9' => ['score' => 100, 'last_turn' => $turn]], 'conflicts_updated_turn' => $turn],
        [...$settings, 'protect_humans' => false, 'aggression' => 85], $forecast);
    if ($candidate['memory']['state'] === 'Escalate') $escalated = $candidate;
}
$fronts = $escalated ? array_unique(array_column($escalated['orders'], 'destination_territory_id')) : [];
$check($escalated && count($fronts) >= 2 && $escalated['memory']['guard_reserve'] >= 3,
    'High conflict did not sometimes open multiple fronts while reserving for retaliation');
$eliminated = $policy->decide([...$view, 'territories' => []], [], $settings, $forecast);
$check($eliminated['memory']['state'] === 'Eliminated' && !$eliminated['orders'], 'Eliminated bot still sent orders');
$shortOre = $view;
$shortOre['divisions'] = array_slice($view['divisions'], 0, 2);
$shortOre['budget']['max_recruitement_pool_expansion'] = 10;
$shortOre['definitions']['Artillery']['deployment_costs'] = ['Capital' => 4, 'Ore' => 1, 'RecruitmentPool' => 1];
$shortOre['planning']['resources'] = array_fill_keys(['Capital', 'Food', 'Ore', 'RecruitmentPool'], ['stock' => 0, 'upkeep' => 0, 'expenses' => 0]);
$reallocation = function ($planning) {
    $rows = array_fill_keys(['Capital', 'Food', 'RecruitmentPool'], ['closing' => 100000000, 'balance' => 20000000]);
    $rows['Ore'] = ['closing' => $planning['resources']['Ore']['expenses'] ? 100000000 : 0, 'balance' => 0];
    return $rows;
};
$check(!(new V1Experimental)->decide($shortOre, [], $settings, $reallocation)['deployments'], 'Deployment used Ore unavailable before its expenses trigger reallocation');
echo "PASS pure policy: neutral growth, landmass doctrine, conflict escalation, retaliation defense and economy\n";

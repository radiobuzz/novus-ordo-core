<?php
require __DIR__ . '/isolated-app.php';
require __DIR__ . '/generated-map-fixture.php';
set_exception_handler(function (Throwable $error) { fwrite(STDERR, $error . "\n"); exit(1); });

use App\Domain\Resources\Quantity as Q;
use App\Models\{Game, NewNation, Territory, User};
use App\Services\{AdminGameService, GameMutation, WorldResetService};
use App\Services\Resources\{ProductionStateStore, ResourceCatalogue as Catalogue, ResourceRuleRegistry};
use App\Services\Policies\{PolicyCatalogue, PolicyDefinitionValidator, PolicyEffectRegistry, PolicyRules, PolicyService};
use Illuminate\Support\Facades\{Artisan, DB, Hash};
use Illuminate\Validation\ValidationException;

$count = 0;
$check = function (bool $ok, string $message) use (&$count) { ++$count; if (!$ok) throw new RuntimeException($message); };
$reject = function (callable $work, string $message, string $class = ValidationException::class) use ($check) {
    try { $work(); } catch (Throwable $e) { $check($e instanceof $class, "$message: unexpected " . $e::class . ': ' . $e->getMessage()); return; }
    $check(false, "$message: accepted");
};
if (Artisan::call('migrate', ['--force' => true]) !== 0) throw new RuntimeException(Artisan::output());
foreach (['production_bids', 'labor_pool_facilities', 'labor_pool_allocations'] as $retired) $check(!\Illuminate\Support\Facades\Schema::hasTable($retired), 'Retired table still present: ' . $retired);
$base = json_decode(file_get_contents(database_path('resource-templates/foundation.json')), true, flags: JSON_THROW_ON_ERROR);
$registry = app(ResourceRuleRegistry::class); $store = app(ProductionStateStore::class);
$stockIndex = array_search('food', array_column($base['resources'], 'key'));
foreach ([['exchange.reference_price', 'price', '0'], ['production.operating', 'wage_per_unit', '-1'],
    ['production.founding', 'public_share', '1.01'], ['development.capacity', 'construction_workers', '0'],
    ['development.capacity', 'max_growth_fraction', '1.01']] as [$handler, $field, $value]) {
    $bad = $base; $bad['resources'][$stockIndex]['rules'][$handler][$field] = $value;
    $reject(fn () => $registry->validate($bad), "Reject $handler.$field=$value");
}
$bad = $base; unset($bad['resources'][$stockIndex]['rules']['production.operating']);
$reject(fn () => $registry->validate($bad), 'Missing operating contract');
$bad = $base; $bad['resources'][$stockIndex]['rules']['development.capacity']['formula'] = 'x*2';
$reject(fn () => $registry->validate($bad), 'No arbitrary formulas');
$bad = $base; $bad['resources'][0]['rules']['production.operating'] = ['wage_per_unit' => '1'];
$reject(fn () => $registry->validate($bad), 'Currency cannot produce');

$found = function (Game $game) {
    $eligible = $game->freeSuitableTerritoriesInTurn()->get()->keyBy('id'); $edges = Territory::getTerritoryConnections($game); $homes = [];
    foreach ($eligible as $start) {
        $queue = [$start->id]; $seen = [];
        while ($queue && count($seen) < 5) {
            $id = array_shift($queue); if (isset($seen[$id])) continue; $seen[$id] = true;
            foreach ($edges[$id] as $edge) if ($edge->isConnectedByLand && $eligible->has($edge->connectedTerritoryId) && !isset($seen[$edge->connectedTerritoryId])) $queue[] = $edge->connectedTerritoryId;
        }
        if (count($seen) === 5) { $homes = array_keys($seen); break; }
    }
    if (!$homes) throw new RuntimeException('No connected homeland.');
    $user = new User(); $user->name = 'production-' . bin2hex(random_bytes(4)); $user->email = $user->name . '@example.test';
    $user->password = Hash::make('fixture-password'); $user->is_admin = true; $user->save();
    return [NewNation::create($game, $user, $user->name)->finishSetup($homes, 'Test leader'), $homes];
};

$policy = ['key' => 'develop', 'category_key' => 'economy', 'status' => 'active', 'labels' => ['en' => 'Development'], 'parameters' => [], 'conditions' => [],
    'options' => [['key' => 'enabled', 'is_default' => true, 'labels' => ['en' => 'Enabled'], 'effects' => [
        ['key' => 'funding', 'effect_type' => 'production.development_funding', 'arguments' => ['resource' => 'role:nutrition', 'funding_ratio' => '0.5']],
        ['key' => 'priority', 'effect_type' => 'allocation.production_priority', 'arguments' => ['resource' => 'synthetic_good', 'priority' => 'regional']],
    ]]]];
$policyDoc = ['name' => 'Catalogue bound policies', 'policies' => [$policy]];
$policyTemplate = app(PolicyCatalogue::class)->createTemplate($policyDoc);

$games = [];
foreach (['private' => '0', 'public' => '1', 'mixed' => '0.333333'] as $name => $share) {
    $doc = $base; $doc['name'] = "Production state $name";
    // A renamed nutrition resource and a seventh resource exercise catalogue binding, not source switches.
    $extra = $doc['resources'][$stockIndex]; $extra['key'] = 'synthetic_good'; $extra['role'] = null;
    unset($extra['rules']['demand.population']); $extra['labels'] = ['en' => 'Synthetic good'];
    $doc['resources'][] = $extra;
    foreach ($doc['resources'] as &$resource) {
        if ($resource['key'] === 'food') $resource['key'] = 'rations';
        if (isset($resource['rules']['production.founding'])) {
            $resource['rules']['production.territorial_labor']['geographic'] = false;
            $resource['rules']['production.founding']['public_share'] = $share;
            $resource['rules']['production.founding']['private_inventory_per_million'] = '0.1';
            $resource['rules']['production.founding']['private_inventory_unit_cost'] = '1.5';
        }
    } unset($resource);
    foreach ($doc['units'] as &$phases) foreach ($phases as &$costs) if (isset($costs['food'])) { $costs['rations'] = $costs['food']; unset($costs['food']); } unset($phases, $costs);
    $template = Catalogue::createTemplate($doc);
    $exported = $registry->validate($template->document()); $imported = $registry->validate($doc);
    $exported['resources'] = array_column($exported['resources'], null, 'key');
    $imported['resources'] = array_column($imported['resources'], null, 'key');
    $check($exported == $imported, 'Definition export round trip');
    $game = Game::createNew(generatedMapFixture(), policyTemplateId: $policyTemplate['set']['id'], resourceTemplateId: $template->set['id']);
    [$nation, $homes] = $found($game); $turn = $game->getCurrentTurn(); $cat = Catalogue::forGame($game);
    // Saved map fixtures use known food keys. Explicitly provide physical potential for this test catalogue.
    $territories = DB::table('territories')->where('game_id', $game->id)->get();
    foreach ($territories as $territory) {
        $geo = json_decode($territory->geographic_potential, true);
        $geo['resources']['rations'] = $geo['resources']['food'] ?? ['capacity' => 0, 'terrainWeights' => []];
        $geo['resources']['synthetic_good'] = ['capacity' => 10.123457, 'terrainWeights' => ['Plain' => 1]];
        DB::table('territories')->where('id', $territory->id)->update(['geographic_potential' => json_encode($geo)]);
    }
    // Replace only this isolated fixture's automatic founding rows after injecting synthetic geography.
    DB::table('territory_production_states')->where('game_id', $game->id)->delete();
    DB::table('nation_economic_accounts')->where('game_id', $game->id)->delete();
    DB::table('nation_resource_stockpiles')->where('game_id', $game->id)->where('owner_kind', 'producer')->delete();
    $store->initializeWorld($game, $turn);
    $neutral = $store->snapshot($game, $turn)['territory_production_states'];
    $check(count($neutral) === $territories->count() * count($cat->producers()) * 2, 'All territorial owner pools seeded in batches');
    $reject(fn () => $store->initializeWorld($game, $turn), 'Cannot reseed world assets', LogicException::class);
    $treasuryBefore = $nation->getDetail()->getStockpiledQuantity($cat->role('treasury'));
    $store->foundNation($nation, $turn, $homes);
    $before = $store->snapshot($game, $turn);
    $check($nation->fresh()->getDetail()->getStockpiledQuantity($cat->role('treasury')) === $treasuryBefore, 'Civilian funds do not duplicate treasury');
    $check(count($before['nation_economic_accounts']) === 2, 'Only household and producer cash accounts');
    $reject(fn () => $store->foundNation($nation, $turn, $homes), 'No repeated founding cash', LogicException::class);
    $check($store->snapshot($game, $turn) === $before, 'Failed founding is atomic');
    $resourceId = $cat->get('synthetic_good')['id']; $capacity = [];
    foreach ($before['territory_production_states'] as $row) if ($row['resource_id'] === $resourceId) $capacity[$row['territory_id']][$row['owner_kind']] = $row['installed_capacity'];
    foreach ($capacity as $territoryId => $owners) {
        $total = Q::mul('10.123457', in_array($territoryId, $homes, true) ? '0.6' : '0.1');
        $check(Q::add($owners['government'], $owners['producer']) === $total, 'Owner shares conserve developed potential including rounding');
        $check($owners['government'] === Q::mul($total, $share), "$name opening ownership");
    }
    $publicStock = $nation->fresh()->getDetail()->getStockpiledQuantity('synthetic_good');
    $check($publicStock === $cat->get('synthetic_good')['starting_quantity'], 'Private inventory excluded from government accessors');
    $private = DB::table('nation_resource_stockpiles')->where('nation_id', $nation->id)->where('turn_id', $turn->id)->where('resource_id', $resourceId)->where('owner_kind', 'producer')->first();
    $check(Q::cmp($private->available_quantity, '0') > 0 && $private->cost_basis === Q::mul($private->available_quantity, '1.5'), 'Opening private stock carries aggregate cost basis');
    $store->setAcquisition($nation, $turn, 'synthetic_good', '5.123456', '7.500001', 10);
    $request = $store->snapshot($game, $turn)['nation_resource_acquisitions'][0];
    $check($request['requested_quantity'] === '5.123456' && $request['spending_limit'] === '7.500001', 'Acquisition precision retained');
    $check($nation->fresh()->getDetail()->getStockpiledQuantity('synthetic_good') === $publicStock, 'Saving a plan does not create stock');
    $reject(fn () => $store->setAcquisition($nation, $turn, $cat->role('treasury'), '1', '1', 0), 'Currency not an acquisition');
    $reject(fn () => $store->setAcquisition($nation, $turn, $cat->role('recruitment'), '1', '1', 0), 'Recruitment not an acquisition');
    $reject(fn () => $store->setAcquisition($nation, $turn, 'synthetic_good', '-1', '1', 0), 'Negative request rejected');
    $edited = $template->document();
    foreach ($edited['resources'] as &$r) if (isset($r['rules']['exchange.reference_price'])) $r['rules']['exchange.reference_price']['price'] = '99'; unset($r);
    Catalogue::edit($template->set['id'], 1, $edited);
    $check(Catalogue::load($cat->set['id'])->get('synthetic_good')['rules']['exchange.reference_price']['price'] === '2.000000', 'Template economics remain independent');
    $games[] = [$game, $nation, $homes, $cat];
}

[$game, $nation, $homes, $cat] = $games[2]; $turn = $game->getCurrentTurn();
$reject(fn () => $store->setAcquisition($nation, $games[0][0]->getCurrentTurn(), 'synthetic_good', '1', '1', 0), 'Foreign turn rejected', LogicException::class);
$reject(fn () => $cat->key($games[0][3]->get('synthetic_good')['id']), 'Foreign resource ID rejected', LogicException::class);
$policies = app(PolicyCatalogue::class); $effects = app(PolicyEffectRegistry::class);
app(GameMutation::class)->run($game, fn () => $policies->deleteGameDefinitions($game));
$bad = $policyDoc; $bad['policies'][0]['options'][0]['effects'][1]['arguments']['resource'] = 'absent';
$badTemplate = $policies->createTemplate($bad);
$reject(fn () => $policies->cloneSet($badTemplate['set']['id'], $game), 'Unresolved game target rejected');
$check(!DB::table('policy_sets')->where('game_id', $game->id)->exists(), 'Failed policy clone leaves no partial set');
$policySet = $policies->cloneSet($policyTemplate['set']['id'], $game);
$settings = app(PolicyService::class)->effectiveSettings($nation, $turn);
$check($settings['production.development_funding']['rations'] === '0.5', 'Nutrition role bound to renamed resource');
$check($settings['allocation.production_priority']['synthetic_good'] === 'regional', 'Additional good uses shared effect');
$bad = $policySet['document']; $bad['policies'][0]['options'][0]['effects'][1]['arguments']['resource'] = $cat->role('treasury');
$reject(fn () => $effects->validateCatalogueTargets($bad, $cat), 'Currency policy target rejected');
$bad['policies'][0]['options'][0]['effects'][1]['arguments']['resource'] = $cat->role('recruitment');
$reject(fn () => $effects->validateCatalogueTargets($bad, $cat), 'Capacity policy target rejected');
$conflict = $policySet['document']; $duplicate = $conflict['policies'][0]; $duplicate['key'] = 'duplicate';
$duplicate['options'][0]['effects'] = [$duplicate['options'][0]['effects'][0]];
$duplicate['options'][0]['effects'][0]['arguments']['resource'] = 'rations'; $conflict['policies'][] = $duplicate;
$keyed = array_column($conflict['policies'], null, 'key');
$reject(fn () => $effects->compile($keyed, app(PolicyRules::class)->defaults($keyed), $cat), 'Role/key aliases cannot bypass exclusive policy effects');

// Feed actual Package B rows into the pure Package C resolver; forecasting cannot mutate storage.
$beforeForecast = $store->snapshot($game, $turn);
$facts = DB::table('territory_details')->join('territories', 'territories.id', '=', 'territory_details.territory_id')
    ->where('territory_details.turn_id', $turn->id)->where('territory_details.owner_nation_id', $nation->id)
    ->get(['territory_details.*', 'territories.geographic_potential', 'territories.terrain_type'])->map(fn ($t) => [
        'territory_id' => $t->territory_id, 'owner_nation_id' => $t->owner_nation_id, 'population_size' => $t->population_size,
        'workers' => $t->population_size, 'geography' => json_decode($t->geographic_potential, true),
        'terrain' => \App\Domain\TerrainType::from($t->terrain_type)->name, 'economy_state' => json_decode($t->economy_state, true),
    ])->all();
$input = \App\Domain\Economy\ProductionEconomyInput::fromSnapshots($cat->resources, $beforeForecast, $facts, $nation->id);
$proposal = ['settings' => $settings, 'acquisitions' => $input['acquisitions']];
$forecast = \App\Domain\Economy\ProductionEconomySeason::resolve($cat->resources, $input['state'], $proposal);
$check($forecast === \App\Domain\Economy\ProductionEconomySeason::resolve($cat->resources, $input['state'], $proposal), 'Database-backed input produces identical coordinated forecasts');
$check(isset($forecast['resources']['synthetic_good'], $forecast['resources']['rations']), 'Stored additional and renamed resources participate in coordinated resolver');
$check($store->snapshot($game, $turn) === $beforeForecast, 'Coordinated forecast never writes stored balances or plans');

// Test storage transitions, not the not-yet-wired coordinated economic resolver.
$definitionCounts = [DB::table('resource_definitions')->count(), DB::table('policy_effects')->count()];
$opening = $store->snapshot($game, $turn); $previous = $turn;
for ($i = 0; $i < 3; ++$i) {
    $next = $previous->createNext(); $store->copySeason($game, $previous, $next);
    // Keep non-production world facts constant so the real rollback command can assess victory.
    // This fixture does not run the old physical/fiscal resolver alongside the future one.
    foreach (['nation_details', 'territory_details', 'nation_territory_loyalties'] as $table) {
        $rows = DB::table($table)->where('game_id', $game->id)->where('turn_id', $previous->id)->get()->map(function ($row) use ($next) {
            $row = (array) $row; unset($row['id']); $row['turn_id'] = $next->id; return $row;
        })->all();
        foreach (array_chunk($rows, 500) as $chunk) DB::table($table)->insert($chunk);
    }
    $check($store->snapshot($game, $next) === $opening, 'Repeated state copies preserve cash, ownership, capacity, plans and cost basis');
    $reject(fn () => $store->copySeason($game, $previous, $next), 'No duplicate season snapshots', LogicException::class);
    $previous = $next;
}
$check($definitionCounts === [DB::table('resource_definitions')->count(), DB::table('policy_effects')->count()], 'Definitions never copied per season');
$game->fresh()->rollbackLastTurn($previous->id);
foreach (array_keys($opening) as $table) $check(!DB::table($table)->where('turn_id', $previous->id)->exists(), 'Rollback cascades ' . $table);
$remaining = $game->fresh()->getCurrentTurn(); $replay = $remaining->createNext(); $store->copySeason($game, $remaining, $replay);
$check($store->snapshot($game, $replay) === $opening, 'Rollback/replay exactly reproduces production state');
$check($store->snapshot($game, $turn) === $opening, 'Older seasonal state remains unchanged');

$deleteGame = $games[0][0]->fresh();
app(AdminGameService::class)->lifecycle($deleteGame, 'delete', $deleteGame->turn_context_revision);
foreach (array_keys($opening) as $table) $check(!DB::table($table)->where('game_id', $deleteGame->id)->exists(), 'Game deletion cleans ' . $table);
$check(DB::table('resource_sets')->where('id', $cat->set['id'])->exists(), 'Deleting one game preserves another catalogue');
$preview = app(WorldResetService::class)->preview();
foreach (array_keys($opening) as $table) $check(str_contains(json_encode($preview), $table), 'World reset discovers ' . $table);

echo "$count production state checks passed.\n";

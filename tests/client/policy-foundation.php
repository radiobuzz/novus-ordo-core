<?php
// Every database mutation is confined by this guarded bootstrap to a disposable /tmp instance.
$app = require __DIR__ . '/isolated-app.php';
set_exception_handler(function (Throwable $error) { fwrite(STDERR, (string) $error . PHP_EOL); exit(1); });
require_once __DIR__ . '/generated-map-fixture.php';

use App\Models\{Game, NationDetail, NewNation, Territory, Turn, User};
use App\Services\{AdminGameService, GameMutation};
use App\Services\Policies\{PolicyCatalogue, PolicyDefinitionValidator, PolicyEffectRegistry, PolicyRules, PolicyService, PolicyValues};
use Illuminate\Support\Facades\{Artisan, DB, Hash};
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

$checks = 0;
$check = function ($condition, $message) use (&$checks) { $checks++; if (!$condition) throw new RuntimeException($message); };
$invalid = function (callable $work) use ($check) {
    try { $work(); throw new RuntimeException('Expected validation failure'); }
    catch (ValidationException $error) { $check(count($error->errors()) > 0, 'Missing diagnostic'); }
};
$reject = function (callable $work, int $status) use ($check) {
    try { $work(); throw new RuntimeException('Expected HTTP rejection'); }
    catch (HttpExceptionInterface $error) { $check($error->getStatusCode() === $status, $error->getMessage()); }
};
Artisan::call('migrate', ['--force' => true]);
$catalogues = app(PolicyCatalogue::class); $service = app(PolicyService::class);
$validator = app(PolicyDefinitionValidator::class); $rules = app(PolicyRules::class);
$example = json_decode(file_get_contents(__DIR__ . '/fixtures/policy-dependencies.json'), true, flags: JSON_THROW_ON_ERROR);
$normalized = $validator->validate($example);
$check($normalized['policies'][0]['parameters'][0]['default_value'] === '0.2', 'Decimal normalization');
foreach (['effect', 'binding', 'unit', 'default', 'cycle', 'reference', 'step', 'duplicate', 'formula'] as $kind) {
    $bad = $example;
    switch ($kind) {
        case 'effect': $bad['policies'][0]['options'][0]['effects'][0]['effect_type'] = 'execute.php'; break;
        case 'binding': $bad['policies'][0]['options'][0]['effects'][0]['arguments']['rate']['parameter'] = 'missing'; break;
        case 'unit': $bad['policies'][0]['parameters'][0]['unit_key'] = 'dollars'; break;
        case 'default': $bad['policies'][2]['options'][1]['is_default'] = true; break;
        case 'cycle': $bad['policies'][2]['conditions'][] = ['key' => 'cycle', 'option' => 'public', 'condition_type' => 'requires_option', 'referenced_policy' => 'public_industrial_priority', 'option_keys' => ['none'], 'message' => ['en' => 'Cycle']]; break;
        case 'reference': $bad['policies'][3]['conditions'][0]['referenced_policy'] = 'another_set'; break;
        case 'step': $bad['policies'][0]['parameters'][0]['step'] = '0'; break;
        case 'duplicate': $bad['policies'][] = $bad['policies'][0]; break;
        case 'formula': $bad['policies'][0]['options'][0]['effects'][0]['arguments']['formula'] = 'population * 10'; break;
    }
    $invalid(fn () => $validator->validate($bad));
}
foreach (['0.205', '1.01', '-0.01', 0.2, true, '1e-1', '0.1234567'] as $bad) $invalid(fn () => PolicyValues::parameter($normalized['policies'][0]['parameters'][0], $bad, 'rate'));
$check(PolicyValues::parameter(['value_type' => 'boolean'], false, 'bool') === false, 'Boolean zero');
$check(PolicyValues::parameter(['value_type' => 'integer', 'min_value' => '0', 'max_value' => '10', 'step' => '2'], 4, 'int') === 4, 'Integer validation');
$invalid(fn () => PolicyValues::parameter(['value_type' => 'integer'], '4', 'int'));
$conflict = $example; $duplicate = $conflict['policies'][0]; $duplicate['key'] = 'duplicate_tax'; $conflict['policies'][] = $duplicate;
$invalid(fn () => $validator->validate($conflict));

// Validate the authored infrastructure standard and its costs before cloning to a game.
$founding = json_decode(file_get_contents(__DIR__.'/../../database/policy-templates/economy.json'),true,flags:JSON_THROW_ON_ERROR);
$validator->validate($founding);
$infraKey = array_search('infrastructure_investment',array_column($founding['policies'],'key'),true);
$check($infraKey!==false,'Founding catalogue lacks named infrastructure policy');
foreach (['level'=>'1.1','amount'=>'-1'] as $field=>$value) {
    $bad=$founding; $effectIndex=$field==='level'?0:2;
    $bad['policies'][$infraKey]['options'][3]['effects'][$effectIndex]['arguments'][$field]=$value;
    $invalid(fn()=>$validator->validate($bad));
}
$bad=$founding;$bad['policies'][$infraKey]['options'][3]['effects'][2]['arguments']['amount']='0';
$invalid(fn()=>$validator->validate($bad));
$conflict=$founding;$duplicate=$founding['policies'][$infraKey];$duplicate['key']='duplicate_standard';$conflict['policies'][]=$duplicate;
$invalid(fn()=>$validator->validate($conflict));

$template = $catalogues->createTemplate($example); $templateId = $template['set']['id'];
$game = Game::createNew(generatedMapFixture(), policyTemplateId: $templateId);
$other = Game::createNew(generatedMapFixture(), policyTemplateId: $templateId);
$legacy = Game::createNew(generatedMapFixture());
$gameSet = $catalogues->forGame($game); $setId = $gameSet['set']['id'];
$check($gameSet['ids']['policies'] !== $template['ids']['policies'], 'Clone reused definition IDs');
$check($catalogues->forGame($legacy) !== null, 'Default game lacks its economic policies');
$legacySet=$catalogues->forGame($legacy);
$legacyInfra=array_column($legacySet['document']['policies'],null,'key')['infrastructure_investment'];
$check(count($legacyInfra['options'])===5,'Named infrastructure options were not stored and cloned');
$high=array_column($legacyInfra['options'],null,'key')['high'];
$check(array_column($high['effects'],null,'key')['standard']['arguments']['level']==='0.75','Infrastructure target was not round-tripped through DB');
$source=$catalogues->load($legacySet['set']['source_policy_set_id']);$tuned=$source['document'];
$tuneKey=array_search('infrastructure_investment',array_column($tuned['policies'],'key'),true);
$tuned['policies'][$tuneKey]['options'][3]['effects'][1]['arguments']['amount']='1.8';
$edited=$catalogues->edit($source['set']['id'],$source['set']['edit_counter'],$tuned);
$check($edited['catalogue']['document']['policies'][$tuneKey]['options'][3]['effects'][1]['arguments']['amount']==='1.8','Authoring did not save infrastructure cost in DB');
$check($catalogues->forGame($legacy)['document']===$legacySet['document'],'Infrastructure cost edit leaked from template into existing game');

$beforeClone = $gameSet['document'];
$editedTemplate = $example; $editedTemplate['policies'][0]['parameters'][0]['default_value'] = '0.4';
$catalogues->edit($templateId, 1, $editedTemplate);
$check($catalogues->forGame($game)['document'] === $beforeClone, 'Template edit leaked into game');
$check($catalogues->forGame($other)['document'] === $beforeClone, 'Template edit leaked into second game');
$clone = $catalogues->cloneSet($setId, name: 'Derived template');
$check($clone['set']['kind'] === 'template' && $clone['set']['source_policy_set_id'] === $setId, 'Game-to-template cloning');
$reject(fn () => $catalogues->edit($setId, 1, $example), 403);
$game->policy_testing_enabled = true; $game->save();
$home = function (Game $game): array {
    $eligible = $game->freeSuitableTerritoriesInTurn()->get()->keyBy('id');
    $edges = Territory::getTerritoryConnections($game);
    foreach ($eligible as $start) {
        $queue = [$start->id]; $seen = [];
        while ($queue && count($seen) < 5) {
            $id = array_shift($queue); if (isset($seen[$id])) continue; $seen[$id] = true;
            foreach ($edges[$id] as $edge) if ($edge->isConnectedByLand && $eligible->has($edge->connectedTerritoryId) && !isset($seen[$edge->connectedTerritoryId])) $queue[] = $edge->connectedTerritoryId;
        }
        if (count($seen) === 5) return array_keys($seen);
    }
    throw new RuntimeException('No connected homeland in fixture');
};
$nations = [];
foreach (['policy-a', 'policy-b', 'policy-foreign'] as $index => $name) {
    $owner = $index === 2 ? $other : $game;
    $user = new User(); $user->name = $name . '-' . $game->id; $user->email = $user->name . '@example.test'; $user->password = Hash::make('fixture-password'); $user->is_admin = false; $user->save();
    $nations[] = NewNation::create($owner, $user, $user->name)->finishSetup($home($owner), $user->name . ' leader');
}
[$a, $b, $foreign] = $nations; $turn = $game->getCurrentTurn();
$state = $service->state($a, $turn);
$check(count($state['current']) === 4 && $state['current']['income_tax']['parameters']['rate'] === '0.2', 'Founding defaults');
$definitions = fn () => array_map(fn ($t) => DB::table($t)->orderBy('id')->get()->toJson(), ['policy_sets', 'policies', 'policy_options', 'policy_parameters', 'policy_effects', 'policy_conditions']);
$world = fn () => array_map(fn ($t) => DB::table($t)->where('game_id', $game->id)->orderBy('id')->get()->toJson(), ['nation_resource_stockpiles', 'territory_details']);
$baselineWorld = $world(); $definitionSignature = $definitions();
$tax = ['income_tax' => ['option' => 'standard', 'parameters' => ['rate' => '0.25']]];
$preview = $service->preview($a, $turn, 1, $tax);
$check($preview['valid'] && $preview['settings']['finance.income_tax']['taxable_income'] === '0.25' && isset($preview['indicator_forecast']['expected']), 'Honest direct-settings preview');
$check($world() === $baselineWorld && $definitions() === $definitionSignature && DB::table('nation_policy_pending_changes')->count() === 0, 'Preview mutated state');
$reject(fn () => $service->submit($a, $other->getCurrentTurn(), 1, $tax), 409);
$reject(fn () => $service->submit($a, $turn, 99, $tax), 409);
$invalid(fn () => $service->submit($a, $turn, 1, ['unknown' => ['option' => 'standard', 'parameters' => []]]));
$service->submit($a, $turn, 1, $tax);
$check($service->state($a, $turn)['current']['income_tax']['parameters']['rate'] === '0.2', 'Submission changed current law');
$check(count($service->state($a, $turn)['pending']) === 1, 'Pending stores only changed topics');
$service->submit($a, $turn, 1, []);
$check($service->state($a, $turn)['pending'] === [], 'Cancel pending did not work');
$public = ['industrial_ownership' => ['option' => 'mixed', 'parameters' => []], 'public_industrial_priority' => ['option' => 'consumer_goods', 'parameters' => []]];
$service->resetTestChoices($a, $turn, 1, $public);
$private = ['industrial_ownership' => ['option' => 'private', 'parameters' => []]];
$preview = $service->preview($a, $turn, 1, $private);
$check(!$preview['valid'] && $preview['suggested_replacements']['public_industrial_priority']['option'] === 'none', 'Missing dependency explanation');
$invalid(fn () => $service->submit($a, $turn, 1, $private));
$package = $tax + $private + ['public_industrial_priority' => ['option' => 'none', 'parameters' => []]];
$service->submit($a, $turn, 1, $package);
$service->submit($b, $turn, 1, ['infrastructure_funding' => ['option' => 'enabled', 'parameters' => ['funding_ratio' => '0']]]);
$check($world() === $baselineWorld, 'Configuration spent money or moved population');
$check($service->state($b, $turn)['current']['industrial_ownership']['option'] === 'private', 'Nations shared choices');

// Observe the actual upkeep boundary, including all nations' new choices and atomic failure.
$nextRowsObserved = false;
NationDetail::creating(function ($detail) use ($turn, $game, &$nextRowsObserved, $check) {
    if ($detail->game_id === $game->id && $detail->turn_id !== $turn->id) {
        $nextRowsObserved = true;
        $check(DB::table('nation_policy_choices')->where('turn_id', $detail->turn_id)->count() === 8, 'A nation started upkeep before all choices existed');
        throw new RuntimeException('injected-policy-upkeep-failure');
    }
});
try { $game->fresh()->tryNextTurn($turn); throw new RuntimeException('Failure injection did not run'); }
catch (RuntimeException $error) { $check($error->getMessage() === 'injected-policy-upkeep-failure', $error->getMessage()); }
finally { NationDetail::flushEventListeners(); }
$check($nextRowsObserved && $game->fresh()->getCurrentTurn()->id === $turn->id && !$turn->fresh()->hasEnded(), 'Failed turn was partially committed');
$check(DB::table('nation_policy_choices')->where('game_id', $game->id)->count() === 8, 'Failed turn leaked snapshots');
$check($world() === $baselineWorld, 'Failed turn leaked economy state');
$next = $game->fresh()->tryNextTurn($turn);
$after = $service->state($a, $next);
$check($after['current']['income_tax']['parameters']['rate'] === '0.25' && $after['current']['industrial_ownership']['option'] === 'private', 'Boundary did not apply full package');
$check($after['pending'] === [] && count($after['report']['changed']) === 3, 'New season pending/report incorrect');
$check($service->state($b, $next)['settings']['budget.program_funding']['infrastructure'] === '0', 'Zero funding grants benefit');
$check($definitions() === $definitionSignature, 'Turn copied or mutated definitions');
$check(count($service->state($a, $turn)['pending']) === 3, 'Ended-turn pending package lost');
$reject(fn () => $service->submit($a, $turn, 1, $tax), 409);

// Change the test definitions, then undo and retry. The edit must survive.
$edited = $catalogues->load($setId)['document'];
$edited['policies'][0]['options'][0]['effects'][0]['arguments']['rate'] = '0.35';
$edited['policies'][0]['parameters'][0]['default_value'] = '0.8';
$edit = $catalogues->edit($setId, 1, $edited);
$check($edit['diagnostics'] === [], 'Valid test edit failed');
$check($service->state($a, $next)['settings']['finance.income_tax']['taxable_income'] === '0.35', 'Definition edit not reapplied');
$check($service->state($a, $next)['current']['income_tax']['parameters']['rate'] === '0.25', 'Default edit rewrote nation input');
$game->fresh()->rollbackLastTurn($next->id);
$check(!Turn::find($next->id) && DB::table('nation_policy_choices')->where('turn_id', $next->id)->count() === 0, 'Rollback left destination state');
$check($world() === $baselineWorld, 'Rollback did not restore economy');
$check($service->state($a, $turn)['settings']['finance.income_tax']['taxable_income'] === '0.35' && count($service->state($a, $turn)['pending']) === 3, 'Rollback lost edits or pending choices');
$reject(fn () => $service->submit($a, $turn, 1, $tax), 409);
$retry = $game->fresh()->tryNextTurn($turn);
$check($service->state($a, $retry)['report']['settings']['finance.income_tax']['taxable_income'] === '0.35', 'Retry ignored edited definitions');
$game->fresh()->rollbackLastTurn($retry->id);

// New parameters/topics initialize only the open turn; unusable selections produce diagnostics.
$edited = $catalogues->load($setId)['document'];
$edited['policies'][0]['parameters'][] = ['key' => 'test_switch', 'labels' => ['en' => 'Test switch'], 'value_type' => 'boolean', 'unit_key' => 'boolean', 'default_value' => false];
$added = ['key' => 'test_topic', 'category_key' => 'testing', 'labels' => ['en' => 'Test topic'], 'status' => 'active', 'options' => [['key' => 'off', 'labels' => ['en' => 'Off'], 'is_default' => true, 'effects' => []]], 'parameters' => [], 'conditions' => []];
$edited['policies'][] = $added;
$catalogues->edit($setId, 2, $edited);
$state = $service->state($a, $turn);
$check(count($state['current']) === 5 && $state['current']['income_tax']['parameters']['test_switch'] === false, 'New topic/parameter defaults missing');
$edited = $catalogues->load($setId)['document'];
foreach ($edited['policies'] as &$policy) if ($policy['key'] === 'industrial_ownership') foreach ($policy['options'] as &$option) if ($option['key'] === 'mixed') $option['retired'] = true;
unset($policy, $option);
// Remove mixed from dependency references as part of this structural edit.
foreach ($edited['policies'] as &$policy) foreach ($policy['conditions'] as &$condition) $condition['option_keys'] = array_values(array_diff($condition['option_keys'], ['mixed']));
unset($policy, $condition);
$result = $catalogues->edit($setId, 3, $edited);
$check(isset($result['diagnostics'][$a->id]['current']), 'Retired selected option was silently repaired');
$invalid(fn () => $game->fresh()->tryNextTurn($turn));
$check($game->fresh()->getCurrentTurn()->id === $turn->id, 'Invalid package advanced game');
$service->resetTestChoices($a, $turn, 4, $private + ['public_industrial_priority' => ['option' => 'none', 'parameters' => []]]);
$service->resetTestChoices($b, $turn, 4, []);
$check($service->state($a, $turn)['diagnostics'] === [], 'Admin reselection failed');
$before = $world();
$catalogues->edit($setId, 4, $catalogues->load($setId)['document']);
$catalogues->edit($setId, 5, $catalogues->load($setId)['document']);
$check($world() === $before, 'Repeated rebuilds charged money or changed geography');
$reject(fn () => $catalogues->edit($setId, 5, $edited), 409);

// Omission retires a historical topic; game deletion cleans restrictive references and provenance.
$edited = $catalogues->load($setId)['document'];
$edited['policies'] = array_values(array_filter($edited['policies'], fn ($p) => $p['key'] !== 'test_topic'));
$catalogues->edit($setId, 6, $edited);
$check(DB::table('policies')->where('policy_set_id', $setId)->where('key', 'test_topic')->value('status') === 'retired', 'Referenced policy was deleted');
$check(!isset($service->state($a, $turn)['current']['test_topic']), 'Retired topic remains active');
$deleteGame = Game::createNew(generatedMapFixture(), policyTemplateId: $templateId);
$deleteSet = $catalogues->forGame($deleteGame);
$derived = $catalogues->cloneSet($deleteSet['set']['id']);
app(AdminGameService::class)->lifecycle($deleteGame, 'delete', $deleteGame->fresh()->turn_context_revision);
$check(!DB::table('policy_sets')->where('id', $deleteSet['set']['id'])->exists(), 'Game definition cleanup failed');
$check($catalogues->load($derived['set']['id'])['set']['source_policy_set_id'] === null, 'Source deletion destroyed clone');

$legacyTurn = $legacy->getCurrentTurn(); $legacyNext = $legacy->fresh()->tryNextTurn($legacyTurn);
$check($legacyNext->getNumber() === 2, 'Game without policies failed to advance');
$legacy->fresh()->rollbackLastTurn($legacyNext->id);
$check($legacy->fresh()->getCurrentTurn()->id === $legacyTurn->id, 'Game without policies failed rollback');

$admin = new User(); $admin->name = 'policy-admin-' . $game->id; $admin->email = $admin->name . '@example.test'; $admin->password = Hash::make('fixture-password'); $admin->is_admin = true; $admin->save();
file_put_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/policy-fixture.json', json_encode(['game_id' => $game->id, 'other_game_id' => $other->id, 'set_id' => $setId, 'template_id' => $templateId, 'nations' => array_map(fn ($n) => $n->id, $nations), 'users' => array_map(fn ($n) => User::find($n->user_id)->name, $nations), 'admin' => $admin->name], JSON_THROW_ON_ERROR));
echo "PASS: $checks policy foundation assertions (validation, clone isolation, preview purity, pending packages, all-nation boundary, transactional failure, rollback, test edits, zero funding, retirement and cleanup).\n";

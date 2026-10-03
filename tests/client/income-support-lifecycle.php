<?php
// Existing isolated 20-season civilian checks; never the application database.
require __DIR__ . '/civilian-lifecycle.php';

$supportCatalogue = app(\App\Services\Policies\PolicyCatalogue::class);
$supportNation = $civilianGame->nations()->first();
$supportTurn = $civilianGame->fresh()->getCurrentTurn();
$supportCounter = $supportCatalogue->forGame($civilianGame)['set']['edit_counter'];
$supportCurrent = $policies->state($supportNation, $supportTurn);
$check($supportCurrent['current']['income_support']['option'] === 'disabled', 'Support must start disabled.');
$check($supportCurrent['settings']['budget.income_support']['households'] === '0', 'Disabled support must be neutral.');
$supportChoice = ['income_support' => ['option' => 'enabled', 'parameters' => ['amount' => '3']]];
$advanceSupportSeason = static function ($turn) use ($adapter, $runner, $civilianGame) {
    while (($status = $adapter->status($civilianGame->fresh()))['next_nation_id'] !== null)
        $runner->step($civilianGame->fresh(), $status + ['nation_id' => $status['next_nation_id']]);
    return $civilianGame->fresh()->tryNextTurnIfNationsReady($turn);
};
$beforeSupport = $store->snapshot($civilianGame, $supportTurn);
$supportPreview = $policies->preview($supportNation, $supportTurn, $supportCounter, $supportChoice);
$check($supportPreview['valid'] && $supportPreview['indicator_forecast']['expected']['support_requested'] === '3.000000', 'Policy amount did not reach preview.');
$check($beforeSupport === $store->snapshot($civilianGame, $supportTurn), 'Support preview changed balances.');
$policies->submit($supportNation, $supportTurn, $supportCounter, $supportChoice);
$check($policies->state($supportNation, $supportTurn)['current']['income_support']['option'] === 'disabled', 'Support enacted before seasonal boundary.');
for ($supportSeason = 0; $supportSeason < 2; $supportSeason++) {
    $supportTurn = $civilianGame->fresh()->getCurrentTurn();
    $supportForecast = $economy->resolve($supportNation->getDetail($supportTurn), $policies->effectiveSettings($supportNation, $supportTurn));
    $supportNext = $advanceSupportSeason($supportTurn);
    $supportReport = $supportNation->getDetail($supportNext)->economy_report;
    $check($supportReport['support_requested'] === '3.000000', 'Support amount failed to persist across seasons.');
    $check($supportReport['support_paid'] === $supportForecast['report']['support_paid'], 'Support settlement differs from preview.');
    $check($supportReport['civilian']['consumption'] === $supportForecast['report']['civilian']['consumption'], 'Funded consumption differs from preview.');
    $check($cash($civilianGame, $supportNext) === $initialCash, 'Recurring support creates or loses cash.');
    foreach ($civilianGame->nations()->where('id', '!=', $supportNation->id)->get() as $otherSupportNation)
        $check($otherSupportNation->getDetail($supportNext)->economy_report['support_requested'] === '0.000000', 'Support leaked to another nation.');
}
$supportTurn = $civilianGame->fresh()->getCurrentTurn();
$policies->submit($supportNation, $supportTurn, $supportCounter, ['income_support' => ['option' => 'disabled', 'parameters' => ['amount' => '3']]]);
$disabledSupportNext = $advanceSupportSeason($supportTurn);
$check($supportNation->getDetail($disabledSupportNext)->economy_report['support_paid'] === '0.000000', 'Disabled support still spends money.');
$disabledSupportState = $store->snapshot($civilianGame, $disabledSupportNext);
$civilianGame->fresh()->rollbackLastTurn($disabledSupportNext->id);
$restoredSupportTurn = $civilianGame->fresh()->getCurrentTurn();
$check($policies->state($supportNation, $restoredSupportTurn)['current']['income_support']['option'] === 'enabled', 'Rollback did not restore active support.');
$supportReplay = $civilianGame->fresh()->tryNextTurn($restoredSupportTurn);
$check($disabledSupportState === $store->snapshot($civilianGame, $supportReplay), 'Support rollback/replay changed accounts or goods.');

// Authoring addition is neutral, scoped and idempotent; no past-season conversion.
$oldSupportDocument = json_decode(file_get_contents(database_path('policy-templates/economy.json')), true, flags: JSON_THROW_ON_ERROR);
$oldSupportDocument['name'] = 'Income support installation fixture';
$oldSupportDocument['policies'] = array_values(array_filter($oldSupportDocument['policies'], fn ($p) => $p['key'] !== 'income_support'));
$oldSupportTemplate = $supportCatalogue->createTemplate($oldSupportDocument);
$oldSupportGame = \App\Models\Game::createNew(generatedMapFixture(), fn ($g) => app(\ExperimentalAI\Setup::class)->populate($g, ['count' => 2]), policyTemplateId: $oldSupportTemplate['set']['id']);
$oldSupportTurn = $oldSupportGame->getCurrentTurn();
$oldSupportSet = $supportCatalogue->forGame($oldSupportGame);
$oldSupportSnapshot = $store->snapshot($oldSupportGame, $oldSupportTurn);
$oldSupportChoices = \Illuminate\Support\Facades\DB::table('nation_policy_choices')->where('game_id', $oldSupportGame->id)->orderBy('id')->get()->toArray();
$addedSupport = $supportCatalogue->installIncomeSupport($oldSupportGame, $oldSupportSet['set']['edit_counter']);
$check($addedSupport['added'] === ['income_support'], 'Authoring changed unrelated definitions.');
$check($oldSupportSnapshot === $store->snapshot($oldSupportGame, $oldSupportTurn), 'Installing a disabled policy changed the economy.');
foreach ($oldSupportChoices as $oldChoice) $check((array) \Illuminate\Support\Facades\DB::table('nation_policy_choices')->find($oldChoice->id) === (array) $oldChoice, 'Installation rewrote a prior choice.');
$againSupport = $supportCatalogue->installIncomeSupport($oldSupportGame, $addedSupport['edit_counter']);
$check($againSupport['added'] === [] && $againSupport['edit_counter'] === $addedSupport['edit_counter'], 'Installation is not idempotent.');
echo "PASS: income support preview, seasonal activation, three settlements, neutrality, isolation, cash conservation, authoring and rollback/replay.\n";

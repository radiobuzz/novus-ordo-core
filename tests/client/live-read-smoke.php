<?php
// Explicitly opt-in. Reads existing data only; never provisions a user or creates a session in production.
if (!in_array('--read-only-live', $argv, true)) {
    fwrite(STDERR, "Requires --read-only-live. This checks the existing game's read contracts.\n");
    exit(1);
}
require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['session.driver' => 'array', 'cache.default' => 'array']);
Illuminate\Support\Facades\DB::connection()->beforeExecuting(function (string $query): void {
    if (!preg_match('/^\s*(select|show)\b/i', $query)) {
        throw new RuntimeException('Read smoke test refused a non-read query.');
    }
});
$user = App\Models\User::query()->orderBy('id')->firstOrFail();
Illuminate\Support\Facades\Auth::setUser($user);
$logged = new App\Services\LoggedInGameContext();
$public = new App\Services\PublicGameContext();
$gameController = new App\Http\Controllers\GameController();
$territoryController = new App\Http\Controllers\TerritoryController();
$userController = new App\Http\Controllers\UserController();
$game = $gameController->info($public)->getData(true);
$rankingRequest = Illuminate\Http\Request::create('/game/ranking-history', 'GET', [
    'game_id' => $game['game_id'],
    'turn_number' => $game['turn_number'],
]);
$rankingHistory = $gameController->rankingHistory(
    $rankingRequest,
    $public,
    app(App\Services\RankingHistoryService::class),
)->getData(true);
$ready = $gameController->readyStatus($public)->getData(true);
$setup = $userController->nationSetupStatus($logged)->getData(true);
$base = $territoryController->allTerritoriesBaseInfo($public)->getData(true)['data'];
$request = Illuminate\Http\Request::create('/territories/turn-infos', 'GET', ['turn_number' => $game['turn_number']]);
$turn = $territoryController->allTerritoriesTurnInfo($request, $public)->getData(true)['data'];
$land = array_values(array_filter($base, fn ($t) => $t['terrain_type'] !== 'Water'));
$detail = $territoryController->turnInfo($public, $request, $land[0]['territory_id'])->getData(true);
if ($detail['turn_number'] !== $game['turn_number'] || count($base) !== count($turn)) {
    throw new RuntimeException('Read-contract mismatch.');
}
if ($rankingHistory['game_id'] !== $game['game_id'] || $rankingHistory['through_turn'] !== $game['turn_number'] || count($rankingHistory['rankings']) !== 5) {
    throw new RuntimeException('Ranking-history contract mismatch.');
}
$historyTurn = App\Models\Turn::getForGameByNumberOrNull(
    App\Models\Game::getCurrent(),
    $rankingHistory['through_turn'],
);
$currentRankings = App\Models\Game::getCurrent()->exportRankings($historyTurn);
foreach ($currentRankings as $currentRanking) {
    $historicalRanking = collect($rankingHistory['rankings'])->firstWhere('key', $currentRanking->key);
    $latest = collect($historicalRanking['series'])
        ->map(function (array $series) use ($rankingHistory): ?array {
            $point = collect($series['points'])->firstWhere('turn_number', $rankingHistory['through_turn']);
            return $point ? ['nation_id' => $series['nation_id'], ...$point] : null;
        })
        ->filter()
        ->sortBy('rank')
        ->values();
    if (
        $latest->pluck('nation_id')->all() !== $currentRanking->ranked_nation_ids ||
        $latest->pluck('value')->map(fn ($value) => (float) $value)->all() !== collect($currentRanking->data)->map(fn ($value) => (float) $value)->all()
    ) {
        throw new RuntimeException("Ranking history diverges from current {$currentRanking->key} ranking.");
    }
}
$clientRequest = Illuminate\Http\Request::create('/client');
$clientRequest->setUserResolver(fn () => $user);
$html = app(App\Http\Controllers\ClientController::class)->index($clientRequest);
if (!str_contains($html->getContent(), 'client-boot')) throw new RuntimeException('Client entry did not render.');
echo json_encode([
    'result' => 'PASS', 'game_id' => $game['game_id'], 'turn_number' => $game['turn_number'],
    'ready' => $ready['is_game_ready'], 'territories' => count($base), 'land_territories' => count($land),
    'ranking_history_metrics' => count($rankingHistory['rankings']),
    'has_nation' => $setup['nation_id'] !== null, 'client_html' => 'rendered', 'database_writes' => 'blocked',
], JSON_PRETTY_PRINT) . "\n";

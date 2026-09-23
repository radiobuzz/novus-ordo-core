<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Models\{Game, Nation, User};
use ExperimentalAI\Setup;
use Illuminate\Support\Facades\DB;

$game = Game::getCurrent();
$counts = [Game::count(), Nation::count(), User::count(), DB::table('ai_player_games')->count()];
try {
    Game::createNew(null, function ($new) {
        app(Setup::class)->populate($new, ['count' => 2]);
        throw new RuntimeException('injected-creation-failure');
    });
    throw new RuntimeException('Missing injected failure');
} catch (RuntimeException $error) {
    if ($error->getMessage() !== 'injected-creation-failure') throw $error;
}
if ([Game::count(), Nation::count(), User::count(), DB::table('ai_player_games')->count()] !== $counts || Game::getCurrent()->getId() !== $game->getId())
    throw new RuntimeException('Failed creation left bots/accounts/settings or deactivated previous game');
foreach ([-1, 11] as $count) {
    try { Setup::options(['count' => $count]); throw new RuntimeException('Invalid count accepted'); }
    catch (Illuminate\Validation\ValidationException) {}
}
config(['ai-player.enabled' => false]);
try { Game::createNew(null, fn ($new) => app(Setup::class)->populate($new, ['count' => 1])); throw new RuntimeException('Disabled experiment accepted'); }
catch (Symfony\Component\HttpKernel\Exception\HttpException $error) { if ($error->getStatusCode() !== 422) throw $error; }
$humanGame = Game::createNew(null, fn ($new) => app(Setup::class)->populate($new, ['count' => 0]));
if (app(App\Integrations\AIPlayers\GameAdapter::class)->status($humanGame) !== null) throw new RuntimeException('Human-only game acquired AI settings');
$turn = $humanGame->getCurrentTurn();
if ($humanGame->tryNextTurn($turn)->getNumber() !== $turn->getNumber() + 1) throw new RuntimeException('Disabled module blocked human-only game');
echo "PASS atomic provisioning rollback, 0–10 count validation, disabled module and ordinary game turn\n";

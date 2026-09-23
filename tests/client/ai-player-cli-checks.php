<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Models\{Game, Turn};
use App\Integrations\AIPlayers\GameAdapter;
use Illuminate\Support\Facades\{Artisan, DB};
$game = Game::getCurrent(); $adapter = app(GameAdapter::class);
$before = Turn::count();
$old = Game::where('id', '!=', $game->getId())->whereHas('nations')->firstOrFail();
if (Artisan::call('app:ai-play', ['game' => $old->getId(), '--turns' => 1]) !== 1) throw new RuntimeException('CLI accepted archived game');
if (Artisan::call('app:ai-play', ['game' => $game->getId(), '--turns' => 101]) !== 1) throw new RuntimeException('CLI accepted unbounded batch');
if ($game->getVictoryStatus()->name !== 'HasBeenWon') throw new RuntimeException('Expected ordinary autonomous victory fixture');
if (Artisan::call('app:ai-play', ['game' => $game->getId(), '--turns' => 1]) !== 0 || Turn::count() !== $before) throw new RuntimeException('CLI advanced finished game');
DB::beginTransaction();
try {
    DB::table('ai_players')->where('game_id', $game->getId())->delete();
    config(['ai-player.enabled' => false]);
    if (!$adapter->canAdvance($game, $game->getCurrentTurn())) throw new RuntimeException('Handed-over game still depends on AI module');
} finally { DB::rollBack(); }
echo "PASS CLI bounds, archived/finished game guards, ordinary victory and complete human handover\n";

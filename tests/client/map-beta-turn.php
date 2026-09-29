<?php
$app = require __DIR__ . '/isolated-app.php';
$game = isset($argv[1]) ? App\Models\Game::findOrFail((int) $argv[1]) : App\Models\Game::where('is_active', true)->whereHas('nations')->latest('id')->firstOrFail();
$map = $game->map()->firstOrFail();
if ($game->nations()->count() < 1) throw new RuntimeException('Run the isolated map browser journey first.');
$fingerprint = $map->getFingerprint();
$definitions = App\Models\MapDefinition::count();
$current = $game->getCurrentTurn();
$next = $game->tryNextTurn($current);
if ($next->getNumber() !== $current->getNumber() + 1) throw new RuntimeException('The turn did not advance.');
if ($game->map()->first()->getFingerprint() !== $fingerprint) throw new RuntimeException('Turn resolution changed geography.');
if (App\Models\TerritoryDetail::where('game_id', $game->getId())->where('turn_id', $next->getId())->count() !== $game->territories()->count())
    throw new RuntimeException('Turn territory snapshot is incomplete.');
$game->fresh()->rollbackLastTurn($next->id);
$restored = $game->fresh()->getCurrentTurn();
$replayed = $game->fresh()->tryNextTurn($restored);
if ($replayed->getNumber() !== $next->getNumber() || App\Models\MapDefinition::count() !== $definitions || $game->map()->first()->getFingerprint() !== $fingerprint) throw new RuntimeException('Rollback/replay copied or changed static geography.');
echo "PASS: real browser-founded nation advanced, rolled back and replayed; static map identity and count unchanged.\n";

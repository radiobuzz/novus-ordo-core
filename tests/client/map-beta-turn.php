<?php
$app = require __DIR__ . '/isolated-app.php';
$game = isset($argv[1]) ? App\Models\Game::findOrFail((int) $argv[1]) : App\Models\Game::getCurrent();
$map = $game->map()->firstOrFail();
if ($game->nations()->count() < 1) throw new RuntimeException('Run the isolated map browser journey first.');
$fingerprint = $map->getFingerprint();
$current = $game->getCurrentTurn();
$next = $game->tryNextTurn($current);
if ($next->getNumber() !== $current->getNumber() + 1) throw new RuntimeException('The turn did not advance.');
if ($game->map()->first()->getFingerprint() !== $fingerprint) throw new RuntimeException('Turn resolution changed geography.');
if (App\Models\TerritoryDetail::where('game_id', $game->getId())->where('turn_id', $next->getId())->count() !== 600)
    throw new RuntimeException('Turn territory snapshot is incomplete.');
echo "PASS: existing turn engine advanced a beta game with a real nation and preserved the saved geography.\n";

<?php
// Real model hooks, strictly on the explicit socket/public fixture root.
$app = require __DIR__ . '/isolated-app.php';
$game = App\Models\Game::getCurrent();
$status = app(App\Services\GameTurnStatus::class);
$current = App\Models\Turn::getCurrentForGame($game);
$number = $current->getNumber();
$check = function (bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); };
$game->exportReadyStatus();
$check($status->read($game->getId())['state'] === 'ready', 'Initial status not ready');
$observed = false;
App\Models\Turn::updating(function ($turn) use ($status, $game, &$observed, $check) {
    if ($turn->isDirty('ended_at') && $turn->ended_at !== null) {
        $check($status->read($game->getId())['state'] === 'processing', 'Processing was not published before ending the old turn');
        $observed = true;
    }
});
$next = $game->tryNextTurn($current);
App\Models\Turn::flushEventListeners();
$check($observed && $next->getNumber() === $number + 1, 'Turn did not advance');
$ready = $status->read($game->getId());
$check($ready['state'] === 'ready' && $ready['turn_number'] === $number + 1, 'Completion status incorrect');
$game->rollbackLastTurn($next->getId());
$rollback = $status->read($game->getId());
$check($rollback['state'] === 'ready' && $rollback['turn_number'] === $number, 'Rollback status incorrect');
$check($rollback['revision'] !== $ready['revision'], 'Rollback reused the notification revision');
echo "PASS: real engine publishes before turn end, completes and rolls back with a new notification revision (isolated database).\n";

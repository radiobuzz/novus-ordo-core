<?php
// Filesystem-only test: no database, no live public path and no game mutations.
require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$root = sys_get_temp_dir() . '/no7-turn-status-' . bin2hex(random_bytes(6));
mkdir($root, 0700);
$app->usePublicPath($root);
config(['database.default' => 'no_database', 'logging.default' => 'stderr']);
$status = new App\Services\GameTurnStatus;
$check = function (bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); };
$turn = new App\Models\Turn;
$turn->game_id = 7;
$turn->number = 2;
$status->ensure($turn);
$first = $status->read(7);
$check($first['state'] === 'ready' && $first['turn_number'] === 2, 'Initialization failed');
$status->ensure($turn);
$check($status->read(7) === $first, 'Unchanged reads rewrote the file');
$next = clone $turn;
$next->number = 3;
$during = null;
$result = $status->during(7, 2, function () use ($status, $check, $next, &$during) {
    $during = $status->read(7);
    $check($during['state'] === 'processing' && $during['turn_number'] === 2, 'No early processing signal');
    return $next;
});
$ready = $status->read(7);
$check($result === $next && $ready['state'] === 'ready' && $ready['turn_number'] === 3, 'Completion failed');
$check($ready['revision'] === $during['revision'] && $ready['revision'] !== $first['revision'], 'Operation identity failed');
try {
    $status->during(7, 3, fn () => throw new RuntimeException('injected failure'));
    throw new RuntimeException('Expected failure');
} catch (RuntimeException $error) {
    $check($error->getMessage() === 'injected failure', 'Original exception changed');
}
$check($status->read(7)['state'] === 'failed', 'Failure was hidden');
$status->during(7, 3, fn () => $turn);
$check($status->read(7)['turn_number'] === 2, 'Rollback notification failed');
$check(array_keys($ready) === ['version', 'game_id', 'turn_number', 'state', 'revision', 'updated_at'], 'Private fields exposed');
$status->publish(7, 2, 'processing');
$status->ensure($turn);
$check($status->read(7)['state'] === 'ready', 'Interrupted notification did not recover');
$turn->ended_at = '2026-09-21 00:00:00';
$status->ensure($turn);
$check($status->read(7)['state'] === 'failed', 'Incomplete ended turn labelled ready');
$check((fileperms($status->path(7)) & 0777) === 0644, 'Apache cannot read the file');
$check(glob($root . '/var/turn-status/.turn-*') === [], 'Temporary file left behind');
echo "PASS: initialization, early processing, completion, rollback, failure, interrupted recovery, public fields and file permissions.\n";
// Remove only this test's explicitly created files/directories.
unlink($status->path(7));
rmdir($root . '/var/turn-status');
rmdir($root . '/var');
rmdir($root);

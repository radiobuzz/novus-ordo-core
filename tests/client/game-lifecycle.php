<?php
$app = require __DIR__ . '/isolated-app.php';
require_once __DIR__ . '/generated-map-fixture.php';
use App\Models\{Game, NationDetail, User};
use App\Services\{AdminGameService, GameAccess, GameMutation, GameTurnStatus, NationCommunicationService};
use Illuminate\Support\Facades\{DB, Schema, Cache};
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\Process\Process;

$root = getenv('NO7_ENTRY_TEST_ROOT');
config(['cache.default' => 'file', 'cache.stores.file.path' => $root . '/lifecycle-cache', 'cache.stores.file.lock_path' => $root . '/lifecycle-locks']);
$service = app(AdminGameService::class);
$check = function ($value, $message) { if (!$value) throw new RuntimeException($message); };
$reject = function ($work, $status) use ($check) {
    try { $work(); throw new RuntimeException('Expected rejection'); }
    catch (HttpExceptionInterface $e) { $check($e->getStatusCode() === $status, $e->getMessage()); }
};
if (($argv[1] ?? '') === 'race') {
    try { $service->lifecycle(Game::findOrFail((int) $argv[2]), 'deactivate', $argv[3]); echo 'accepted'; }
    catch (HttpExceptionInterface $e) { if ($e->getStatusCode() !== 409) throw $e; echo 'stale'; }
    exit;
}
$other = Game::orderBy('id')->firstOrFail();
$otherBefore = $service->summary($other);
$target = Game::createNew(generatedMapFixture(), fn ($g) => app(ExperimentalAI\Setup::class)->populate($g, ['count' => 2]));
$nations = $target->nations()->get();
$messages = app(NationCommunicationService::class);
$message = $messages->send($nations[0], $nations[1]->id, 'Lifecycle fixture', (string) Str::uuid());
$offer = $messages->propose($nations[0], $nations[1]->id, App\Domain\NationOfferKind::Peace, (string) Str::uuid());
$before = $service->summary($target->fresh());
$ai = app(App\Integrations\AIPlayers\GameAdapter::class);
$aiBefore = $ai->status($target);
$deadline = $target->getCurrentTurn()->expires_at;
$ready = $target->nations()->pluck('is_ready_for_next_turn', 'id')->all();
$reject(fn () => $service->lifecycle($target, 'deactivate', (string) Str::uuid()), 409);
$reject(fn () => $service->lifecycle($target, 'nonsense', $before['context_revision']), 422);

// Independent processes race from the same confirmation; only one can commit.
$workers = [];
for ($i = 0; $i < 2; $i++) {
    $worker = new Process([PHP_BINARY, __FILE__, 'race', (string) $target->id, $before['context_revision']]);
    $worker->setTimeout(30); $worker->start(); $workers[] = $worker;
}
$outcomes = [];
foreach ($workers as $worker) { $worker->wait(); $check($worker->isSuccessful(), $worker->getErrorOutput()); $outcomes[] = $worker->getOutput(); }
sort($outcomes); $check($outcomes === ['accepted', 'stale'], 'Concurrent confirmations both committed');
$check(!$target->fresh()->isActive(), 'Deactivation did not persist');
$check(!app(GameAccess::class)->allows($target->fresh()), 'Inactive game still available for play');
$reject(fn () => $service->changeTurn($target, $before['turn_id'], 'advance'), 409);
$reject(fn () => $ai->assertContext($target, $aiBefore), 409);
$reject(fn () => $messages->send($nations[0], $nations[1]->id, 'Late', (string) Str::uuid()), 409);
$service->lifecycle($target, 'activate', $target->fresh()->turn_context_revision);
$check($target->fresh()->isActive(), 'Activation did not persist');
$reject(fn () => $ai->assertContext($target, $aiBefore), 409);
$reject(fn () => $service->lifecycle($target, 'delete', $before['context_revision']), 409);
$check($target->getCurrentTurn()->expires_at === $deadline, 'Lifecycle reset the deadline');
$check($target->nations()->pluck('is_ready_for_next_turn', 'id')->all() === $ready, 'Lifecycle reset completed AI readiness');
$check($target->getCurrentTurn()->id === $before['turn_id'], 'Lifecycle changed the turn');

$own = 'var/entry-' . Str::uuid() . '.png';
$shared = 'var/entry-' . Str::uuid() . '.png';
$portrait = 'var/entry-' . Str::uuid() . '.png';
foreach ([$own, $shared, $portrait] as $src) file_put_contents(public_path($src), 'fixture');
DB::table('nation_details')->where('nation_id', $nations[0]->id)->update(['flag_src' => $own]);
DB::table('nation_details')->where('nation_id', $nations[1]->id)->update(['flag_src' => $shared]);
DB::table('leader_details')->where('game_id', $target->id)->update(['picture_src' => $portrait]);
$otherDetail = NationDetail::where('game_id', $other->id)->firstOrFail();
$oldSrc = $otherDetail->flag_src;
$otherDetail->flag_src = $shared; $otherDetail->save();
$userCount = User::count(); $mapCount = DB::table('map_drafts')->count();
$revision = $target->fresh()->turn_context_revision;
$inject = true;
Game::deleted(function ($g) use ($target, &$inject) { if ($inject && $g->id === $target->id) throw new RuntimeException('fixture rollback after cascade'); });
try { $service->lifecycle($target, 'delete', $revision); throw new RuntimeException('Failure not injected'); }
catch (RuntimeException $e) { $check($e->getMessage() === 'fixture rollback after cascade', $e->getMessage()); }
$check(Game::find($target->id) !== null && DB::table('nation_messages')->where('id', $message['message_id'])->exists(), 'Cascade failed to roll back');
$check(is_file(public_path($own)) && is_file(app(GameTurnStatus::class)->path($target->id)), 'Files removed before commit');
$inject = false;
$result = $service->lifecycle($target, 'delete', $revision);
$check($result['deleted'] && $result['cleanup_complete'], 'Deletion did not finish');
$check(!Game::find($target->id), 'Game row remains');
foreach (Schema::getTables() as $table) {
    $name = $table['name'];
    if (Schema::hasColumn($name, 'game_id')) $check(!DB::table($name)->where('game_id', $target->id)->exists(), 'Game data left in ' . $name);
}
$check(!DB::table('nation_messages')->where('id', $message['message_id'])->exists(), 'Message cascade missed');
$check(!DB::table('nation_offers')->where('id', $offer['offer_id'])->exists(), 'Offer cascade missed');
$check(!is_file(public_path($own)) && !is_file(public_path($portrait)), 'Private uploads remain');
$check(is_file(public_path($shared)), 'Reused upload was removed');
$check(!is_file(app(GameTurnStatus::class)->path($target->id)), 'Deleted game status hint remains');
$check(User::count() === $userCount && DB::table('map_drafts')->count() === $mapCount, 'Global accounts/maps changed');
$check($service->summary($other->fresh()) === $otherBefore, 'Other game changed');
$otherDetail->flag_src = $oldSrc; $otherDetail->save(); unlink(public_path($shared));
$reject(fn () => $service->lifecycle($target, 'delete', $revision), 404);
echo "PASS: activation/deactivation, unchanged turn/readiness/deadline, independent-process race, stale AI/confirmation guards, full cascade rollback, committed deletion, upload/status cleanup, shared-image/account/map/other-game preservation.\n";

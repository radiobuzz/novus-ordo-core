<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Domain\{NationOfferKind, ResourceType};
use App\Models\{Nation, NationOfferDetail};
use App\Services\{NationCommunicationService, NationGrantService};
use Symfony\Component\Process\Process;
use Illuminate\Support\Str;

$root = getenv('NO7_ENTRY_TEST_ROOT');
config(['cache.default' => 'file', 'cache.stores.file.path' => $root . '/diplomacy-cache', 'cache.stores.file.lock_path' => $root . '/diplomacy-locks']);
$f = json_decode(file_get_contents($root . '/diplomacy-fixture.json'), true);
[$a, $b] = array_map(fn ($id) => Nation::findOrFail($id), array_slice($f['nations'], 0, 2));
$messages = app(NationCommunicationService::class);
if (isset($argv[1])) {
    [$offerId, $action] = explode(':', $argv[1]) + [1 => 'accept'];
    try { echo json_encode($messages->respond($action === 'cancel' ? $a : $b, (int) $offerId, $action)); }
    catch (\Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $error) {
        if ($error->getStatusCode() !== 409) throw $error;
        echo json_encode(['status' => 'Rejected']);
    }
    exit;
}
$check = function ($condition, $message) { if (!$condition) throw new RuntimeException($message); };
$race = function ($ids) {
    $processes = array_map(function ($id) { $p = new Process([PHP_BINARY, __FILE__, (string) $id]); $p->setTimeout(30); $p->start(); return $p; }, $ids);
    return array_map(function ($p) { $p->wait(); if (!$p->isSuccessful()) throw new RuntimeException($p->getOutput() . $p->getErrorOutput()); return json_decode($p->getOutput(), true, flags: JSON_THROW_ON_ERROR)['status']; }, $processes);
};
$balance = fn ($n) => $n->getDetail()->getStockpiledQuantity(ResourceType::Capital);
$offer = $messages->propose($a, $b->id, NationOfferKind::ResourceGrant, (string) Str::uuid(), ResourceType::Capital, '1.2500');
$before = [$balance($a), $balance($b)];
$check($race([$offer['offer_id'], $offer['offer_id']]) === ['Accepted', 'Accepted'], 'Duplicate acceptance failed');
$check(abs($balance($a) - $before[0] + 1.25) < .000001 && abs($balance($b) - $before[1] - 1.25) < .000001, 'Concurrent acceptance transferred twice');
$available = (float) app(NationGrantService::class)->available($a)['Capital'];
$amount = number_format(floor($available * .75 * 10000) / 10000, 4, '.', '');
$ids = [];
for ($i = 0; $i < 2; $i++) $ids[] = $messages->propose($a, $b->id, NationOfferKind::ResourceGrant, (string) Str::uuid(), ResourceType::Capital, $amount)['offer_id'];
$before = [$balance($a), $balance($b)]; $results = $race($ids); sort($results);
$check($results === ['Accepted', 'Invalid'], 'Competing grants overspent stock');
$check(abs($balance($a) - $before[0] + (float) $amount) < .000001 && abs($balance($b) - $before[1] - (float) $amount) < .000001, 'Competing grants broke conservation');
echo "PASS: independent PHP processes share the game lock; double acceptance transfers once; competing grants cannot overspend.\n";

$offer = $messages->propose($a, $b->id, NationOfferKind::ResourceGrant, (string) Str::uuid(), ResourceType::Capital, '1');
$before = [$balance($a), $balance($b)];
$results = $race([$offer['offer_id'] . ':accept', $offer['offer_id'] . ':cancel']); sort($results);
$check($results === ['Accepted', 'Rejected'] || $results === ['Cancelled', 'Rejected'], 'Accept/cancel conflict committed twice');
$delta = $results[0] === 'Accepted' ? 1 : 0;
$check(abs($balance($a) - $before[0] + $delta) < .000001 && abs($balance($b) - $before[1] - $delta) < .000001, 'Accept/cancel outcome did not match balances');
echo "PASS: accept/cancel race commits only its winning action.\n";

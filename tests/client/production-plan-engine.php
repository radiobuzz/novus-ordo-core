<?php
// Real allocator/transaction verification, exclusively on the explicitly isolated database.
$app = require __DIR__ . '/isolated-app.php';
use App\Domain\ResourceType;
use App\Domain\ProductionBidConstants;
use App\Http\Requests\ProductionPlanRequest;
use App\Http\Controllers\ProductionController;
use App\Http\Controllers\ClientGameplayController;
use App\Models\ProductionBid;
use App\Services\NationContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

Illuminate\Support\Facades\Auth::login(App\Models\User::where('name', 'map-player')->firstOrFail());
$context = new NationContext;
$detail = $context->getNation()->getDetail();
$check = function ($condition, $message) { if (!$condition) throw new RuntimeException($message); };
$resources = ['Food', 'Material', 'Ore', 'Oil'];
$makeBids = fn ($values, $cutoff = 0) => array_map(fn ($name) => [
    'resource_type' => $name, 'max_quantity' => (int) round(($values[$name] ?? 0) * 1000000),
    'max_labor_allocation_per_unit' => $cutoff ? (int) ceil(1000000 / $cutoff) : ProductionBidConstants::MAX_LABOR_PER_UNIT_LIMIT,
], $resources);
$valid = $makeBids(['Food' => 1, 'Ore' => 1, 'Oil' => 1]);
$rules = (new ProductionPlanRequest)->rules();
$check(Validator::make(['bids' => $valid], $rules)->passes(), 'Valid complete plan rejected');
$invalids = [array_slice($valid, 0, 3), [...$valid, $valid[0]]];
$duplicate = $valid; $duplicate[1] = $valid[0]; $invalids[] = $duplicate;
$forbidden = $valid; $forbidden[0]['resource_type'] = 'Capital'; $invalids[] = $forbidden;
$negative = $valid; $negative[2]['max_quantity'] = -1; $invalids[] = $negative;
$fraction = $valid; $fraction[2]['max_quantity'] = 1.5; $invalids[] = $fraction;
$overflow = $valid; $overflow[2]['max_labor_allocation_per_unit'] = 2147483648; $invalids[] = $overflow;
foreach ($invalids as $payload) $check(Validator::make(['bids' => $payload], $rules)->fails(), 'Invalid plan accepted');
$request = function ($bids) use ($rules) {
    $request = ProductionPlanRequest::create('/nation/production-plan', 'POST', ['bids' => $bids]);
    $request->setValidator(Validator::make(['bids' => $bids], $rules));
    return $request;
};
$capture = fn () => [
    DB::table('production_bids')->where('nation_id', $detail->getNationId())->orderBy('id')->get()->toJson(),
    DB::table('labor_pool_allocations')->where('nation_id', $detail->getNationId())->orderBy('id')->get()->toJson(),
];
$before = $capture(); $count = 0;
ProductionBid::saving(function () use (&$count) { if (++$count === 2) throw new RuntimeException('injected-plan-failure'); });
try { (new ProductionController)->applyProductionPlan($context, $request($valid)); throw new RuntimeException('Failure was not injected'); }
catch (RuntimeException $error) { $check($error->getMessage() === 'injected-plan-failure', $error->getMessage()); }
finally { ProductionBid::flushEventListeners(); }
$check($before === $capture(), 'Partial bids survived transaction failure');
// Fail after allocation has actually started, not just during bid validation/writes.
$count = 0;
App\Models\LaborPoolAllocation::saving(function () use (&$count) { if (++$count === 2) throw new RuntimeException('injected-allocation-failure'); });
try { (new ProductionController)->applyProductionPlan($context, $request($valid)); throw new RuntimeException('Allocation failure was not injected'); }
catch (RuntimeException $error) { $check($error->getMessage() === 'injected-allocation-failure', $error->getMessage()); }
finally { App\Models\LaborPoolAllocation::flushEventListeners(); }
$check($before === $capture(), 'Partial allocations survived transaction failure');
$cases = [];
foreach ([[$makeBids([]), 'off'], [$valid, 'balanced'], [$makeBids(['Ore' => 100, 'Oil' => 100]), 'competition'], [$makeBids(['Food' => 1, 'Oil' => 2], 3), 'cutoff']] as [$bids, $name]) {
    DB::beginTransaction();
    try {
        $input = (new ClientGameplayController)->info($context)->getData(true);
        $response = (new ProductionController)->applyProductionPlan($context, $request($bids));
        $check($response->getStatusCode() === 204, 'Plan response is not accepted');
        $saved = ProductionBid::getAllCommandBids($detail)->keyBy(fn ($bid) => $bid->getResourceType()->name);
        foreach ($bids as $bid) $check($saved[$bid['resource_type']]->getMaxQuantity() === $bid['max_quantity'], 'Submitted bid was not saved');
        $output = $detail->exportBudget();
        $cases[] = compact('name', 'input', 'bids', 'output');
    } finally { DB::rollBack(); }
}
$check($before === $capture(), 'Test did not restore isolated state');
echo json_encode(['checks' => ['complete-plan validation', 'mid-bid rollback', 'mid-allocation rollback', 'accepted full plan'], 'cases' => $cases], JSON_THROW_ON_ERROR);

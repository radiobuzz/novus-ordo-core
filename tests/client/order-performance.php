<?php
// Only the explicit temporary database; every fixture mutation below is rolled back.
require __DIR__ . '/isolated-app.php';
use App\Domain\{DivisionType, OrderType, RelationState, ResourceType};
use App\Models\{Division, DivisionDetail, Game, Nation, Order, Territory, TerritoryDetail};
use App\Services\{DiplomacyService, NationCommands, PlayerWorkspace};
use Illuminate\Support\Facades\DB;

$fixture = json_decode(file_get_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/diplomacy-fixture.json'), true);
$game = Game::findOrFail($fixture['game_id']);
$nation = Nation::findOrFail($fixture['nations'][0]);
$other = Nation::findOrFail($fixture['nations'][1]);
$foreign = Nation::findOrFail($fixture['nations'][3]);
$turn = $game->getCurrentTurn();
$check = function ($condition, $message) { if (!$condition) throw new RuntimeException($message); };
$reject = function ($work) use ($check) {
    try { $work(); throw new RuntimeException('Expected rejection'); }
    catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $error) { $check($error->getStatusCode() === 422, $error->getMessage()); }
};
$unit = function ($owner, $origin, $type) {
    $unit = new Division(); $unit->game_id = $owner->game_id; $unit->nation_id = $owner->id;
    $unit->division_type = $type->value; $unit->save(); DivisionDetail::create($unit, $origin); return $unit;
};
$batch = fn ($unit, $target, $path = []) => ['division_id' => $unit->id, 'destination_territory_id' => $target->id, 'path_territory_ids' => array_map(fn ($t) => $t->id, $path)];
$run = function ($name, $work) {
    DB::beginTransaction();
    try { $work(); echo "PASS: $name\n"; } finally { DB::rollBack(); }
};
DB::beginTransaction();
try {
    $origin = $nation->getDetail()->territories()->firstOrFail();
    $middle = $origin->connectedTerritories()->where('terrain_type', '!=', App\Domain\TerrainType::Water->value)->firstOrFail();
    $target = $middle->connectedTerritories()->where('territories.id', '!=', $origin->id)->where('terrain_type', '!=', App\Domain\TerrainType::Water->value)->firstOrFail();
    foreach ([$origin, $middle, $target] as $t) {
        $t->has_sea_access = false; $t->save();
        $t->getDetail($turn)->forceFill(['owner_nation_id' => $nation->id])->save();
    }
    DB::table('nation_resource_stockpiles')->where('nation_id', $nation->id)->where('turn_id', $turn->id)->update(['available_quantity' => 100000]);
    $rules = app(DiplomacyService::class);
    foreach ([RelationState::NoRelations, RelationState::Allied, RelationState::Peace] as $state) {
        $run('movement parity ' . $state->name, function () use ($rules, $nation, $other, $turn, $origin, $middle, $target, $unit, $batch, $check, $reject, $state) {
            $pair = $rules->pair($nation, $other->id, true); $rules->change($pair, $turn, $state);
            $target->getDetail($turn)->forceFill(['owner_nation_id' => $other->id])->save();
            foreach (DivisionType::cases() as $type) foreach ([[], [$middle]] as $path) {
                $a = $unit($nation, $origin, $type); $b = $unit($nation, $origin, $type);
                $allowed = $a->getDetail()->canMoveTo($target, ...$path);
                if (!$allowed) { $reject(fn () => app(NationCommands::class)->move($nation, [$batch($b, $target, $path)])); continue; }
                $legacy = $a->sendMoveAttackOrder($target, ...$path);
                $optimized = app(NationCommands::class)->move($nation, [$batch($b, $target, $path)])[0];
                $left = (array) $legacy->exportForOwner(); $right = (array) $optimized->exportForOwner();
                unset($left['division_id'], $right['division_id']);
                $check($left === $right, 'Order output changed');
                $check((bool)$legacy->intent_captured === (bool)$optimized->intent_captured && $legacy->intended_owner_nation_id === $optimized->intended_owner_nation_id, 'Attack intent changed');
            }
        });
    }
    $run('coastal movement, neutral intent, replacements and workspace parity', function () use ($nation, $origin, $middle, $target, $turn, $unit, $batch, $check) {
        $origin->has_sea_access = true; $origin->save(); $target->has_sea_access = true; $target->save();
        $target->getDetail($turn)->forceFill(['owner_nation_id' => null])->save();
        $a = $unit($nation, $origin, DivisionType::Infantry);
        $old = Order::createMoveOrder($a, $middle);
        $new = app(NationCommands::class)->move($nation, [$batch($a, $target)])[0];
        $check($old->fresh()->trashed() && $new->intent_captured && $new->intended_owner_nation_id === null, 'Replacement or neutral intent changed');
        $legacy = $nation->getDetail()->activeDivisions()->get()->map(fn ($d) => $d->getDetail()->exportForOwner())->all();
        $export = app(PlayerWorkspace::class)->export($nation)['divisions']->all();
        $check(json_encode($legacy) === json_encode($export), 'Owner division export changed');
    });
    $origin->refresh(); $target->refresh();
    $run('invalid batches preserve existing orders', function () use ($nation, $other, $foreign, $origin, $middle, $target, $unit, $batch, $check, $reject) {
        $a = $unit($nation, $origin, DivisionType::Armored);
        $b = $unit($other, $origin, DivisionType::Infantry);
        $old = Order::createMoveOrder($a, $middle);
        $valid = $batch($a, $middle);
        foreach ([[$valid, $valid], [$valid, $batch($b, $middle)], [$valid, ['division_id'=>99999999, 'destination_territory_id'=>$middle->id]],
            [$batch($a, $foreign->getDetail()->territories()->first())], [$batch($a, $middle, [$foreign->getDetail()->territories()->first()])]] as $orders) {
            $reject(fn () => app(NationCommands::class)->move($nation, $orders));
            $check(!$old->fresh()->trashed(), 'Invalid batch changed a prior order');
        }
        $a->getDetail()->disband();
        $reject(fn () => app(NationCommands::class)->move($nation, [$valid]));
    });
    $run('unaffordable attacks do not replace orders', function () use ($nation, $origin, $middle, $target, $turn, $unit, $batch, $check, $reject) {
        $target->getDetail($turn)->forceFill(['owner_nation_id' => null])->save();
        DB::table('nation_resource_stockpiles')->where('nation_id', $nation->id)->where('turn_id', $turn->id)->where('resource_type', ResourceType::Oil->value)->update(['available_quantity' => 0]);
        $available = $nation->getDetail()->exportBudget()->available_production['Oil'];
        $orders = []; $old = [];
        foreach (range(0, (int) floor($available)) as $_) {
            $a = $unit($nation, $origin, DivisionType::Armored); $old[] = Order::createMoveOrder($a, $middle);
            $orders[] = $batch($a, $target, [$middle]);
        }
        $reject(fn () => app(NationCommands::class)->move($nation, $orders));
        foreach ($old as $order) $check(!$order->fresh()->trashed(), 'Unfunded batch replaced an order');
    });
    $run('50-unit query budget', function () use ($nation, $origin, $middle, $unit, $batch, $check) {
        $orders = [];
        foreach (range(1,50) as $_) $orders[] = $batch($unit($nation, $origin, DivisionType::Infantry), $middle);
        DB::enableQueryLog(); DB::flushQueryLog(); $start = hrtime(true);
        $result = app(NationCommands::class)->move($nation, $orders);
        foreach ($result as $order) $order->exportForOwner();
        $queries = count(DB::getQueryLog()); DB::disableQueryLog();
        $check(count($result) === 50 && $queries < 80, 'Order queries grew with repeated validation');
        echo json_encode(['units'=>50,'queries'=>$queries,'milliseconds'=>round((hrtime(true)-$start)/1e6,1)])."\n";
    });
} finally { DB::rollBack(); }

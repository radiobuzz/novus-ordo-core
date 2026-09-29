<?php
// Guarded disposable database only. Every gameplay mutation is rolled back.
require __DIR__ . '/isolated-app.php';

use App\Domain\{DivisionType, OrderType, TerrainType};
use App\Models\{Division, DivisionDetail, Game, Nation, Order, Territory, Turn};
use App\Services\{DefenseCoverageService, GuardAllocator, NationCommands};
use Illuminate\Support\Facades\{Artisan, DB};

try {
    Artisan::call('migrate', ['--force' => true]);
    $fixture = json_decode(file_get_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/diplomacy-fixture.json'), true);
    $game = Game::findOrFail($fixture['game_id']);
    $defender = Nation::findOrFail($fixture['nations'][0]);
    $attacker = Nation::findOrFail($fixture['nations'][1]);
    $turn = $game->getCurrentTurn();
    $check = fn ($condition, $message) => $condition ?: throw new RuntimeException($message);
    $check((bool) $game->guard_enabled, 'New games should enable Guard by default');
    $reject = function ($work, string $message) use ($check) {
        try { $work(); throw new RuntimeException('Expected rejection: ' . $message); }
        catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $error) {
            $check($error->getStatusCode() === 422, $message . ': wrong status');
        }
    };
    $unit = function (Nation $nation, Territory $territory, DivisionType $type): Division {
        $division = new Division();
        $division->game_id = $nation->game_id; $division->nation_id = $nation->id;
        $division->division_type = $type->value; $division->save();
        DivisionDetail::create($division, $territory);
        return $division;
    };
    $case = function (string $name, $work) {
        DB::beginTransaction();
        try { $work(); echo "PASS: $name\n"; } finally { DB::rollBack(); }
    };

    DB::beginTransaction();
    try {
        $game->guard_enabled = true;
        // Guard allocation is tested independently from the fixture's treaty state.
        $game->diplomacy_enabled = false;
        $game->save();
        $hub = $game->territories()->where('terrain_type', '!=', TerrainType::Water->value)->get()
            ->first(function (Territory $territory) {
                return $territory->connectedLands()->where('terrain_type', '!=', TerrainType::Water->value)->count() >= 2;
            });
        $neighbors = $hub->connectedLands()->where('terrain_type', '!=', TerrainType::Water->value)->take(2)->get()->values();
        $strong = $neighbors[0]; $weak = $neighbors[1];
        foreach ([$hub, $strong, $weak] as $territory) {
            $territory->getDetail($turn)->forceFill(['owner_nation_id' => $defender->id])->save();
        }
        DB::table('nation_resource_stockpiles')->where('nation_id', $defender->id)->where('turn_id', $turn->id)
            ->update(['available_quantity' => 100000]);

        $case('Guard command reserves quarter cost and Stand Down blocks immediate movement', function () use (
            $defender, $hub, $strong, $unit, $check, $reject
        ) {
            $division = $unit($defender, $hub, DivisionType::Armored);
            $before = $defender->getDetail()->exportBudget()->expenses['oil'];
            $order = app(NationCommands::class)->guard($defender, [$division->id])[0];
            $after = $defender->getDetail()->exportBudget()->expenses['oil'];
            $check($order->getType() === OrderType::Guard && abs(($after - $before) - 0.25) < 0.00001, 'Guard cost is not 25%');
            $reject(fn () => app(NationCommands::class)->move($defender, [[
                'division_id' => $division->id, 'destination_territory_id' => $strong->id, 'path_territory_ids' => [],
            ]]), 'Guard unit moved without release');
            app(NationCommands::class)->cancelOrders($defender, [$division->id]);
            $check($division->getDetail()->getOrder()->getType() === OrderType::StandDown, 'Release did not create Stand Down');
            $reject(fn () => app(NationCommands::class)->cancelOrders($defender, [$division->id]), 'Stand Down was cancelled');
        });

        $case('Guard command ignores units already guarding and charges only new units', function () use (
            $defender, $hub, $unit, $check
        ) {
            $guarded = $unit($defender, $hub, DivisionType::Armored);
            $idle = $unit($defender, $hub, DivisionType::Armored);
            $existing = Order::createGuardOrder($guarded);
            $before = $defender->getDetail()->exportBudget()->expenses['oil'];
            $orders = app(NationCommands::class)->guard($defender, [$guarded->id, $idle->id]);
            $after = $defender->getDetail()->exportBudget()->expenses['oil'];
            $check($orders[0]->id === $existing->id, 'Existing Guard order was replaced');
            $check($orders[1]->division_id === $idle->id, 'Idle unit did not receive Guard');
            $check(abs(($after - $before) - 0.25) < 0.00001, 'Existing Guard was charged twice');
            $again = app(NationCommands::class)->guard($defender, [$guarded->id, $idle->id]);
            $check($again[0]->id === $orders[0]->id && $again[1]->id === $orders[1]->id,
                'Repeated Guard assignment was not a no-op');
            $check(abs($defender->getDetail()->exportBudget()->expenses['oil'] - $after) < 0.00001,
                'Repeated Guard assignment added cost');
        });

        $case('defence coverage reports reachable Guard without moving or double-counting it', function () use (
            $defender, $hub, $strong, $turn, $unit, $check
        ) {
            $guard = $unit($defender, $hub, DivisionType::Infantry);
            $fighter = $unit($defender, $hub, DivisionType::Fighter);
            Order::createGuardOrder($guard);
            Order::createGuardOrder($fighter);
            $before = $guard->getDetail($turn)->territory_id;
            DB::flushQueryLog(); DB::enableQueryLog();
            $coverage = app(DefenseCoverageService::class)->export($defender, $turn);
            $queryCount = count(DB::getQueryLog()); DB::disableQueryLog();
            $rows = collect($coverage->territories)->keyBy('territory_id');
            $check($rows[$hub->id]->guard_defense === 0 && $rows[$hub->id]->guard_divisions === 0,
                'A Guard already at the target was counted twice');
            $check($rows[$strong->id]->guard_defense === 110 && $rows[$strong->id]->guard_divisions === 2,
                'Reachable free and fuelled Guard defence was not projected');
            $check($guard->getDetail($turn)->territory_id === $before, 'Coverage projection moved a Guard unit');
            $check($fighter->getDetail($turn)->territory_id === $hub->id, 'Coverage projection moved Guard aircraft');
            $check($queryCount <= 30, "Defence coverage repeated too many database reads: $queryCount");
        });

        $case('surviving Guard duty renews into the next turn', function () use ($defender, $hub, $turn, $unit, $check) {
            $division = $unit($defender, $hub, DivisionType::Infantry);
            Order::createGuardOrder($division);
            $next = $turn->createNext();
            $division->getDetail($turn)->replicateForTurn($next)->save();
            $division->afterBattlePhase($turn, $next, true);
            $renewed = Order::where('division_id', $division->id)->where('turn_id', $next->id)->first();
            $check($renewed?->getType() === OrderType::Guard, 'Guard did not renew');
        });

        $case('disabling Guard stops duty from renewing', function () use ($game, $defender, $hub, $turn, $unit, $check) {
            $division = $unit($defender, $hub, DivisionType::Infantry);
            Order::createGuardOrder($division);
            $next = $turn->createNext();
            $division->getDetail($turn)->replicateForTurn($next)->save();
            $game->guard_enabled = false; $game->save();
            $division->afterBattlePhase($turn, $next, false);
            $check(!Order::where('division_id', $division->id)->where('turn_id', $next->id)->exists(), 'Disabled Guard renewed');
        });
        $game->refresh();

        $case('responding Guard pays the remaining operation cost', function () use (
            $game, $defender, $attacker, $hub, $strong, $turn, $unit, $check
        ) {
            DivisionDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
                ->where('territory_id', $strong->id)->update(['is_active' => false]);
            DB::table('nation_resource_stockpiles')->where('nation_id', $defender->id)->where('turn_id', $turn->id)
                ->where('resource_id', \App\Services\Resources\ResourceCatalogue::forGame($defender->getGame())->get('oil')['id'])->update(['available_quantity' => 1]);
            $guard = $unit($defender, $hub, DivisionType::Armored); Order::createGuardOrder($guard);
            $enemy = $unit($attacker, $hub, DivisionType::Armored); Order::createRaidOrder($enemy, $strong);
            $responses = app(GuardAllocator::class)->allocate($game, $turn, $turn, collect([collect([$enemy])]));
            $oil = (float) DB::table('nation_resource_stockpiles')->where('nation_id', $defender->id)
                ->where('turn_id', $turn->id)->where('resource_id', \App\Services\Resources\ResourceCatalogue::forGame($defender->getGame())->get('oil')['id'])
                ->value('available_quantity');
            $check($responses->get($strong->id)?->first()['division']->id === $guard->id, 'Funded Guard did not respond');
            $check(abs($oil - 0.25) < 0.00001, 'Guard response did not charge the remaining 75%');
        });

        $case('Guard aircraft return after combat while ground responders hold the defended territory', function () use (
            $game, $defender, $attacker, $hub, $strong, $turn, $unit, $check
        ) {
            DivisionDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
                ->where('territory_id', $strong->id)->update(['is_active' => false]);
            $fighter = $unit($defender, $hub, DivisionType::Fighter); Order::createGuardOrder($fighter);
            $infantry = $unit($defender, $hub, DivisionType::Infantry); Order::createGuardOrder($infantry);
            $attackers = collect([
                $unit($attacker, $hub, DivisionType::Bomber),
                $unit($attacker, $hub, DivisionType::Bomber),
            ]);
            $attackers->each(fn ($division) => Order::createRaidOrder($division, $strong));
            $allocator = app(GuardAllocator::class);
            $responses = $allocator->allocate($game, $turn, $turn, collect([$attackers]));
            $responders = $responses->flatMap(fn ($items) => $items)->values();
            $check($responders->pluck('division.id')->all() === [$fighter->id, $infantry->id], 'Expected air and ground response');
            $allocator->returnAircraft($game, $turn, $responders);
            $check($fighter->getDetail()->territory_id === $hub->id, 'Guard aircraft did not return to origin');
            $check($infantry->getDetail()->territory_id === $strong->id, 'Ground Guard incorrectly returned to origin');
        });

        $case('Guard aircraft stay at the nearest owned base when their origin is captured', function () use (
            $game, $defender, $attacker, $hub, $strong, $turn, $unit, $check
        ) {
            DivisionDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
                ->where('territory_id', $strong->id)->update(['is_active' => false]);
            $fighter = $unit($defender, $hub, DivisionType::Fighter); Order::createGuardOrder($fighter);
            $enemy = $unit($attacker, $hub, DivisionType::Armored); Order::createRaidOrder($enemy, $strong);
            $allocator = app(GuardAllocator::class);
            $responses = $allocator->allocate($game, $turn, $turn, collect([collect([$enemy])]));
            $hub->getDetail($turn)->forceFill(['owner_nation_id' => $attacker->id])->save();
            $allocator->returnAircraft($game, $turn, $responses->flatMap(fn ($items) => $items)->values());
            $check($fighter->getDetail()->territory_id === $strong->id, 'Aircraft returned to a captured origin');
        });

        $case('an unfunded fuel unit stays while an affordable Guard responds', function () use (
            $game, $defender, $attacker, $hub, $strong, $turn, $unit, $check
        ) {
            DivisionDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
                ->where('territory_id', $strong->id)->update(['is_active' => false]);
            DB::table('nation_resource_stockpiles')->where('nation_id', $defender->id)->where('turn_id', $turn->id)
                ->where('resource_id', \App\Services\Resources\ResourceCatalogue::forGame($defender->getGame())->get('oil')['id'])->update(['available_quantity' => 0]);
            $armored = $unit($defender, $hub, DivisionType::Armored); Order::createGuardOrder($armored);
            $infantry = $unit($defender, $hub, DivisionType::Infantry); Order::createGuardOrder($infantry);
            $enemy = $unit($attacker, $hub, DivisionType::Armored); Order::createRaidOrder($enemy, $strong);
            $responses = app(GuardAllocator::class)->allocate($game, $turn, $turn, collect([collect([$enemy])]));
            $check($responses->get($strong->id)?->pluck('division.id')->all() === [$infantry->id], 'Allocator used an unfunded Guard');
            $check($armored->getDetail()->territory_id === $hub->id, 'Unfunded Guard moved');
            $check($infantry->getDetail()->territory_id === $strong->id, 'Affordable Guard did not respond');
        });

        $case('all threats are considered before guards reinforce the largest deficit', function () use (
            $game, $defender, $attacker, $hub, $strong, $weak, $turn, $unit, $check
        ) {
            DivisionDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
                ->whereIn('territory_id', [$strong->id, $weak->id])->update(['is_active' => false]);
            $guards = collect([
                $unit($defender, $hub, DivisionType::Infantry),
                $unit($defender, $hub, DivisionType::Infantry),
            ]);
            $guards->each(fn ($division) => Order::createGuardOrder($division));
            $strongAttack = collect([
                $unit($attacker, $hub, DivisionType::Armored),
                $unit($attacker, $hub, DivisionType::Armored),
            ]);
            $weakAttack = collect([$unit($attacker, $hub, DivisionType::Infantry)]);
            $strongAttack->each(fn ($division) => Order::createRaidOrder($division, $strong));
            $weakAttack->each(fn ($division) => Order::createRaidOrder($division, $weak));
            DB::flushQueryLog(); DB::enableQueryLog();
            $responses = app(GuardAllocator::class)->allocate($game, $turn, $turn, collect([$weakAttack, $strongAttack])->shuffle());
            $queryCount = count(DB::getQueryLog()); DB::disableQueryLog();
            $allocation = $responses->map(fn ($items, $territoryId) => [$territoryId => $items->count()])->values()->all();
            $check($responses->get($strong->id)?->count() === 2 && !$responses->has($weak->id),
                'Weak diversion consumed Guard units: ' . json_encode($allocation));
            $check($guards->every(fn ($division) => $division->getDetail()->territory_id === $strong->id), 'Guard relocation was not applied');
            $check($queryCount <= 40, "Guard allocation repeated too many database reads: $queryCount");
        });

        $case('Guard ground response does not use global coastal transport', function () use (
            $game, $defender, $attacker, $turn, $unit, $check
        ) {
            $coasts = $game->territories()->where('has_sea_access', true)->where('terrain_type', '!=', TerrainType::Water->value)->get();
            $origin = $coasts->first();
            $target = $coasts->first(fn ($territory) => $territory->id !== $origin->id
                && !$origin->connectedLands()->whereKey($territory->id)->exists());
            $origin->getDetail($turn)->forceFill(['owner_nation_id' => $defender->id])->save();
            $target->getDetail($turn)->forceFill(['owner_nation_id' => $defender->id])->save();
            $guard = $unit($defender, $origin, DivisionType::Infantry); Order::createGuardOrder($guard);
            $enemy = $unit($attacker, $origin, DivisionType::Armored); Order::createRaidOrder($enemy, $target);
            $responses = app(GuardAllocator::class)->allocate($game, $turn, $turn, collect([collect([$enemy])]));
            $check(!$responses->has($target->id) && $guard->getDetail()->territory_id === $origin->id, 'Coastal shortcut moved Guard unit');
        });
    } finally { DB::rollBack(); }
} catch (Throwable $error) {
    fwrite(STDERR, get_class($error) . ': ' . $error->getMessage() . "\n");
    exit(1);
}

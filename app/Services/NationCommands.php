<?php

namespace App\Services;

use App\Domain\{DeploymentCommand, DivisionType, MovementRules, OrderType, RelationState};
use App\Models\{Nation, Order, DivisionDetail, TerritoryDetail, Territory};

/** Shared application operations; HTTP callers retain authentication/request validation. */
final class NationCommands
{
    public function cancelOrders(Nation $nation, array $ids): void {
        $divisions = $this->activeDivisions($nation, $ids);
        $turn = $nation->getGame()->getCurrentTurn();
        $orders = Order::where('nation_id', $nation->id)->where('turn_id', $turn->id)
            ->whereIn('division_id', $divisions->modelKeys())->get()->keyBy('division_id');
        if ($orders->contains(fn ($order) => $order->getType() === OrderType::StandDown)) {
            abort(422, 'A unit standing down remains unavailable until next turn.');
        }
        $guarded = $orders->filter(fn ($order) => $order->getType() === OrderType::Guard)->keys();
        if ($orders->isNotEmpty()) Order::whereIn('id', $orders->modelKeys())->delete();
        foreach ($guarded as $id) {
            $division = $divisions->firstWhere('id', $id);
            $division->setRelation('nation', $nation);
            $division->setRelation('game', $nation->getGame());
            Order::createStandDownOrder($division);
        }
    }

    public function cancelDeployments(Nation $nation, array $ids): void {
        $deployments = $nation->getDetail()->deployments()->whereIn('id', $ids)->get();
        if ($deployments->count() !== count(array_unique($ids))) abort(422, 'Invalid pending deployment.');
        $nation->cancelDeployments(...$deployments->all());
    }

    public function disband(Nation $nation, array $ids): array {
        $divisions = $this->activeDivisions($nation, $ids);
        Order::where('nation_id', $nation->id)->where('turn_id', $nation->getGame()->getCurrentTurn()->id)
            ->whereIn('division_id', $divisions->modelKeys())->delete();
        $orders = $divisions->mapWithKeys(function ($division) use ($nation) {
            $division->setRelation('nation', $nation);
            $division->setRelation('game', $nation->getGame());
            return [$division->id => Order::createDisbandOrder($division)];
        });
        return array_map(fn ($id) => $orders[$id], $ids);
    }

    private function activeDivisions(Nation $nation, array $ids): \Illuminate\Database\Eloquent\Collection {
        $divisions = $nation->getDetail()->activeDivisions()->whereIn('id', $ids)->get();
        if ($divisions->count() !== count(array_unique($ids))) abort(422, 'Invalid active division.');
        return $divisions;
    }

    public function guard(Nation $nation, array $ids): array {
        $game = $nation->getGame();
        if (!$game->guard_enabled) abort(409, 'Guard orders are not enabled for this game.');
        if (count($ids) !== count(array_unique($ids))) abort(422, 'A division can receive only one guard order.');
        $divisions = $this->activeDivisions($nation, $ids);
        $turn = $game->getCurrentTurn();
        $orders = Order::where('nation_id', $nation->id)->where('turn_id', $turn->id)
            ->whereIn('division_id', $ids)->get()->keyBy('division_id');
        $guarded = $orders->filter(fn ($order) => $order->getType() === OrderType::Guard);
        $newIds = array_values(array_filter($ids, fn ($id) => !$guarded->has($id)));
        if ($orders->keys()->intersect($newIds)->isNotEmpty()) {
            abort(422, 'Guard can only be assigned to units without other orders.');
        }
        if (!$newIds) return array_map(fn ($id) => $guarded->get($id), $ids);
        $newDivisions = $divisions->whereIn('id', $newIds);
        $details = DivisionDetail::where('nation_id', $nation->id)->where('turn_id', $turn->id)
            ->whereIn('division_id', $newIds)->get()->keyBy('division_id');
        $owned = TerritoryDetail::where('turn_id', $turn->id)->where('owner_nation_id', $nation->id)
            ->whereIn('territory_id', $details->pluck('territory_id'))->pluck('territory_id');
        if ($owned->count() !== $details->pluck('territory_id')->unique()->count()) {
            abort(422, 'Guard units must be standing in territory their nation controls.');
        }
        $costs = $this->guardCosts($newDivisions);
        if (!$nation->getDetail($turn)->canAffordCosts($costs)) abort(422, 'Not enough resources for these guard orders.');
        $created = $newDivisions->mapWithKeys(function ($division) use ($nation, $game) {
            $division->setRelation('nation', $nation);
            $division->setRelation('game', $game);
            return [$division->id => Order::createGuardOrder($division)];
        });
        $result = $guarded->union($created);
        return array_map(fn ($id) => $result->get($id), $ids);
    }

    private function guardCosts(\Illuminate\Support\Collection $divisions): array {
        $costs = array_fill_keys(array_map(fn ($type) => $type->value, \App\Domain\ResourceType::cases()), 0.0);
        foreach ($divisions as $division) {
            foreach (DivisionType::getMeta($division->getDivisionType())->attackCosts as $resource => $cost) {
                $costs[$resource] += $cost * Order::GUARD_READINESS_COST_FACTOR;
            }
        }
        return $costs;
    }

    public function deploy(Nation $nation, array $commands): array {
        foreach ($commands as $command) {
            if (!$nation->getDetail()->territories()->whereKey($command->territoryId)->exists()) abort(422, 'Deployment territory is not owned.');
        }
        return $nation->deploy(...$commands);
    }

    public function move(Nation $nation, array $orders): array {
        $game = $nation->getGame();
        $turn = $game->getCurrentTurn();
        $detail = $nation->getDetail($turn);
        $ids = array_map(fn ($order) => (int) $order['division_id'], $orders);
        if (count(array_unique($ids)) !== count($ids)) abort(422, 'A division can receive only one order in a batch.');
        $divisions = $nation->divisions()->whereIn('id', $ids)->get()->keyBy('id');
        $details = DivisionDetail::where('nation_id', $nation->id)->where('turn_id', $turn->id)
            ->where('is_active', true)->whereIn('division_id', $ids)->get()->keyBy('division_id');
        if ($divisions->count() !== count($ids) || $details->count() !== count($ids)) abort(422, 'Invalid division or destination.');
        $territoryIds = $details->pluck('territory_id')->all();
        foreach ($orders as $order) {
            $territoryIds[] = $order['destination_territory_id'];
            array_push($territoryIds, ...($order['path_territory_ids'] ?? []));
        }
        $territories = $game->territories()->whereIn('id', array_unique($territoryIds))->get()->keyBy('id');
        $owners = TerritoryDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
            ->whereIn('territory_id', $territories->keys())->pluck('owner_nation_id', 'territory_id');
        if ($owners->count() !== $territories->count()) abort(422, 'Incomplete territory state. Refresh before continuing.');
        $relations = [];
        foreach (app(DiplomacyService::class)->export($game, $turn) as $relation) {
            if ($relation['nation_a_id'] === $nation->id) $relations[$relation['nation_b_id']] = $relation['state'];
            if ($relation['nation_b_id'] === $nation->id) $relations[$relation['nation_a_id']] = $relation['state'];
        }
        $canPass = fn (Territory $territory) => $owners->get($territory->id) !== null &&
            ($owners->get($territory->id) === $nation->id || ($relations[$owners->get($territory->id)] ?? null) === RelationState::Allied->name);
        $existing = Order::where('nation_id', $nation->id)->where('turn_id', $turn->id)->whereIn('division_id', $ids)->get()->keyBy('division_id');
        if ($existing->contains(fn ($order) => in_array($order->getType(), [OrderType::Guard, OrderType::StandDown], true))) {
            abort(422, 'Release Guard and complete the stand-down turn before moving this unit.');
        }
        $connections = Territory::getTerritoryConnections($game);
        $prepared = []; $types = []; $routes = []; $engagements = [];
        foreach ($orders as $order) {
            $id = (int) $order['division_id'];
            $division = $divisions[$id];
            $destination = $territories->get($order['destination_territory_id']);
            $origin = $territories->get($details[$id]->territory_id);
            if (!$destination || !$origin) abort(422, 'Invalid division or destination.');
            $path = [];
            foreach ($order['path_territory_ids'] ?? [] as $territoryId) {
                $territory = $territories->get($territoryId);
                if (!$territory) abort(422, 'Invalid path territory.');
                $path[] = $territory;
            }
            $meta = DivisionType::getMeta($division->getDivisionType());
            $key = json_encode([$origin->id, $division->division_type, $destination->id, array_map(fn ($t) => $t->id, $path)]);
            $routes[$key] ??= MovementRules::canReach($origin, $destination, $path, $meta, $connections, $canPass,
                ($relations[$owners->get($destination->id)] ?? null) === RelationState::Peace->name);
            if (!$routes[$key]) abort(422, 'Division cannot reach destination.');
            $engaging = !$canPass($destination);
            if ($engaging) {
                $engagements[$destination->id] ??= app(GameParticipants::class)->canEngage($nation, $destination);
                if (!$engagements[$destination->id]) abort(422, 'This target is protected from automated attacks.');
                if (!in_array($existing->get($id)?->getType(), [OrderType::Attack, OrderType::Raid], true)) $types[] = $division->getDivisionType();
            }
            $rebase = $meta->canFly ? null : array_last($path);
            $type = !$engaging ? OrderType::Move : ($rebase ? OrderType::Attack : OrderType::Raid);
            $prepared[] = [$division, $type, $engaging ? $rebase : $destination, $engaging ? $destination : null];
        }
        // Validate the entire batch and its reservation before replacing any existing order.
        if (!$detail->canAffordCosts(DivisionType::calculateTotalAttackCostsByResourceType(...$types))) abort(422, 'Not enough resources for these attacks.');
        if ($existing->isNotEmpty()) Order::whereIn('id', $existing->modelKeys())->delete();
        return array_map(function ($row) use ($nation, $game, $turn, $owners) {
            [$division, $type, $destination, $target] = $row;
            $order = new Order();
            $order->game_id = $game->id;
            $order->nation_id = $nation->id;
            $order->division_id = $division->id;
            $order->turn_id = $turn->id;
            $order->type = $type->value;
            $order->destination_territory_id = $type === OrderType::Raid ? null : $destination?->id;
            $order->target_territory_id = $target?->id;
            if ($target && $game->diplomacy_enabled) {
                $order->intent_captured = true;
                $order->intended_owner_nation_id = $owners->get($target->id);
            }
            $order->save();
            $order->setRelation('destinationTerritory', $destination);
            $order->setRelation('targetTerritory', $target);
            return $order;
        }, $prepared);
    }
}

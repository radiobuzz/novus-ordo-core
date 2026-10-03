<?php

namespace App\Services;
use App\Services\Resources\ResourceCatalogue;
use App\Domain\Resources\Quantity as Q;

use App\Domain\{DivisionType, OrderType, TerrainType};
use App\Models\{Division, DivisionDetail, Game, NationResourceStockpile, News, Order, Territory, TerritoryDetail, Turn};
use Illuminate\Support\Collection;

/** Pre-allocates each Guard unit once before randomized battle resolution. */
final class GuardAllocator
{
    public function allocate(Game $game, Turn $current, Turn $next, Collection $attackGroups): Collection {
        if (!(bool) ($game->guard_enabled ?? false) || $attackGroups->isEmpty()) return collect();

        $catalogue = ResourceCatalogue::forGame($game);
        $diplomacy = app(DiplomacyService::class);
        $participants = app(GameParticipants::class);
        $territories = $game->territories()->get()->keyBy('id');
        $nations = $game->nations()->get()->keyBy('id');
        $owners = TerritoryDetail::where('game_id', $game->id)->where('turn_id', $next->id)
            ->pluck('owner_nation_id', 'territory_id');
        $connections = Territory::getTerritoryConnections($game);
        $active = $game->activeDivisionsInTurn($current)->get()->keyBy('id');
        $nextActive = $game->activeDivisionsInTurn($next)->get()->keyBy('id');
        $details = DivisionDetail::where('game_id', $game->id)->where('turn_id', $next->id)
            ->whereIn('division_id', $nextActive->keys())->get()->keyBy('division_id');
        $orders = Order::where('game_id', $game->id)->where('turn_id', $current->id)
            ->whereIn('division_id', $active->keys())->get()->keyBy('division_id');
        $guards = $active->filter(fn (Division $division) =>
            $orders->get($division->id)?->getType() === OrderType::Guard
            && $details->get($division->id)?->isActive()
        );
        if ($guards->isEmpty()) return collect();
        $stockpiles = NationResourceStockpile::where('game_id', $game->id)->where('turn_id', $next->id)
            ->whereIn('nation_id', $guards->pluck('nation_id')->unique())->lockForUpdate()->get()
            ->keyBy(fn (NationResourceStockpile $stockpile) => $stockpile->nation_id . ':' . $catalogue->key($stockpile->resource_id));
        $remaining = $stockpiles->mapWithKeys(fn (NationResourceStockpile $stockpile, string $key) =>
            [$key => $stockpile->available_quantity]
        )->all();

        $threats = collect();
        foreach ($attackGroups as $group) {
            $attackers = $group->filter(fn (Division $division) => $details->get($division->id)?->isActive());
            if ($attackers->isEmpty()) continue;
            $first = $attackers->first();
            $target = $territories->get($orders->get($first->id)?->target_territory_id);
            $owner = $nations->get($owners->get($target?->id));
            $attacker = $nations->get($first->nation_id);
            if (!$target || !$owner || !$attacker
                || $diplomacy->state($attacker, $owner, $next)->protects()
                || !$participants->canEngage($attacker, $target, $next)) continue;
            $power = $attackers->sum(fn (Division $division) =>
                DivisionType::getMeta($division->getDivisionType())->attackPower
            );
            $existing = $threats->get($target->id);
            if (!$existing || $power > $existing['attack']) {
                $threats->put($target->id, ['territory' => $target, 'owner' => $owner, 'attack' => $power]);
            }
        }
        if ($threats->isEmpty()) return collect();

        $guardIds = array_fill_keys($guards->modelKeys(), true);
        $defense = array_fill_keys($threats->keys()->all(), 0);
        foreach ($nextActive as $division) {
            $detail = $details->get($division->id);
            $threat = $detail ? $threats->get($detail->territory_id) : null;
            if (!$threat || isset($guardIds[$division->id]) || $division->getNationId() !== $threat['owner']->id) continue;
            $defense[$detail->territory_id] += DivisionType::getMeta($division->getDivisionType())->defensePower;
        }

        $available = $guards->mapWithKeys(function (Division $division) use ($details, $catalogue) {
            $detail = $details[$division->id];
            $meta = DivisionType::getMeta($division->getDivisionType());
            return [$division->id => [
                'division' => $division,
                'origin_id' => (int) $detail->territory_id,
                'meta' => $meta,
                'response_costs' => collect($catalogue->costs('operation', $division->getDivisionType()))
                    ->map(fn ($cost) => Q::mul($cost, (string) Order::GUARD_RESPONSE_COST_FACTOR))
                    ->filter(fn ($cost) => Q::cmp($cost, '0') > 0)->all(),
            ]];
        });
        $responses = collect();
        $distances = [];
        $routing = app(GuardRouteFinder::class);
        while ($available->isNotEmpty()) {
            $choices = [];
            foreach ($threats as $territoryId => $threat) {
                $deficit = $threat['attack'] - $defense[$territoryId];
                if ($deficit <= 0) continue;
                foreach ($available as $divisionId => $candidate) {
                    if ($candidate['division']->getNationId() !== $threat['owner']->id) continue;
                    if (!$this->canAffordResponse($candidate['division']->getNationId(), $candidate['response_costs'], $remaining)) continue;
                    $key = $divisionId . ':' . $territoryId;
                    if (!array_key_exists($key, $distances)) {
                        $distances[$key] = $routing->distance(
                            $candidate['origin_id'], $territoryId, $candidate['division']->getNationId(),
                            $candidate['meta']->moves, $candidate['meta']->canFly,
                            $territories, $connections, $owners,
                        );
                    }
                    $distance = $distances[$key];
                    if ($distance !== null) $choices[] = compact('deficit', 'territoryId', 'divisionId', 'distance');
                }
            }
            if (!$choices) break;
            usort($choices, fn ($a, $b) =>
                $b['deficit'] <=> $a['deficit'] ?: $a['territoryId'] <=> $b['territoryId']
                    ?: $a['distance'] <=> $b['distance'] ?: $a['divisionId'] <=> $b['divisionId']
            );
            $choice = $choices[0];
            $candidate = $available->pull($choice['divisionId']);
            $target = $threats[$choice['territoryId']]['territory'];
            $origin = $territories[$candidate['origin_id']];
            $this->payResponse(
                $candidate['division']->getNationId(), $candidate['response_costs'], $stockpiles, $remaining
            );
            $details[$choice['divisionId']]->moveTo($target);
            $defense[$choice['territoryId']] += $candidate['meta']->defensePower;
            $responses->put($choice['territoryId'], $responses->get($choice['territoryId'], collect())->push([
                'division' => $candidate['division'], 'origin' => $origin,
            ]));
        }
        return $responses;
    }

    /** Return surviving Guard aircraft after every battle has resolved; ground responders hold their new position. */
    public function returnAircraft(Game $game, Turn $turn, Collection $responses): void {
        $aircraft = $responses
            ->filter(fn (array $response) => DivisionType::getMeta($response['division']->getDivisionType())->canFly)
            ->unique(fn (array $response) => $response['division']->getId())
            ->values();
        if ($aircraft->isEmpty()) return;

        $details = DivisionDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
            ->whereIn('division_id', $aircraft->pluck('division.id'))->get()->keyBy('division_id');
        $territories = $game->territories()->get()->keyBy('id');
        $owners = TerritoryDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
            ->pluck('owner_nation_id', 'territory_id');
        $connections = Territory::getTerritoryConnections($game);
        $disbanded = [];

        foreach ($aircraft as $response) {
            /** @var Division $division */
            $division = $response['division'];
            $detail = $details->get($division->getId());
            if (!$detail?->isActive()) continue;

            $nationId = $division->getNationId();
            /** @var Territory $origin */
            $origin = $response['origin'];
            if ((int) ($owners->get($origin->getId()) ?? 0) === $nationId) {
                $detail->moveTo($origin);
                continue;
            }

            $owned = $territories->filter(fn (Territory $territory) =>
                $territory->getTerrainType() !== TerrainType::Water
                && (int) ($owners->get($territory->getId()) ?? 0) === $nationId
            )->keyBy('id');
            $destination = $this->nearestTerritory((int) $detail->territory_id, $owned, $connections)
                ?? $owned->sortKeys()->first();
            if ($destination) {
                $detail->moveTo($destination);
            } else {
                $detail->disband();
                $disbanded[$nationId] = ($disbanded[$nationId] ?? 0) + 1;
            }
        }

        foreach ($disbanded as $nationId => $count) {
            $nation = $game->nations()->find($nationId);
            if (!$nation) continue;
            $name = News::getNationUsualNameTag($nation->getDetail($turn));
            News::create($turn, "$name disbanded $count stranded Guard aircraft after losing every territory.");
        }
    }

    private function nearestTerritory(int $originId, Collection $destinations, Collection $connections): ?Territory {
        $frontier = [$originId];
        $seen = [];
        while ($frontier) {
            sort($frontier);
            $next = [];
            foreach ($frontier as $territoryId) {
                if (isset($seen[$territoryId])) continue;
                $seen[$territoryId] = true;
                if ($destinations->has($territoryId)) return $destinations->get($territoryId);
                foreach ($connections->get($territoryId, collect()) as $edge) {
                    if (!isset($seen[$edge->connectedTerritoryId])) $next[] = $edge->connectedTerritoryId;
                }
            }
            $frontier = array_values(array_unique($next));
        }
        return null;
    }

    /** Costs and remaining stock use exact six-decimal quantities. */
    private function canAffordResponse(int $nationId, array $costs, array $remaining): bool {
        foreach ($costs as $resource => $cost) {
            if (Q::cmp($remaining[$nationId . ':' . $resource] ?? '0', $cost) < 0) return false;
        }
        return true;
    }

    private function payResponse(int $nationId, array $costs, Collection $stockpiles, array &$remaining): void {
        foreach ($costs as $resource => $cost) {
            $key = $nationId . ':' . $resource;
            $stockpile = $stockpiles[$key];
            $detail = \App\Models\NationDetail::where('nation_id', $nationId)->where('turn_id', $stockpile->turn_id)->firstOrFail();
            if ($resource === $detail->resources()->role('treasury')) {
                app(EconomyService::class)->settleResponseCost($detail, $stockpile, $cost);
                $remaining[$key] = $stockpile->available_quantity;
                continue;
            }
            $stockpile->removeQuantity($cost);
            $remaining[$key] = $stockpile->available_quantity;
            $report = $detail?->resource_report;
            if (isset($report[$resource])) {
                $report[$resource]['response_expenses'] = Q::add($report[$resource]['response_expenses'] ?? '0', $cost);
                $report[$resource]['government_closing'] = $remaining[$key];
                $report[$resource]['reserve_shortfall'] = Q::max('0', Q::sub($report[$resource]['reserve_target'], $remaining[$key]));
                if ($resource === $detail->resources()->role('nutrition')) {
                    $economy = $detail->economy_report; $economy['food'] = $report[$resource]; $detail->economy_report = $economy;
                }
                $detail->resource_report = $report;
                $detail->save();
            }
        }
    }

}

<?php

namespace App\Services;
use App\Services\Resources\ResourceCatalogue;
use App\Domain\Resources\Quantity as Q;

use App\Domain\{DivisionType, OrderType};
use App\Models\{Division, DivisionDetail, Nation, Order, Territory, TerritoryDetail, Turn};
use App\ReadModels\{DefenseCoverageInfo, DefenseCoverageTerritoryInfo};

/** Maximum affordable Guard response to each owned territory considered as the sole attack. */
final class DefenseCoverageService
{
    public function export(Nation $nation, Turn $turn): DefenseCoverageInfo
    {
        $game = $nation->getGame();
        $nationId = $nation->getId();
        $catalogue = ResourceCatalogue::forGame($game);
        $ownedIds = TerritoryDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
            ->where('owner_nation_id', $nationId)->pluck('territory_id')->sort()->values();
        if ($ownedIds->isEmpty() || !(bool) ($game->guard_enabled ?? false)) {
            return new DefenseCoverageInfo(
                $game->id,
                $turn->getNumber(),
                $ownedIds->map(fn ($id) => new DefenseCoverageTerritoryInfo($id, 0, 0))->all(),
            );
        }

        $active = $game->activeDivisionsInTurn($turn)->where('nation_id', $nationId)->get()->keyBy('id');
        $orders = Order::where('nation_id', $nationId)->where('turn_id', $turn->id)
            ->whereIn('division_id', $active->keys())->get()->keyBy('division_id');
        $guardIds = $orders->filter(fn (Order $order) => $order->getType() === OrderType::Guard)->keys();
        $details = DivisionDetail::where('nation_id', $nationId)->where('turn_id', $turn->id)
            ->whereIn('division_id', $guardIds)->get()->keyBy('division_id');
        $guards = $active->only($guardIds->all())->map(function (Division $division) use ($details, $catalogue) {
            $meta = DivisionType::getMeta($division->getDivisionType());
            return [
                'division_id' => $division->id,
                'origin_id' => (int) $details[$division->id]->territory_id,
                'meta' => $meta,
                'response_costs' => collect($catalogue->costs('operation', $division->getDivisionType()))
                    ->map(fn ($cost) => Q::mul($cost, (string) Order::GUARD_RESPONSE_COST_FACTOR))
                    ->filter(fn ($cost) => Q::cmp($cost, '0') > 0)->all(),
            ];
        })->values();
        $territories = $game->territories()->get()->keyBy('id');
        $owners = TerritoryDetail::where('game_id', $game->id)->where('turn_id', $turn->id)
            ->pluck('owner_nation_id', 'territory_id');
        $connections = Territory::getTerritoryConnections($game);
        $detail = $nation->getDetail($turn);
        $resourceIds = $guards->flatMap(fn ($guard) => array_keys($guard['response_costs']))->unique();
        $available = $resourceIds->mapWithKeys(fn ($resource) => [
            $resource => $detail->getAvailableProductionQuantity($resource),
        ])->all();
        $routing = app(GuardRouteFinder::class);
        $candidatesByTerritory = $ownedIds->mapWithKeys(fn ($id) => [$id => []])->all();
        foreach ($guards as $guard) {
            $reachable = $routing->reachable(
                $guard['origin_id'], $nationId, $guard['meta']->moves, $guard['meta']->canFly,
                $territories, $connections, $owners,
            );
            foreach ($reachable as $territoryId => $distance) {
                if ($territoryId === $guard['origin_id'] || !isset($candidatesByTerritory[$territoryId])) continue;
                $candidatesByTerritory[$territoryId][] = [...$guard, 'distance' => $distance];
            }
        }
        $rows = [];

        foreach ($ownedIds as $territoryId) {
            $candidates = $candidatesByTerritory[$territoryId];
            usort($candidates, fn ($a, $b) =>
                $a['distance'] <=> $b['distance'] ?: $a['division_id'] <=> $b['division_id']
            );
            $remaining = $available;
            $defense = 0;
            $count = 0;
            foreach ($candidates as $candidate) {
                if (!$this->canAfford($candidate['response_costs'], $remaining)) continue;
                foreach ($candidate['response_costs'] as $resource => $cost) $remaining[$resource] = Q::sub($remaining[$resource], $cost);
                $defense += $candidate['meta']->defensePower;
                $count++;
            }
            $rows[] = new DefenseCoverageTerritoryInfo($territoryId, $defense, $count);
        }

        return new DefenseCoverageInfo($game->id, $turn->getNumber(), $rows);
    }

    private function canAfford(array $costs, array $remaining): bool
    {
        foreach ($costs as $resource => $cost) if (Q::cmp($remaining[$resource] ?? '0', $cost) < 0) return false;
        return true;
    }
}

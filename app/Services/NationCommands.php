<?php

namespace App\Services;

use App\Domain\{DeploymentCommand, DivisionType};
use App\Models\{Nation, Order};

/** Shared application operations; HTTP callers retain authentication/request validation. */
final class NationCommands
{
    public function cancelOrders(Nation $nation, array $ids): void {
        foreach ($ids as $id) $nation->getDetail()->getActiveDivisionWithId($id)->cancelOrder();
    }

    public function cancelDeployments(Nation $nation, array $ids): void {
        $deployments = $nation->getDetail()->deployments()->whereIn('id', $ids)->get();
        if ($deployments->count() !== count(array_unique($ids))) abort(422, 'Invalid pending deployment.');
        $nation->cancelDeployments(...$deployments->all());
    }

    public function disband(Nation $nation, array $ids): array {
        return array_map(fn ($id) => $nation->getDetail()->getActiveDivisionWithId($id)->sendDisbandOrder(), $ids);
    }

    public function deploy(Nation $nation, array $commands): array {
        foreach ($commands as $command) {
            if (!$nation->getDetail()->territories()->whereKey($command->territoryId)->exists()) abort(422, 'Deployment territory is not owned.');
        }
        return $nation->deploy(...$commands);
    }

    public function move(Nation $nation, array $orders): array {
        $detail = $nation->getDetail(); $game = $nation->getGame(); $prepared = []; $types = []; $seen = [];
        foreach ($orders as $order) {
            $id = (int) $order['division_id'];
            if (isset($seen[$id])) abort(422, 'A division can receive only one order in a batch.');
            $seen[$id] = true;
            $division = $detail->activeDivisions()->find($id);
            $destination = $game->territories()->find($order['destination_territory_id']);
            if (!$division || !$destination) abort(422, 'Invalid division or destination.');
            $path = [];
            foreach ($order['path_territory_ids'] ?? [] as $territoryId) {
                $territory = $game->territories()->find($territoryId);
                if (!$territory) abort(422, 'Invalid path territory.');
                $path[] = $territory;
            }
            if (!$division->getDetail()->canMoveTo($destination, ...$path)) abort(422, 'Division cannot reach destination.');
            if ($detail->isHostileTerritory($destination)) {
                if (!app(GameParticipants::class)->canEngage($nation, $destination)) abort(422, 'This target is protected from automated attacks.');
                if (!$division->getDetail()->isOperating()) $types[] = $division->getDivisionType();
            }
            $prepared[] = [$division, $destination, $path];
        }
        if (!$detail->canAffordCosts(DivisionType::calculateTotalAttackCostsByResourceType(...$types))) abort(422, 'Not enough resources for these attacks.');
        return array_map(fn ($row) => $row[0]->sendMoveAttackOrder($row[1], ...$row[2]), $prepared);
    }
}

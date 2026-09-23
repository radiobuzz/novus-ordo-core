<?php
namespace App\Services;

use App\Domain\{DivisionType, LaborPoolConstants, ProductionBidConstants, ResourceType};
use App\Models\{Deployment, Division, LeaderDetail, Nation, ProductionBid};

/** Same owner payload for the HTTP client and internal players. */
final class PlayerWorkspace
{
    public function export(Nation $nation): array {
        $detail = $nation->getDetail();
        $turn = $detail->getTurn();
        return [
            'game_id' => $nation->getGame()->getId(),
            'turn_number' => $turn->getNumber(),
            'nation' => $detail->exportForOwner(),
            'identity' => $detail->export(),
            'leaders' => LeaderDetail::getAll($turn)
                ->filter(fn (LeaderDetail $leader) => $leader->nation_id === $nation->getId())
                ->map(fn (LeaderDetail $leader) => $leader->export())->values(),
            'budget' => $detail->exportBudget(),
            'production_planning' => $detail->exportProductionPlanning(),
            'turn_summary' => $detail->exportTurnSummary(),
            'deployment_limits' => collect(DivisionType::cases())->mapWithKeys(fn (DivisionType $type) => [
                $type->name => $detail->getMaximumAffordableDeployment($type),
            ]),
            'bids' => ProductionBid::getAllCommandBids($detail)
                ->map(fn (ProductionBid $bid) => $bid->exportForOwner())->values(),
            'divisions' => $detail->activeDivisions()->get()
                ->map(fn (Division $division) => $division->getDetail()->exportForOwner())->values(),
            'deployments' => $detail->deployments()->get()
                ->map(fn (Deployment $deployment) => $deployment->export())->values(),
            'definitions' => [
                'divisions' => DivisionType::exportMetas(),
                'resources' => ResourceType::exportMetas(),
                'bid_resources' => collect(ResourceType::cases())
                    ->filter(fn (ResourceType $resource) => ResourceType::getMeta($resource)->canPlaceCommand)
                    ->map(fn (ResourceType $resource) => $resource->name)->values(),
                'labor_per_unit' => LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION,
                'max_bid_labor' => ProductionBidConstants::MAX_LABOR_PER_UNIT_LIMIT,
            ],
        ];
    }
}

<?php
namespace App\Services;

use App\Domain\{DivisionType, LaborPoolConstants, ProductionBidConstants, ResourceType};
use App\Models\{Deployment, DivisionDetail, LeaderDetail, Nation, Order, ProductionBid, Turn};
use App\ReadModels\OwnedDivisionInfo;

/** Same owner payload for the HTTP client and internal players. */
final class PlayerWorkspace
{
    public function export(Nation $nation): array {
        $detail = $nation->getDetail();
        $turn = $detail->getTurn();
        return [
            'game_id' => $nation->getGame()->getId(),
            'turn_number' => $turn->getNumber(),
            'turn_context_revision' => $nation->getGame()->fresh()->turn_context_revision,
            'diplomacy' => [
                'enabled' => (bool) $nation->getGame()->diplomacy_enabled,
                'relations' => app(DiplomacyService::class)->export($nation->getGame(), $turn),
                'grantable' => $nation->getGame()->diplomacy_enabled ? app(NationGrantService::class)->available($nation) : [],
                'ai_nation_ids' => $nation->getGame()->diplomacy_enabled
                    ? $nation->getGame()->nations()->get()->filter(fn ($other) => !app(GameParticipants::class)->canCommand($other))->modelKeys() : [],
            ],
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
            'divisions' => $this->divisions($nation, $turn),
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

    private function divisions(Nation $nation, Turn $turn): \Illuminate\Support\Collection {
        $rows = DivisionDetail::where('division_details.nation_id', $nation->id)
            ->where('division_details.turn_id', $turn->id)->where('division_details.is_active', true)
            ->join('divisions', 'divisions.id', '=', 'division_details.division_id')
            ->where('divisions.nation_id', $nation->id)
            ->select('division_details.division_id', 'division_details.nation_id', 'division_details.territory_id', 'divisions.division_type')
            ->orderBy('division_details.division_id')->get();
        $orders = Order::where('nation_id', $nation->id)->where('turn_id', $turn->id)
            ->whereIn('division_id', $rows->pluck('division_id'))
            ->with(['destinationTerritory', 'targetTerritory'])->get()->keyBy('division_id');
        return $rows->map(fn ($row) => new OwnedDivisionInfo(
            division_id: $row->division_id, nation_id: $row->nation_id, territory_id: $row->territory_id,
            division_type: DivisionType::from($row->division_type)->name,
            order: $orders->get($row->division_id)?->exportForOwner(),
        ));
    }
}

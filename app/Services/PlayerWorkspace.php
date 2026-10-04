<?php
namespace App\Services;

use App\Domain\DivisionType;
use App\Facades\Metacache;
use App\Models\{Deployment, DivisionDetail, LeaderDetail, Nation, Order, Turn};
use App\ReadModels\OwnedDivisionInfo;

/** Same owner payload for the HTTP client and internal players. */
final class PlayerWorkspace
{
    public function export(Nation $nation): array {
        $detail = $nation->getDetail();
        $turn = $detail->getTurn();
        $policies = app(\App\Services\Policies\PolicyService::class)->state($nation, $turn);
        $resolved = app(EconomyService::class)->resolve($detail);
        $projection = app(\App\Services\Resources\ResourceLedger::class)->preview($detail, result: $resolved);
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
            'demography' => [
                'population' => Metacache::remember($detail->getPopulationSize(...)),
                'growth_rate' => Metacache::remember($detail->getPopulationGrowthRate(...)),
            ],
            'leaders' => LeaderDetail::getAll($turn)
                ->filter(fn (LeaderDetail $leader) => $leader->nation_id === $nation->getId())
                ->map(fn (LeaderDetail $leader) => $leader->export())->values(),
            'budget' => $detail->exportBudget($projection),
            'policies' => $policies,
            'economy' => ($policies['enabled'] ?? false) ? app(EconomyService::class)->overview($detail, $policies, $resolved) : null,
            'production_planning' => $projection,
            'turn_summary' => $detail->exportTurnSummary(),
            'deployment_limits' => collect(DivisionType::cases())->mapWithKeys(fn (DivisionType $type) => [
                $type->name => $detail->getMaximumAffordableDeployment($type),
            ]),
            'acquisitions' => array_values(app(\App\Services\Resources\ResourceLedger::class)->plans($detail)),
            'divisions' => $this->divisions($nation, $turn),
            'deployments' => $detail->deployments()->get()
                ->map(fn (Deployment $deployment) => $deployment->export())->values(),
            'definitions' => [
                'divisions' => DivisionType::exportMetas($nation->getGame()),
                ...\App\Services\Resources\ResourceCatalogue::forGame($nation->getGame())->export(),
                'acquisition_resources' => array_keys(\App\Services\Resources\ResourceCatalogue::forGame($nation->getGame())->producers()),
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

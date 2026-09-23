<?php

namespace App\Services;

use App\Domain\Ranking;
use App\Domain\ResourceType;
use App\Models\Game;
use App\Models\Territory;
use App\Models\Turn;
use App\ReadModels\RankingHistoryInfo;
use App\ReadModels\RankingHistoryPointInfo;
use App\ReadModels\RankingHistoryRankingInfo;
use App\ReadModels\RankingHistorySeriesInfo;
use Illuminate\Support\Facades\DB;

final class RankingHistoryService
{
    public function export(Game $game, Turn $throughTurn): RankingHistoryInfo
    {
        return DB::transaction(fn () => $this->readConsistentHistory($game, $throughTurn));
    }

    private function readConsistentHistory(Game $game, Turn $throughTurn): RankingHistoryInfo
    {
        $nationTurns = DB::table('nation_details as nation_detail')
            ->join('turns as turn', 'turn.id', '=', 'nation_detail.turn_id')
            ->where('nation_detail.game_id', $game->getId())
            ->where('turn.game_id', $game->getId())
            ->where('turn.number', '<=', $throughTurn->getNumber())
            ->orderBy('turn.number')
            ->orderBy('nation_detail.nation_id')
            ->get([
                'nation_detail.turn_id',
                'turn.number as turn_number',
                'nation_detail.nation_id',
            ]);

        $turnIds = $nationTurns->pluck('turn_id')->unique()->values();
        if ($turnIds->isEmpty()) {
            return new RankingHistoryInfo($game->getId(), $throughTurn->getNumber(), []);
        }

        $territoryValues = DB::table('territory_details as detail')
            ->join('territories as territory', 'territory.id', '=', 'detail.territory_id')
            ->where('detail.game_id', $game->getId())
            ->whereIn('detail.turn_id', $turnIds)
            ->whereNotNull('detail.owner_nation_id')
            ->groupBy('detail.turn_id', 'detail.owner_nation_id')
            ->get([
                'detail.turn_id',
                'detail.owner_nation_id as nation_id',
                DB::raw('count(*) as territory_count'),
                DB::raw('sum(detail.population_size) as population'),
                DB::raw('sum(floor(territory.usable_land_ratio * ' . Territory::TERRITORY_AREA_KM2 . ')) as land_area'),
            ])
            ->keyBy(fn ($row) => $this->rowKey($row->turn_id, $row->nation_id));

        $armyValues = DB::table('division_details')
            ->where('game_id', $game->getId())
            ->whereIn('turn_id', $turnIds)
            ->where('is_active', true)
            ->groupBy('turn_id', 'nation_id')
            ->get(['turn_id', 'nation_id', DB::raw('count(*) as army_size')])
            ->keyBy(fn ($row) => $this->rowKey($row->turn_id, $row->nation_id));

        $wealthValues = DB::table('nation_resource_stockpiles')
            ->where('game_id', $game->getId())
            ->whereIn('turn_id', $turnIds)
            ->where('resource_type', ResourceType::Capital->value)
            ->groupBy('turn_id', 'nation_id')
            ->get(['turn_id', 'nation_id', DB::raw('max(available_quantity) as wealth')])
            ->keyBy(fn ($row) => $this->rowKey($row->turn_id, $row->nation_id));

        $valuesByTurn = [];
        foreach ($nationTurns as $nationTurn) {
            $key = $this->rowKey($nationTurn->turn_id, $nationTurn->nation_id);
            $territory = $territoryValues->get($key);
            $army = $armyValues->get($key);
            $wealth = $wealthValues->get($key);
            $valuesByTurn[$nationTurn->turn_number][$nationTurn->nation_id] = [
                'land_area' => (int) round($territory?->land_area ?? 0),
                'territories' => (int) ($territory?->territory_count ?? 0),
                'population' => (int) ($territory?->population ?? 0),
                'army_size' => (int) ($army?->army_size ?? 0),
                'wealth' => (float) ($wealth?->wealth ?? 0),
            ];
        }

        return new RankingHistoryInfo(
            game_id: $game->getId(),
            through_turn: $throughTurn->getNumber(),
            rankings: collect(Ranking::getRankings())
                ->map(fn (Ranking $ranking) => $this->exportRanking($ranking, $valuesByTurn))
                ->values()
                ->all(),
        );
    }

    private function exportRanking(Ranking $ranking, array $valuesByTurn): RankingHistoryRankingInfo
    {
        $pointsByNation = [];
        foreach ($valuesByTurn as $turnNumber => $valuesByNation) {
            $ranked = $ranking->rankValues(
                collect($valuesByNation)->mapWithKeys(
                    fn (array $values, int $nationId) => [$nationId => $values[$ranking->key]],
                ),
            );
            $rank = 1;
            foreach ($ranked as $nationId => $value) {
                $pointsByNation[$nationId][] = new RankingHistoryPointInfo(
                    turn_number: $turnNumber,
                    rank: $rank++,
                    value: $value,
                );
            }
        }

        $series = collect($pointsByNation)
            ->map(fn (array $points, int $nationId) => new RankingHistorySeriesInfo($nationId, $points))
            ->sortBy(fn (RankingHistorySeriesInfo $entry) => array_last($entry->points)->rank)
            ->values()
            ->all();

        return new RankingHistoryRankingInfo(
            key: $ranking->key,
            title: $ranking->title,
            data_unit: $ranking->unit->name,
            series: $series,
        );
    }

    private function rowKey(int $turnId, int $nationId): string
    {
        return "$turnId:$nationId";
    }
}

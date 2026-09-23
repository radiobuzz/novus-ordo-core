<?php

namespace App\Models;

use App\Domain\ResourceType;
use App\Domain\StatUnit;
use App\Domain\TerrainType;
use App\Domain\TerritoryStat;
use App\Facades\Metacache;
use App\ModelTraits\ReplicatesForTurns;
use App\ReadModels\DemographicStat;
use App\ReadModels\TerritoryTurnOwnerInfo;
use App\ReadModels\TerritoryTurnPublicInfo;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use PhpOption\Option;

class NeutralOwnership {}

class TerritoryDetail extends Model
{
    use ReplicatesForTurns;

    public const string FIELD_OWNER_NATION_ID = 'owner_nation_id';
    public const string FIELD_POPULATION_SIZE = 'population_size';
    private const int DEFAULT_POPULATION_SIZE = 250_000;
    private const float HOME_TERRITORY_STARTING_LOYALTY_RATIO = 1.00;
    private const float CONQUERED_TERRITORY_STARTING_LOYALTY_RATIO = 0.00;
    private const float NEUTRAL_TERRITORY_STARTING_LOYALTY_RATIO = 0.50;
    public const int UNIT_OF_POPULATION_SIZE = 1_000_000;
    public const float BASE_POPULATION_GROWTH_RATE = 0.01;

    public function territory(): BelongsTo {
        return $this->belongsTo(Territory::class);
    }

    public function getTerritory(): Territory {
        return $this->territory;
    }

    public function getTerritoryId(): int {
        return $this->territory_id;
    }

    public function turn(): BelongsTo {
        return $this->belongsTo(Turn::class);
    }

    public function getTurn(): Turn {
        return $this->turn;
    }

    public function owner(): BelongsTo {
        return $this->belongsTo(Nation::class, TerritoryDetail::FIELD_OWNER_NATION_ID);
    }

    public function getOwnerOrNull(): ?Nation {
        return Nation::withoutGlobalScopes()->find($this->owner_nation_id);
    }

    public function getGameId(): int {
        return $this->game_id;
    }

    public function getOwnerNationId(): int {
        return $this->owner_nation_id;
    }
    
    public function getTurnId(): int {
        return $this->turn_id;
    }

    public function allLoyalties(): Builder {
        return NationTerritoryLoyalty::where('territory_id', $this->territory_id)
            ->where('turn_id', $this->turn_id);

    }

    public function isOwnedByNation(): bool {
        return !is_null($this->owner);
    }

    public function ownerIdEquals(int $nationId): bool {
        return $this->owner_nation_id === $nationId;
    }

    public function getPopulationSize(): int {
        return $this->population_size;
    }

    public function setPopulationSize(int $population): void {
        $this->population_size = min($this->getTerritory()->getMaxPopulationSize(), $population);
        $this->save();
    }

    private static function calculatePopulationGrowthRate(float $populationGrowthMultiplier): float {
        return TerritoryDetail::BASE_POPULATION_GROWTH_RATE * $populationGrowthMultiplier;
    }

    public function getPopulationGrowthRate(): float {
        return Option::fromValue($this->getOwnerOrNull())
            ->map(fn (Nation $n) => TerritoryDetail::calculatePopulationGrowthRate(Metacache::remember($n->getDetail($this->getTurn())->getPopulationGrowthMultiplier(...))))
            ->getOrElse(0.00);
    }

    public static function getPopulationLoyaltyForNation(Nation $nation, Turn $turn): float {
        $populationsAndLoyalties = DB::table('territory_details')
            ->where('territory_details.owner_nation_id', $nation->getId())
            ->where('territory_details.turn_id', $turn->getId())
            ->join('nation_territory_loyalties', fn ($join) => $join
                ->on('territory_details.territory_id', '=', 'nation_territory_loyalties.territory_id')
                ->on('nation_territory_loyalties.turn_id', '=', 'territory_details.turn_id')
                ->on('nation_territory_loyalties.nation_id', '=', 'territory_details.owner_nation_id')
            )
            ->select(TerritoryDetail::FIELD_POPULATION_SIZE . ' as population_size', NationTerritoryLoyalty::FIELD_LOYALTY . ' as raw_loyalty')
            ->get();

        $populationSize = $populationsAndLoyalties->sum('population_size');
        return $populationSize > 0 ? $populationsAndLoyalties->reduce(fn (float $sum, $info) => $sum + $info->population_size * $info->raw_loyalty, 0) / $populationSize / 100 : 0;
    }

    public function getOwnerDivisions(): Collection {
        $ownerOrNull = $this->getOwnerOrNull();
        if ($ownerOrNull === null) {
            return collect();
        }
        $owner = Nation::notNull($ownerOrNull);

        return $owner->getDetail($this->getTurn())->activeDivisions()
            ->whereHas('details', fn (Builder $query) => $query
                ->where('turn_id', $this->turn_id)
                ->where('territory_id', $this->territory_id)
            )
            ->get();
    }

    public static function createRuleOwnedByNation(Nation $nation, Turn $turn):Exists {
        return Rule::exists(TerritoryDetail::class, 'territory_id')
            ->where('turn_id', $turn->getId())
            ->where('owner_nation_id', $nation->getId());
    }

    public function conquer(Nation|NeutralOwnership $newOwner): void {
        if ($newOwner instanceof Nation) {
            $currentOwner = $this->getOwnerOrNull()??new NeutralOwnership;

            if ($currentOwner instanceof NeutralOwnership) {
                NationTerritoryLoyalty::setLoyaltyRatioIfNotSet($newOwner, $this->getTerritory(), $this->getTurn(), TerritoryDetail::NEUTRAL_TERRITORY_STARTING_LOYALTY_RATIO);
            }
            else {
                NationTerritoryLoyalty::setLoyaltyRatioIfNotSet($newOwner, $this->getTerritory(), $this->getTurn(), TerritoryDetail::CONQUERED_TERRITORY_STARTING_LOYALTY_RATIO);
            }
        }
        $this->owner_nation_id = $newOwner instanceof NeutralOwnership ? null : $newOwner->getId();
        $this->save();
    }

    public function assignHomeToOwner(Nation $newOwner): void {
        $this->owner_nation_id = $newOwner->getId();
        NationTerritoryLoyalty::setLoyaltyRatioIfNotSet($newOwner, $this->getTerritory(), $this->getTurn(), TerritoryDetail::HOME_TERRITORY_STARTING_LOYALTY_RATIO);
        $this->save();
    }

    public static function calculateEffectiveProduction(float $baseProduction, int $populationSize, float $loyaltyRatio): float {
        if ($loyaltyRatio == 0) {
            return 0;
        }
        return $baseProduction * $populationSize / TerritoryDetail::UNIT_OF_POPULATION_SIZE * $loyaltyRatio;
    }

    public function export(): TerritoryTurnPublicInfo {
        $ownerOrNull = $this->getOwnerOrNull();
        $territory = $this->getTerritory();
        $productionByResource = TerrainType::getResourceProductionByResource($this->getTerritory()->getTerrainType());
        $loyalties = $this->allLoyalties()->get();

        $ownerLoyaltyRatio = $loyalties->mapWithKeys(fn (NationTerritoryLoyalty $l) => [$l->getNationId() => $l->getLoyaltyRatio()])->get($this->owner_nation_id) ?? 0;

        return new TerritoryTurnPublicInfo(
            territory_id: $territory->getId(),
            turn_number: $this->getTurn()->getNumber(),
            owner_nation_id: $ownerOrNull?->getId(),
            stats: [is_null($this->owner_nation_id) ? new DemographicStat('Population', 0, StatUnit::Unknown->name) : new DemographicStat('Population', $this->getPopulationSize(), StatUnit::WholeNumber->name)],
            owner_production: is_null($this->owner_nation_id) ? null : collect(array_keys($productionByResource))
                ->mapWithKeys(fn (int $resource) => [ResourceType::from($resource)->name => TerritoryDetail::calculateEffectiveProduction($productionByResource[$resource], $this->getPopulationSize(), $ownerLoyaltyRatio)])->all(),
            loyalties: $loyalties->map(fn (NationTerritoryLoyalty $l) => $l->export())->all(),
            base_productivity: collect($productionByResource)->mapWithKeys(fn ($rate, $resource) => [ResourceType::from($resource)->name => $rate])->all(),
            production_population_unit: self::UNIT_OF_POPULATION_SIZE,
        );
    }

    public static function exportAllTurnOwnerInfo(Nation $owner, Turn $turn): array {
        $populationGrowthMultiplier = $owner->getDetail($turn)->getPopulationGrowthMultiplier();

        $territories = DB::table('territory_details')
            ->where('territory_details.game_id', $turn->getGame()->getId())
            ->where('territory_details.owner_nation_id', $owner->getId())
            ->where('territory_details.turn_id', $turn->getId())
            ->join('territories', 'territories.id', '=', 'territory_details.territory_id')
            ->join('nation_territory_loyalties', fn ($join) => $join
                ->on('territory_details.territory_id', '=', 'nation_territory_loyalties.territory_id')
                ->on('nation_territory_loyalties.turn_id', '=', 'territory_details.turn_id')
                ->on('nation_territory_loyalties.nation_id', '=', 'territory_details.owner_nation_id')
            )
            ->select('territory_details.territory_id', NationTerritoryLoyalty::FIELD_LOYALTY . ' as raw_loyalty')
            ->get();

            return $territories->map(fn ($t) => TerritoryTurnOwnerInfo::fromObject($t, [
                'can_deploy' => Deployment::isLoyaltyHighEnoughToDeployOnTerritory($t->raw_loyalty / 100),
                'stats' => [
                    new DemographicStat('Population growth rate', TerritoryDetail::calculatePopulationGrowthRate($populationGrowthMultiplier), StatUnit::DetailedPercent->name)
                ]
            ]))->all();
    }

    public static function exportAllTurnPublicInfo(Turn $turn): array {
        $loyaltiesByTerritoryId = DB::table('territories')
            ->where('territories.game_id', $turn->getGame()->getId())
            ->where('nation_territory_loyalties.turn_id', $turn->getId())
            ->join('nation_territory_loyalties', 'nation_territory_loyalties.territory_id', '=', 'territories.id')
            ->select('territories.id as territory_id', 'nation_territory_loyalties.nation_id', 'nation_territory_loyalties.' . NationTerritoryLoyalty::FIELD_LOYALTY . ' as raw_loyalty')
            ->get()
            ->groupBy('territory_id');
        $productionByTerrainResource = collect(TerrainType::getResourceProductionByTerrainResource())
            ->mapWithKeys(fn (array $productionByResource, int $terrain) => [$terrain => collect($productionByResource)
                ->mapWithKeys(fn (float $production, int $resource) => [ResourceType::from($resource)->name => $production])
            ]);
        $territories = DB::table('territory_details')
            ->where('territory_details.game_id', $turn->getGame()->getId())
            ->where('territory_details.turn_id', $turn->getId())
            ->join('territories', 'territories.id', '=', 'territory_details.territory_id')
            ->leftJoin('nation_territory_loyalties', fn ($join) => $join
                ->on('nation_territory_loyalties.territory_id', '=', 'territory_details.territory_id')
                ->on('nation_territory_loyalties.turn_id', '=', 'territory_details.turn_id')
                ->on('nation_territory_loyalties.nation_id', '=', 'territory_details.owner_nation_id')
            )
            ->select('territory_details.*', Territory::FIELD_TERRAIN_TYPE . ' as terrain_type', NationTerritoryLoyalty::FIELD_LOYALTY . ' as raw_loyalty')
            ->get()
            ->all();

        return array_map(fn ($t) => TerritoryTurnPublicInfo::fromObject($t, [
            'turn_number' => $turn->getNumber(),
            'stats' => [
                is_null($t->owner_nation_id) ? new DemographicStat(TerritoryStat::Population->name, 0, StatUnit::Unknown->name) : new DemographicStat(TerritoryStat::Population->name, $t->population_size, StatUnit::WholeNumber->name),
            ],
            'base_productivity' => $productionByTerrainResource[$t->terrain_type]->all(),
            'production_population_unit' => self::UNIT_OF_POPULATION_SIZE,
            'owner_production' => is_null($t->owner_nation_id) ? null : $productionByTerrainResource[$t->terrain_type]->mapWithKeys(fn ($production, $resource) => [$resource => TerritoryDetail::calculateEffectiveProduction($production, $t->population_size, $t->raw_loyalty / 100)])->all(),
            'loyalties' => $loyaltiesByTerritoryId->get($t->territory_id)?->map(fn (object $l) => ['nation_id' => $l->nation_id, 'loyalty_ratio' => $l->raw_loyalty / 100])?->all()??[]
        ]), $territories);
    }

    public function resetLaborPool(): void {
        Option::fromValue($this->getOwnerOrNull())->forAll(function (Nation $owner) {
            $turn = $this->getTurn();
            $ownerLoyalty = NationTerritoryLoyalty::getLoyaltyRatioForNation($owner, $this->getTerritory(), $turn);

            $laborPoolOrNull = LaborPool::getLaborPool($owner->getDetail($turn), $this);

            if (!is_null($laborPoolOrNull)) {
                $laborPoolOrNull->delete();
            }

            LaborPool::create($this, floor($this->population_size * $ownerLoyalty));
        });
    }

    public function onNextTurn(TerritoryDetail $current): void {
        $this->setPopulationSize($this->getPopulationSize() * (1 + $current->getPopulationGrowthRate()));
        $this->save();
        $loyalties = $current->allLoyalties()->get();
        assert($loyalties instanceof Collection);
        $totalLoyalty = $loyalties->sum(fn (NationTerritoryLoyalty $l) => $l->getLoyaltyRatio());
        $loyalties->each(fn (NationTerritoryLoyalty $l) => $l->replicateForTurn($this->getTurn())->onNextTurn($l, $totalLoyalty));
        $this->resetLaborPool();
    }

    public static function create(Territory $territory): TerritoryDetail {
        $details = new TerritoryDetail();
        $details->game_id = $territory->getGame()->getId();
        $details->territory_id = $territory->getId();
        $details->turn_id = Turn::getCurrentForGame($territory->getGame())->getId();
        $details->population_size = TerritoryDetail::DEFAULT_POPULATION_SIZE;
        $details->save();
        $details->resetLaborPool();

        return $details;
    }
}

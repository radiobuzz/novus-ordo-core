<?php

namespace App\Models;

use App\Domain\BidType;
use App\Domain\DivisionType;
use App\Domain\LaborPoolConstants;
use App\Domain\ProductionBidConstants;
use App\Domain\ResourceType;
use App\Domain\ResourceTypeMeta;
use App\Domain\SharedAssetType;
use App\Domain\StatUnit;
use App\Facades\Metacache;
use App\ModelTraits\ReplicatesForTurns;
use App\ReadModels\BudgetInfo;
use App\ReadModels\DemographicStat;
use App\ReadModels\NationTurnOwnerInfo;
use App\ReadModels\NationTurnPublicInfo;
use App\ReadModels\NationTurnSummary;
use App\Utils\GuardsForAssertions;
use App\Utils\ImageSource;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class NationDetail extends Model
{
    use ReplicatesForTurns;
    use GuardsForAssertions;

    private const float MIN_POPULATION_GROWTH_MULTIPLIER = 1.00;
    private const float MAX_POPULATION_GROWTH_MULTIPLIER = 5.00;
    private const float MAX_FOOD_SURPLUS_RATIO = 5.00;
    private const float MAX_RECRUITMENT_POOL_PER_LABOR_UNIT = 1.00;

    public function game(): BelongsTo {
        return $this->belongsTo(Game::class);
    }

    public function getGame(): Game {
        return $this->game;
    }

    public function nation(): BelongsTo {
        return $this->belongsTo(Nation::class);
    }

    public function getNation(): Nation {
        return Nation::withoutGlobalScopes()->find($this->nation_id);
    }

    public function getNationId(): int {
        return $this->nation_id;
    }

    public function getGameId(): int {
        return $this->game_id;
    }

    public function getPreviousDetail(): NationDetail {
        $previousDetailId = DB::table('nation_details')
            ->where('nation_id', $this->nation_id)
            ->where('turn_id', '<', $this->turn_id)
            ->latest('turn_id')
            ->value('id');
        
        return is_null($previousDetailId) ? $this : NationDetail::find($previousDetailId);
    }

    public function territories(): HasMany {
        $nation = $this->getNation();

        return $nation->getGame()->territories()
            ->whereHas('details', fn (Builder $query) => $query
                ->where('turn_id', $this->turn_id)
                ->where(TerritoryDetail::FIELD_OWNER_NATION_ID, $nation->getId())
            );
    }

    public function getTerritoryById(int $territoryId): Territory {
        return $this->territories()->find($territoryId);
    }

    public function activeDivisions(): HasMany {
        return $this->getNation()->divisions()
            ->whereHas('details', fn (Builder $query) => $query
                ->where('turn_id', $this->turn_id)
                ->where(DivisionDetail::FIELD_IS_ACTIVE, true)
            );
    }

    public function getNumberOfDivisions(): int {
        return $this->activeDivisions()->count();
    }

    public function getActiveDivisionWithId(int $divisionId): Division {
        return $this->activeDivisions()->find($divisionId);
    }

    public function getTurnId(): int {
        return $this->turn_id;
    }

    public function battlesWhereAttacker(): HasMany {
        return $this->getNation()
            ->battlesWhereAttacker()
            ->where('turn_id', $this->turn_id);
    }

    public function battlesWhereDefender(): HasMany {
        return $this->getNation()
            ->battlesWhereDefender()
            ->where('turn_id', $this->turn_id);
    }

    public function getAllBattlesWhereParticipant(): Collection {
        return $this
            ->battlesWhereAttacker()
            ->get()
            ->concat($this
                ->battlesWhereDefender()
                ->get()
            );
    }

    public function stockpiles(): HasMany {
        return $this
            ->getNation()
            ->hasMany(NationResourceStockpile::class)
            ->where('turn_id', $this->getTurn()->getId());
    }

    public function getStockpiles(): Collection {
        return $this->stockpiles->mapWithKeys(fn (NationResourceStockpile $stockpile) => [$stockpile->getResourceType()->value => $stockpile]);
    }

    public function getLeaderDetail(): LeaderDetail {
        return LeaderDetail::getForNation($this);
    }

    public function getPopulationGrowthRate(): float {
        $turn = $this->getTurn();
        $nationPopulation = Metacache::remember($this->getPopulationSize(...));

        return $nationPopulation > 0
            ? $this->territories->map(fn (Territory $t) => $t->getDetail($turn)->getPopulationGrowthRate() * $t->getDetail($turn)->getPopulationSize())->sum() / $nationPopulation
            : 0;
    }

    public function exportForOwner(): NationTurnOwnerInfo {
        $nation = $this->getNation();
        $turn = $this->getTurn();
        return new NationTurnOwnerInfo(
            nation_id: $nation->getId(),
            turn_number: $turn->getNumber(),
            is_ready_for_next_turn: $this->getNation()->isReadyForNextTurn(),
            stats: [
                new DemographicStat('Population growth rate', Metacache::remember($this->getPopulationGrowthRate(...)) , StatUnit::DetailedPercent->name),
                new DemographicStat('Number of divisions', $this->getNumberOfDivisions() , StatUnit::WholeNumber->name),
            ],
        );
    }

    public function export(): NationTurnPublicInfo {
        $nation = $this->getNation();
        $turn = $this->getTurn();
        return new NationTurnPublicInfo(
            nation_id: $this->getNation()->getId(),
            turn_number: $this->getTurn()->getNumber(),
            usual_name: $this->getUsualName(),
            formal_name: $this->getFormalName(),
            flag_src: $this->getFlagSrcOrNull(),
            stats: [
                new DemographicStat('Total land area', Metacache::remember($this->getUsableLandKm2(...)), StatUnit::Km2->name),
                new DemographicStat('Total population', Metacache::remember($this->getPopulationSize(...)), StatUnit::WholeNumber->name),
                new DemographicStat('Population loyalty', TerritoryDetail::getPopulationLoyaltyForNation($nation, $turn), StatUnit::DetailedPercent->name),
            ],
        );
    }

    public function getUsualName(): string {
        return $this->usual_name;
    }

    public function getFormalName(): string {
        return $this->formal_name;
    }

    public function getFlagSrcOrNull(): ?string {
        return $this->flag_src;
    }

    public function getUsableLandKm2(): int {
        return $this->territories()->get()->sum(fn (Territory $t) => $t->getUsableLandKm2());
    }

    public function getPopulationSize(): int {
        return DB::table('territory_details')
            ->where(TerritoryDetail::FIELD_OWNER_NATION_ID, $this->getNation()->getId())
            ->where('turn_id', $this->getTurn()->getId())
            ->sum(TerritoryDetail::FIELD_POPULATION_SIZE);
    }

    public function getLoyalPopulationSize(): int {
        return DB::table('territory_details')
            ->where('territory_details.' . TerritoryDetail::FIELD_OWNER_NATION_ID, $this->getNation()->getId())
            ->where('territory_details.turn_id', $this->getTurn()->getId())
            ->join('nation_territory_loyalties', fn ($join) => $join
                ->on('territory_details.territory_id', '=', 'nation_territory_loyalties.territory_id')
                ->on('nation_territory_loyalties.turn_id', '=', 'territory_details.turn_id')
                ->on('nation_territory_loyalties.nation_id', '=', 'territory_details.' . TerritoryDetail::FIELD_OWNER_NATION_ID)
            )
            ->selectRaw('sum(territory_details.' . TerritoryDetail::FIELD_POPULATION_SIZE . ' * nation_territory_loyalties.' . NationTerritoryLoyalty::FIELD_LOYALTY . ' / 100) as loyal_population_size')
            ->value('loyal_population_size') ?? 0;
    }

    public function deployments(): HasMany {
        return $this->getNation()->deployments()
            ->where('turn_id', $this->turn_id);
    }

    public function deploymentsInTerritory(Territory $territory): HasMany {
        return $this->getNation()->deployments()
            ->where('turn_id', $this->turn_id)
            ->where('territory_id', $territory->getId());
    }

    private function getProduction(ResourceType $resourceType): float {
        return $this->getProductionRaw($resourceType) / LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION;
    }

    private function getProductionRaw(ResourceType $resourceType): int {
        return match($resourceType) {
            ResourceType::RecruitmentPool => $this->getRecruitmentPoolRaw(),
            default => LaborPoolAllocation::getProduction($this, $resourceType),
        };
    }

    public function getStockpiledQuantity(ResourceType $resourceType): float {
        $stockpileOrNull = $this->stockpiles()->where('resource_type', $resourceType->value)->first();

        if (is_null($stockpileOrNull)) {
            // No reserve, first turn for this nation or newly introduced resource type.

            return 0;
        }

        return NationResourceStockpile::notNull($stockpileOrNull)->getAvailableQuantity();
    }

    public function getStockpiledQuantityRaw(ResourceType $resourceType): int {
        return floor($this->getStockpiledQuantity($resourceType) * LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION);
    }

    private function getUpkeepRaw(ResourceType $resourceType): int {
        $divisionUpkeepCosts = DivisionDetail::getTotalUpkeepCostsByResourceType($this->getNation(), $this->getTurn());

        return $divisionUpkeepCosts[$resourceType->value] * LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION
            + match($resourceType) {
                ResourceType::Food => $this->getPopulationSize(),
                default => 0,
            };
    }

    private function getUpkeep(ResourceType $resourceType): float {
        return floor($this->getUpkeepRaw($resourceType) / LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION * 10_000) / 10_000;
    }

    private function getExpensesRaw(ResourceType $resourceType): int {
        $deploymentExpenses = Deployment::getTotalCostsByResourceType($this->getNation(), $this->getTurn());
        $orderExpenses = Order::getTotalCostsByResourceType($this->getNation(), $this->getTurn());

        return ($deploymentExpenses[$resourceType->value] + $orderExpenses[$resourceType->value]) * LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION;
    }

    private function getExpenses(ResourceType $resourceType): float {
        return floor($this->getExpensesRaw($resourceType) / LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION * 10_000) / 10_000;
    }

    private function getAvailableProduction(ResourceType $resourceType): float {
        return floor($this->getAvailableProductionRaw($resourceType) / LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION * 10_000) / 10_000;
    }

    private function getAvailableProductionRaw(ResourceType $resourceType): int {
        return max(0, $this->getStockpiledQuantityRaw($resourceType) + $this->getBalanceRaw($resourceType));
    }

    private function getBalance(ResourceType $resourceType): float {
        return round($this->getBalanceRaw($resourceType) / LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION, 4);
    }

    private function getBalanceRaw(ResourceType $resourceType): int {
        return $this->getProductionRaw($resourceType) - $this->getUpkeepRaw($resourceType) - $this->getExpensesRaw($resourceType);
    }

    public function canAffordCosts(array $costs): bool {
        foreach(ResourceType::cases() as $resourceType) {
            if ($costs[$resourceType->value] > $this->getAvailableProduction($resourceType)) {
                return false;
            }
        }

        return true;
    }

    public function getMaximumAffordableDeployment(DivisionType $divisionType): int {
        $maximum = PHP_INT_MAX;
        foreach (DivisionType::getMeta($divisionType)->deploymentCosts as $resourceType => $cost) {
            if ($cost > 0) {
                $maximum = min($maximum, (int) floor($this->getAvailableProduction(ResourceType::from($resourceType)) / $cost));
            }
        }

        return $maximum === PHP_INT_MAX ? 0 : max(0, $maximum);
    }

    public function getFreeLabor(): int {
        $production = $this->getProductionRaw(ResourceType::Capital);
        return min($production, max(0, $this->getBalanceRaw(ResourceType::Capital) + $this->getStockpiledQuantityRaw(ResourceType::Capital)));
    }

    public function getRecruitmentPoolRaw(): int {
        return floor(Metacache::remember($this->getLoyalPopulationSize(...)) / NationDetail::MAX_RECRUITMENT_POOL_PER_LABOR_UNIT);
    }

    public function getMaximumRecruitmentPoolExpansion(): int {
        // return min(
        //     floor($this->getFreeLabor() / LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION),
        //     floor(Metacache::remember($this->getLoyalPopulationSize(...)) / NationDetail::MAX_RECRUITMENT_POOL_PER_LABOR_UNIT)
        // );

        return floor($this->getRecruitmentPoolRaw() / LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION) - $this->getNumberOfDivisions() - $this->deployments()->count();
    }

    private static function standardLogisticFunction(float $x): float
    {
        return 1 / (1 + exp(-$x));
    }

    public function getPopulationGrowthMultiplier(): float {
        $stockpiledFood = $this->getStockpiledQuantity(ResourceType::Food);
        $foodUpkeep = $this->getUpkeep(ResourceType::Food);

        if ($foodUpkeep <= 0) {
            return 0.00;
        }

        if ($stockpiledFood < 0) {
            return 0.00;
        }

        $foodSurplusRatio = min(NationDetail::MAX_FOOD_SURPLUS_RATIO, $stockpiledFood / $foodUpkeep);

        return NationDetail::MIN_POPULATION_GROWTH_MULTIPLIER + NationDetail::standardLogisticFunction(($foodSurplusRatio / NationDetail::MAX_FOOD_SURPLUS_RATIO - 0.5) * 6) * (NationDetail::MAX_POPULATION_GROWTH_MULTIPLIER - NationDetail::MIN_POPULATION_GROWTH_MULTIPLIER);
    }

    public function isHostileTerritory(Territory $territory): bool {
        return !$this->territories()
            ->where('id', $territory->getId())
            ->exists();
    }

    private function exportBalances(): array {
        $stockpiles = [];
        foreach (ResourceType::cases() as $resourceType) {
            $stockpiles[$resourceType->name] = floor($this->getBalance($resourceType) * 10_000) / 10_000;
        }

        return $stockpiles;
    }

    private function exportAvailableProduction(): array {
        $stockpiles = [];
        foreach (ResourceType::cases() as $resourceType) {
            $stockpiles[$resourceType->name] = floor($this->getAvailableProduction($resourceType) * 10_000) / 10_000;
        }

        return $stockpiles;
    }

    private function exportExpenses(): array {
        $stockpiles = [];
        foreach (ResourceType::cases() as $resourceType) {
            $stockpiles[$resourceType->name] = floor($this->getExpenses($resourceType) * 10_000) / 10_000;
        }

        return $stockpiles;
    }

    private function exportUpkeep(): array {
        $stockpiles = [];
        foreach (ResourceType::cases() as $resourceType) {
            $stockpiles[$resourceType->name] = floor($this->getUpkeep($resourceType) * 10_000) / 10_000;
        }

        return $stockpiles;
    }

    private function exportProduction(): array {
        $stockpiles = [];
        foreach (ResourceType::cases() as $resourceType) {
            $stockpiles[$resourceType->name] = round($this->getProduction($resourceType), 6);
        }

        return $stockpiles;
    }

    private function exportStockpiles(): array {
        $stockpiles = [];
        foreach (ResourceType::cases() as $resourceType) {
            $stockpiles[$resourceType->name] = round($this->getStockpiledQuantity($resourceType), 6);
        }

        return $stockpiles;
    }

    public function exportTurnSummary(): NationTurnSummary {
        $previous = $this->getPreviousDetail();
        $hasPrevious = $previous->getTurnId() !== $this->getTurnId();
        $population = $this->getPopulationSize();
        $territories = $this->territories()->count();
        $completed = $hasPrevious
            ? $previous->deployments()->get()->countBy(fn (Deployment $deployment) => $deployment->getDivisionType()->name)->all()
            : [];

        return new NationTurnSummary(
            previous_turn_number: $hasPrevious ? $previous->getTurn()->getNumber() : null,
            population: $population,
            population_change: $hasPrevious ? $population - $previous->getPopulationSize() : null,
            territories: $territories,
            territory_change: $hasPrevious ? $territories - $previous->territories()->count() : null,
            completed_units: $completed,
        );
    }

    public function exportBudget(): BudgetInfo {
        return new BudgetInfo(
            nation_id: $this->getNation()->getId(),
            turn_number: $this->getTurn()->getNumber(),
            production: $this->exportProduction(),
            stockpiles: $this->exportStockpiles(),
            upkeep: $this->exportUpkeep(),
            expenses: $this->exportExpenses(),
            available_production: $this->exportAvailableProduction(),
            balances: $this->exportBalances(),
            max_recruitement_pool_expansion: $this->getMaximumRecruitmentPoolExpansion(),
            labor_facility_allocations: LaborPoolAllocation::exportAllForOwner($this),
            labor_pools: LaborPool::exportAllForOwner($this),
            free_labor: $this->getFreeLabor(),
        );
    }

    public function onTurnUpkeepEnding(): void {
        $this->allocateLabor();
    }

    public function finalizeNationCreation(): void {
        News::create($this->getTurn(), "The people of " . News::getNationUsualNameTag($this) . "  <b>proclames</b> the " . News::getNationFormalNameTag($this) . ". " . News::getLeaderNameTag($this->getLeaderDetail()) . " will serve as its first " . News::getLeaderTitleTag($this->getLeaderDetail()) . ".");
        $this->allocateLabor();
    }

    public function onDeployment(): void {
        $this->allocateLabor();
    }

    public function placeProductionBid(ResourceType $resourceType, int $maxQuantity, int $maxLaborAllocationPerUnit): void {
        $info = ResourceType::getMeta($resourceType);

        if (!$info->canPlaceCommand) {
            throw new InvalidArgumentException("Can't place a bid for resource type {$resourceType->name}");
        }

        ProductionBid::setCommandBid($this, $resourceType, $maxQuantity, $maxLaborAllocationPerUnit);

        $this->allocateLabor();
    }

    /** Raw inputs for a non-authoritative, joint territorial forecast in the client. */
    public function exportProductionPlanning(): array {
        return [
            'resources' => collect(ResourceType::cases())->mapWithKeys(function (ResourceType $type) {
                $meta = ResourceType::getMeta($type);
                return [$type->name => [
                    'upkeep' => $this->getUpkeepRaw($type),
                    'expenses' => $this->getExpensesRaw($type),
                    'stock' => $this->getStockpiledQuantityRaw($type),
                    'produced_by_labor' => $meta->producedByLabor,
                    'reserve_labor' => $meta->reserveLaborForUpkeep,
                    'upkeep_priority' => $meta->upkeepBidPriority->value,
                ]];
            })->all(),
            'bid_order' => ProductionBid::getAll($this)->map(fn (ProductionBid $bid) => [
                'resource_type' => $bid->getResourceType()->name,
                'upkeep' => $bid->getBidType() === BidType::Upkeep,
                'priority' => $bid->getPriority(),
            ])->values()->all(),
            'facilities' => LaborPoolFacility::getFacilities($this)->map(fn (LaborPoolFacility $facility) => [
                'territory_id' => $facility->getTerritoryId(),
                'resource_type' => $facility->getResourceType()->name,
                'capacity' => $facility->getCapacity(),
                'productivity' => $facility->getProductivity(),
            ])->values()->all(),
            'command_priority' => ProductionBidConstants::HIGHEST_COMMAND_BID_PRIORITY,
            'capital_priority' => ProductionBidConstants::LOWEST_COMMAND_BID_PRIORITY - 1,
        ];
    }

    /** Caller owns the transaction. All bids are written before allocating once. */
    public function placeProductionPlan(array $bids): void {
        foreach ($bids as $bid) {
            $type = ResourceType::fromName($bid['resource_type']);
            if (!ResourceType::getMeta($type)->canPlaceCommand) {
                throw new InvalidArgumentException("Can't place a bid for resource type {$type->name}");
            }
            ProductionBid::setCommandBid($this, $type, $bid['max_quantity'], $bid['max_labor_allocation_per_unit']);
        }
        $this->allocateLabor();
    }

    private function allocateLabor(): void {
        $this->attemptAllocateLabor(true);

        if ($this->getStockpiledQuantityRaw(ResourceType::Capital) < -$this->getBalanceRaw(ResourceType::Capital)) {
            $this->attemptAllocateLabor(false);
        }
    }

    private function attemptAllocateLabor(bool $maintainReserveIfActiveCommand): void {
        $laborPoolsById = LaborPool::getLaborPools($this)->mapWithKeys(fn (LaborPool $lp) => [ $lp->getId() => $lp ]);
        $laborPoolSizesByPoolId = $laborPoolsById->mapWithKeys(fn (LaborPool $lp) => [ $lp->getId() => $lp->getSize() ])->all();
        $facilitiesById = LaborPoolFacility::getFacilities($this)->mapWithKeys(fn (LaborPoolFacility $f) => [ $f->getId() => $f ]);
        $demandRemainingByResourceType = [];

        $resourceInfosByType = ResourceType::getMetas();

        $reservedLabor = 0;
        foreach(ResourceType::cases() as $resourceType) {
            $info = $resourceInfosByType[$resourceType->value];
            assert($info instanceof ResourceTypeMeta);

            if (!$info->producedByLabor) {
                $demandRemainingByResourceType[$resourceType->value] = 0;
                continue; 
            }
            $upkeep = $this->getUpkeepRaw($resourceType);
            $expenses = $this->getExpensesRaw($resourceType);
            $bidOrNull = ProductionBid::getCommandBidOrNull($this, $resourceType);
            $activeProductionBidForResource = !is_null($bidOrNull) && $bidOrNull->getMaxQuantity() > 0 && $info->canPlaceCommand;
            if ($activeProductionBidForResource && $maintainReserveIfActiveCommand) {
                $demandRemainingByResourceType[$resourceType->value] = $upkeep;
            }
            else {
                $reserves = $this->getStockpiledQuantityRaw($resourceType);
                $surplus = $reserves - $expenses - $upkeep;
                $demandRemainingByResourceType[$resourceType->value] = $surplus < 0 ? -$surplus : 0;
            }

            if ($info->reserveLaborForUpkeep) {
                $reservedLabor += $demandRemainingByResourceType[$resourceType->value];
            }
        }

        LaborPoolAllocation::resetAllocations($this);

        foreach ($demandRemainingByResourceType as $resourceType => $quantity) {
            ProductionBid::setUpkeepBid($this, ResourceType::from($resourceType), $quantity);
        }
        

        ProductionBid::setCommandBid($this, ResourceType::Capital, ProductionBidConstants::MAX_QUANTITY_LIMIT, ProductionBidConstants::MAX_LABOR_PER_UNIT_LIMIT, ProductionBidConstants::LOWEST_COMMAND_BID_PRIORITY - 1);

        $allocations = \App\Domain\ProductionAllocation::allocate(
            $laborPoolSizesByPoolId,
            $facilitiesById->map(fn (LaborPoolFacility $f) => [
                'id' => $f->getId(), 'pool' => $f->getLaborPoolId(), 'resource' => $f->getResourceType()->name,
                'capacity' => $f->getCapacity(), 'productivity' => $f->getProductivity(),
            ])->values()->all(),
            ProductionBid::getAll($this)->map(fn (ProductionBid $bid) => [
                'resource' => $bid->getResourceType()->name, 'priority' => $bid->getPriority(),
                'upkeep' => $bid->getBidType() === BidType::Upkeep, 'quantity' => $bid->getMaxQuantity(),
                'max_labor' => $bid->getMaxLaborPerUnit(),
            ])->all(),
            $reservedLabor,
        );
        foreach ($allocations as $id => $quantity) if ($quantity > 0) $facilitiesById[$id]->addToAllocation($quantity);
    }

    public function onNextTurn(NationDetail $current): void {
        $nation = $this->getNation();
        $turn = $this->getTurn();
        $stockpiles = $current->getStockpiles();

        $currentLeaderDetail = LeaderDetail::getForNation($current);
        $newLeaderDetail = $currentLeaderDetail->replicateForTurn($turn);
        $newLeaderDetail->onNextTurn($currentLeaderDetail);

        foreach (ResourceType::cases() as $resourceType) {
            $resourceInfo = ResourceType::getMeta($resourceType);

            if ($resourceInfo->canPlaceCommand) {
                $bidOrNull = ProductionBid::getCommandBidOrNull($current, $resourceType);

                if (!is_null($bidOrNull) && $bidOrNull->getMaxQuantity() > 0) {
                    $renewedBid = $bidOrNull->replicateForTurn($turn);
                    $renewedBid->save();
                }
            }

            if (!$resourceInfo->canBeStocked) {
                continue;
            }

            if ($stockpiles->has($resourceType->value)) {
                $stockpile = $stockpiles->get($resourceType->value);
                assert($stockpile instanceof NationResourceStockpile);
                $newStockpile = $stockpile->replicateForTurn($turn);
                $balance = max(-$stockpile->getAvailableQuantity(), $current->getBalance($resourceType));
                $newStockpile->onNextTurn($balance);
            }
            else {
                $balance = max(0, $current->getBalance($resourceType));
                $stockpile = NationResourceStockpile::create($nation, $turn, $resourceType, $balance);
            }
        }

        $this->save();
    }

    public function hasSafePassageThrough(Territory $territory) {
        return $this->territories()
            ->where('id', $territory->getId())
            ->exists();
    }

    public static function whereUsualNameIgnoreCase(string $usualName): Closure {
        return fn (Builder $builder) => $builder->whereRaw('LOWER(usual_name) = ?', strtolower($usualName));
    }

    public static function create(
        Nation $nation,
        ?string $formalName = null,
        ImageSource|GameSharedStaticAsset|null $flagSrcOrAsset = null,
    ): NationDetail {
        if ($flagSrcOrAsset instanceof GameSharedStaticAsset && !$flagSrcOrAsset->getType() == SharedAssetType::Flag) {
            throw new InvalidArgumentException("flagSrcOrAsset: expecting Flag asset, got " . $flagSrcOrAsset->getType());
        }
        
        $turn = $nation->getGame()->getCurrentTurn();

        $nation_details = new NationDetail();
        $nation_details->game_id = $nation->getGame()->getId();
        $nation_details->nation_id = $nation->getId();
        $nation_details->turn_id = $turn->getId();
        $nation_details->usual_name = $nation->getInternalName();
        $nation_details->formal_name = is_null($formalName) ? $nation_details->usual_name : $formalName;
        $nation_details->flag_src = match(true) {
            $flagSrcOrAsset instanceof ImageSource => $flagSrcOrAsset->src,
            $flagSrcOrAsset instanceof GameSharedStaticAsset => $flagSrcOrAsset->getSrc(),
            is_null($flagSrcOrAsset) => null,
        };
        if ($flagSrcOrAsset instanceof GameSharedStaticAsset) {
            $flagSrcOrAsset->leaseTo($nation);
        }

    	$nation_details->save();

        foreach (ResourceType::cases() as $resourceType) {
            $meta = ResourceType::getMeta($resourceType);
            if ($meta->startingStock > 0) {
                NationResourceStockpile::create($nation, $turn, $resourceType, $meta->startingStock);
            }
        }

        $nation_details->allocateLabor();

        return $nation_details;
    }
}

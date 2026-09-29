<?php

namespace App\Models;

use App\Domain\DivisionType;
use App\Services\Resources\ResourceCatalogue;
use App\Services\Resources\ResourceLedger;
use App\Domain\Resources\Quantity as Q;
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

    protected $casts = ['flag_design' => 'array', 'policy_report' => 'array', 'economy_state' => 'array', 'economy_report' => 'array', 'resource_report' => 'array'];

    public function hasEconomy(): bool { return $this->getGame()->economy_rules !== null; }

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
        if ($this->getGame()->diplomacy_enabled) {
            return Battle::where('game_id', $this->game_id)->where('turn_id', $this->turn_id)
                ->where(fn ($q) => $q->where('attacker_nation_id', $this->nation_id)->orWhere('defender_nation_id', $this->nation_id)
                    ->orWhereIn('id', \Illuminate\Support\Facades\DB::table('battle_participants')->where('nation_id', $this->nation_id)->select('battle_id')))
                ->get();
        }
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
            ->where('owner_kind', 'government')
            ->where('turn_id', $this->getTurn()->getId());
    }

    public function getStockpiles(): Collection {
        return $this->stockpiles()->get()->keyBy(fn ($stockpile) => $this->resources()->key($stockpile->resource_id));
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

    public function resources(): ResourceCatalogue { return ResourceCatalogue::forGame($this->getGame()); }

    public function getStockpiledQuantity(string $key): string {
        $resource = $this->resources()->get($key);
        return Q::parse($this->stockpiles()->where('resource_id', $resource['id'])->value('available_quantity') ?? '0');
    }

    public function getAvailableProductionQuantity(string $key): string {
        $this->resources()->get($key);
        return app(ResourceLedger::class)->available($this)[$key];
    }

    public function canAffordCosts(array $costs): bool {
        $rows = app(ResourceLedger::class)->available($this);
        foreach ($costs as $key => $cost) {
            $this->resources()->get($key);
            if (Q::cmp($cost, $rows[$key]) > 0) return false;
        }
        return true;
    }

    public function getMaximumAffordableDeployment(DivisionType $divisionType): int {
        $maximum = PHP_INT_MAX;
        $rows = app(ResourceLedger::class)->available($this);
        foreach ($this->resources()->deploymentCosts($divisionType) as $key => $cost) {
            if (Q::cmp($cost, '0') > 0) {
                $count = \Brick\Math\BigDecimal::of($rows[$key])->dividedBy($cost, 0, \Brick\Math\RoundingMode::DOWN);
                $maximum = min($maximum, $count->isGreaterThan(PHP_INT_MAX) ? PHP_INT_MAX : $count->toInt());
            }
        }
        return $maximum === PHP_INT_MAX ? 0 : $maximum;
    }

    public function getFreeLabor(): int { return app(ResourceLedger::class)->preview($this)['idle_workers']; }

    public function getMaximumRecruitmentPoolExpansion(): int {
        return (int) floor((float) $this->getAvailableProductionQuantity($this->resources()->role('recruitment')));
    }

    public function getPopulationGrowthMultiplier(): float {
        $food = app(\App\Services\EconomyService::class)->resolve($this)['resources'][$this->resources()->role('nutrition')];
        return \App\Domain\Resources\Agriculture::growthMultiplier($food, $this->getGame()->economy_rules);
    }

    public function isHostileTerritory(Territory $territory): bool {
        return !$this->hasSafePassageThrough($territory);
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

    public function exportBudget(?array $projection = null): BudgetInfo {
        $projection ??= app(ResourceLedger::class)->preview($this);
        $rows = $projection['rows'];
        $column = fn ($field) => array_map(fn ($row) => $row[$field], $rows);
        return new BudgetInfo(
            nation_id: $this->nation_id, turn_number: $this->getTurn()->getNumber(),
            production: $column('production'), stockpiles: $column('opening'), upkeep: $column('requested'),
            expenses: $column('commands'), available_production: $column('available'), balances: $column('balance'),
            max_recruitement_pool_expansion: (int) floor((float) $rows[$this->resources()->role('recruitment')]['available']),
            labor_facility_allocations: $projection['facilities'], labor_pools: LaborPool::exportAllForOwner($this, $projection['pools']),
            free_labor: $projection['idle_workers'],
        );
    }

    public function finalizeNationCreation(): void {
        News::create($this->getTurn(), "The people of " . News::getNationUsualNameTag($this) . "  <b>proclames</b> the " . News::getNationFormalNameTag($this) . ". " . News::getLeaderNameTag($this->getLeaderDetail()) . " will serve as its first " . News::getLeaderTitleTag($this->getLeaderDetail()) . ".");
    }

    public function onNextTurn(NationDetail $current): void {
        $leader = LeaderDetail::getForNation($current);
        $leader->replicateForTurn($this->getTurn())->onNextTurn($leader);
        $this->save();
    }

    public function hasSafePassageThrough(Territory $territory) {
        return app(\App\Services\DiplomacyService::class)->canPass($this->getNation(), $territory, $this->getTurn());
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

        foreach ($nation_details->resources()->resources as $key => $resource) {
            if ($resource['kind'] !== 'capacity') NationResourceStockpile::create($nation, $turn, $key, $resource['starting_quantity']);
        }

        return $nation_details;
    }
}

<?php

namespace App\Models;

use App\Domain\DivisionType;
use App\Domain\OrderType;
use App\Domain\TerrainType;
use App\Domain\TerritoryConnection;
use App\ModelTraits\ReplicatesForTurns;
use App\ReadModels\OwnedDivisionInfo;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use LogicException;

class DivisionDetail extends Model
{
    public const string FIELD_IS_ACTIVE = "is_active";

    use ReplicatesForTurns;

    public function game(): BelongsTo {
        return $this->belongsTo(Game::class);
    }

    public function getGame(): Game {
        return $this->game;
    }

    public function division(): BelongsTo {
        return $this->belongsTo(Division::class);
    }

    public function getDivision(): Division {
        return $this->division;
    }

    public function nation(): BelongsTo {
        return $this->belongsTo(Nation::class);
    }

    public function getNation(): Nation {
        return $this->nation;
    }

    public function territory(): BelongsTo {
        return $this->belongsTo(Territory::class);
    }

    public function getTerritory(): Territory {
        return $this->territory;
    }

    public function getOrderOrNull(): ?Order {
        return $this->getDivision()->orders()
            ->where('turn_id', $this->turn_id)
            ->first();
    }

    public function canMoveTo(Territory $destination, Territory ...$pathOfTerritories): bool {
        $nationDetail = $this->getNation()->getDetail($this->getTurn());
        $meta = DivisionType::getMeta($this->getDivision()->getDivisionType());
        $turn = $this->getTurn();
        return \App\Domain\MovementRules::canReach(
            $this->getTerritory(), $destination, $pathOfTerritories, $meta,
            Territory::getTerritoryConnections($this->getGame()),
            fn (Territory $territory) => $nationDetail->hasSafePassageThrough($territory),
            app(\App\Services\DiplomacyService::class)->state($this->getNation(), $destination->getDetail($turn)->getOwnerOrNull(), $turn) === \App\Domain\RelationState::Peace,
        );
    }
    
    //     public function canReach(Territory $destination): bool {
    //     $nationDetail = $this->getNation()->getDetail($this->getTurn());
    //     $meta = DivisionType::getMeta($this->getDivision()->getDivisionType());
    //     $origin = $this->getTerritory();
    //     $newTerritoriesToExplore = collect([$origin]);
    //     $remainingMoves = $meta->moves;
    //     $connections = Territory::getTerritoryConnections($this->getGame());
    //     $exploredTerritoryIds[$origin->getId()] = $origin;

    //     if ($destination->getTerrainType() == TerrainType::Water) {
    //         return false;
    //     }

    //     while($remainingMoves > 0) {
    //         $remainingMoves--;
    //         $territoriesToExplore = $newTerritoriesToExplore->unique();
    //         $newTerritoriesToExplore = collect();
    //         while (!$territoriesToExplore->isEmpty()) {
    //             $territory = Territory::notNull($territoriesToExplore->pop());
    //             $accessibleTerritoryIds = $meta->canFly
    //                 ? $connections[$territory->getId()]
    //                     ->map(fn (TerritoryConnection $c) => $c->connectedTerritoryId)
    //                 : $connections[$territory->getId()]
    //                     ->filter(fn (TerritoryConnection $c) => $c->isConnectedByLand)
    //                     ->map(fn (TerritoryConnection $c) => $c->connectedTerritoryId);
    //             if ($accessibleTerritoryIds->contains($destination->getId())) {
    //                 return true;
    //             }
    //             $newNeighbors = $accessibleTerritoryIds
    //                 ->filter(fn (int $territoryId) => !isset($exploredTerritoryIds[$territoryId]))
    //                 ->map(fn (int $territoryId) => Territory::notNull(Territory::find($territoryId)));
    //             $newTerritoriesToExplore->push(...$newNeighbors
    //                 ->filter(fn (Territory $territory) => ($meta->canFly && $territory->getTerrainType() == TerrainType::Water)
    //                     || $nationDetail->hasSafePassageThrough($territory)
    //                 )
    //             );
    //             $newNeighbors->each(function (Territory $territory) use (&$exploredTerritoryIds) {
    //                 $exploredTerritoryIds[$territory->getId()] = $territory;
    //             });
    //         }
    //     }

    //     $accessibleTerritoryIds = $origin->connectedBySea()->pluck('id');
    //     if ($accessibleTerritoryIds->contains($destination->getId())) {
    //         return true;
    //     }

    //     return false;
    // }

    public function getOrder(): Order {
        return $this->getOrderOrNull();
    }

    public static function createRuleValidActiveDivision(Nation $nation): Exists {
        return Rule::exists(DivisionDetail::class, 'division_id')
            ->where(DivisionDetail::whereNation($nation))
            ->where(DivisionDetail::whereTurn($nation->getGame()->getCurrentTurn()))
            ->where(DivisionDetail::whereActive());
    }

    private static function whereTurn(Turn $turn): Closure {
        return fn ($builder) => $builder->where('turn_id', $turn->getId());
    }

    private static function whereNation(Nation $nation): Closure {
        return fn ($builder) => $builder->where('nation_id', $nation->getId());
    }

    private static function whereActive(): Closure {
        return fn ($builder) => $builder->where(DivisionDetail::FIELD_IS_ACTIVE, true);
    }
    
    public function isActive(): bool {
        return $this->is_active;
    }

    public function isMoving(): bool {
        $orderOrNull = $this->getOrderOrNull();

        return ($order = $orderOrNull??false)
            && $order->getType() == OrderType::Move;
    }

    public function isAttacking(): bool {
        $orderOrNull = $this->getOrderOrNull();

        return ($order = $orderOrNull??false)
            && $order->getType() == OrderType::Attack;
    }

    public function isRaiding(): bool {
        $orderOrNull = $this->getOrderOrNull();

        return ($order = $orderOrNull??false)
            && $order->getType() == OrderType::Raid;
    }

    public function isRebasing(): bool {
        $orderOrNull = $this->getOrderOrNull();

        return ($order = $orderOrNull??false)
            && ($order->getType() == OrderType::Move || $order->getType() == OrderType::Attack);
    }

    public function isEngaging(): bool {
        $orderOrNull = $this->getOrderOrNull();

        return ($order = $orderOrNull??false)
            && ($order->getType() == OrderType::Attack || $order->getType() == OrderType::Raid);
    }

    public function isOperating(): bool {
        $orderOrNull = $this->getOrderOrNull();

        return ($order = $orderOrNull??false)
            && ($order->getType() == OrderType::Attack || $order->getType() == OrderType::Raid);
    }

    public function exportForOwner(): OwnedDivisionInfo {
        $division = $this->getDivision();
        return new OwnedDivisionInfo(
            division_id: $division->getId(),
            nation_id: $this->getNation()->getId(),
            territory_id: $this->getTerritory()->getId(),
            division_type: $division->getDivisionType()->name,
            order: $this->getOrderOrNull()?->exportForOwner(),
        );
    }

    public function onNextTurn(DivisionDetail $current): void {
        $this->save();
    }

    public function moveTo(Territory $territory): void {
        $this->territory_id = $territory->getId();
        $this->save();
    }

    public function disband(): void {
        $this->is_active = false;
        $this->save();
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public static function create(
        Division $division,
        Territory $territory
    ): DivisionDetail {
        $details = new DivisionDetail();

        $details->game_id = $division->getGame()->getId();
        $details->nation_id = $division->getNation()->getId();
        $details->division_id = $division->getId();
        $details->territory_id = $territory->getId();
        $details->is_active = true;
        $details->turn_id = Turn::getCurrentForGame($division->getNation()->getGame())->getId();
        $details->save();

        return $details;
    }
}

<?php

namespace App\Models;

use App\Domain\DivisionType;
use App\Domain\OrderType;
use App\Utils\GuardsForAssertions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

class Division extends Model
{
    use GuardsForAssertions;

    public const string FIELD_DIVISION_TYPE = 'division_type';

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
        return $this->nation;
    }

    public function getNationId(): int {
        return $this->nation_id;
    }

    public function details(): HasMany {
        return $this->hasMany(DivisionDetail::class);
    }

    public function getMostRecentDetail(?Turn $turnOrNull = null): DivisionDetail {
        $turn = Turn::as($turnOrNull, fn () => Turn::getCurrentForGame($this->getGame()));
        return $this->details()
            ->where('turn_id', '<=', $turn->getId())
            ->orderByDesc('turn_id')->first();
    }

    public function getDetail(?Turn $turnOrNull = null): DivisionDetail {
        $turn = Turn::as($turnOrNull, fn () => Turn::getCurrentForGame($this->getGame()));
        return $this->details()->where('turn_id', $turn->getId())->first();
    }

    public function orders(): HasMany {
        return $this->hasMany(Order::class);
    }

    public function sendDisbandOrder(): Order {
        $detail = $this->getMostRecentDetail();

        if (!$detail->isActive()) {
            throw new LogicException("Can't give a move order to inactive division {$this->getId()}");
        }

        $previousOrderOrNull = $detail->getOrderOrNull();

        if ($previousOrderOrNull !== null) {
            $previousOrderOrNull->delete();
        }

        return Order::createDisbandOrder($this);
    }

    public function sendMoveAttackOrder(Territory $destination, Territory ...$pathOfTerritories): Order {
        $detail = $this->getMostRecentDetail();

        if (!$detail->isActive()) {
            throw new LogicException("Can't give a move order to inactive division {$this->getId()}");
        }
        
        if (!$this->getDetail()->canMoveTo($destination, ...$pathOfTerritories)) {
            throw new LogicException("Division ID {$this->getId()} can't reach territory ID {$destination->getId()}");
        }

        $engaging = $this->getNation()->getDetail()->isHostileTerritory($destination);

        if ($engaging && !$this->getDetail()->isOperating() && !$this->getNation()->getDetail()->canAffordCosts(\App\Services\Resources\ResourceCatalogue::forGame($this->getNation()->getGame())->costs('operation', $this->getDivisionType()))) {
            throw new LogicException("Can't afford the resources for an extra attack by a division of type {$this->getDivisionType()->name}");
        }

        $meta = DivisionType::getMeta($this->getDivisionType());

        $rebaseTerritoryOrNull = $meta->canFly ? null : array_last($pathOfTerritories);

        $previousOrderOrNull = $detail->getOrderOrNull();

        if ($previousOrderOrNull !== null) {
            $previousOrderOrNull->delete();
        }

        if ($engaging && !is_null($rebaseTerritoryOrNull)) {
            return Order::createAttackOrder($this, $destination, $rebaseTerritoryOrNull);
        }
        else if ($engaging) {
            return Order::createRaidOrder($this, $destination);
        }
        else {
            return Order::createMoveOrder($this, $destination);
        }
    }

    public function cancelOrder(): void {
        $orderOrNull = $this->getDetail()->getOrderOrNull();

        if ($order = $orderOrNull??false) {
            $order->delete();
        }
    }

    public function getId(): int {
        return $this->id;
    }

    public function getDivisionType(): DivisionType {
        return DivisionType::from($this->division_type);
    }

    public function onNextTurn(Turn $currentTurn, Turn $nextTurn): void {
        $currentDetail = $this->getDetail($currentTurn);
        $newDetail = $currentDetail->replicateForTurn($nextTurn);
        $newDetail->onNextTurn($currentDetail);
    }

    public function onMovePhase(Turn $currentTurn, Turn $nextTurn): void {
        if ($this->getDetail($currentTurn)->isRebasing()
            && $this->getDetail($nextTurn)->isActive()
            && app(\App\Services\DiplomacyService::class)->canPass($this->getNation(), $this->getDetail($currentTurn)->getOrder()->getDestinationTerritory(), $nextTurn)) {
            $this->getDetail($nextTurn)->moveTo($this->getDetail($currentTurn)->getOrder()->getDestinationTerritory());
            $this->getDetail($currentTurn)->getOrder()->onExecution();
        }
    }

    public function afterBattlePhase(Turn $currentTurn, Turn $nextTurn, bool $guardEnabled): void {
        $order = $this->getDetail($currentTurn)->getOrderOrNull();
        if ($order?->getType() == OrderType::Disband) {
            $this->getDetail($nextTurn)->disband();
            $order->onExecution();
        } else if ($order?->getType() == OrderType::Guard && $this->getDetail($nextTurn)->isActive()) {
            if ($guardEnabled) {
                Order::createGuardOrder($this, $nextTurn);
            }
            $order->onExecution();
        }
    }

    public static function create(Deployment $deployment): Division {
        $division = new Division();
        $division->game_id = $deployment->getGame()->getId();
        $division->nation_id = $deployment->getNation()->getId();
        $division->division_type = $deployment->getDivisionType();
        $division->save();

        DivisionDetail::create($division, $deployment->getTerritory());
        
        return $division;
    }

    public static function approximateNumberOfDivisions(int $value): int {
        if ($value < 5) {
            return 5;
        }

        if ($value < 50) {
            return round($value / 10) * 10;
        }

        if ($value < 100) {
            return round($value / 20) * 20;
        }

        if ($value < 200) {
            return round ($value / 40) * 40;
        }

        if ($value < 400) {
            return round ($value / 80) * 80;
        }

        return round($value / 100) * 100;
    }
}

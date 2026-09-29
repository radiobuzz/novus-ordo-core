<?php

namespace App\Models;

use App\Domain\DivisionType;
use App\Domain\OrderType;
use App\Models\Division;
use App\Models\Territory;
use App\Models\Turn;
use App\ReadModels\AttackOrderInfo;
use App\ReadModels\DisbandOrderInfo;
use App\ReadModels\MoveOrderInfo;
use App\ReadModels\RaidOrderInfo;
use App\ReadModels\GuardOrderInfo;
use App\ReadModels\StandDownOrderInfo;
use App\Utils\GuardsForAssertions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class Order extends Model
{
    public const float GUARD_READINESS_COST_FACTOR = 0.25;
    public const float GUARD_RESPONSE_COST_FACTOR = 0.75;

    use SoftDeletes;
    use GuardsForAssertions;

    public function getId(): int {
        return $this->id;
    }

    public function getType(): OrderType {
        return OrderType::from($this->type);
    }

    public function destinationTerritory(): BelongsTo {
        return $this->belongsTo(Territory::class, 'destination_territory_id');
    }

    public function targetTerritory(): BelongsTo {
        return $this->belongsTo(Territory::class, 'target_territory_id');
    }

    public function getDestinationTerritory(): Territory {
        return $this->destinationTerritory;
    }

    public function getTargetTerritory(): Territory {
        return $this->targetTerritory;
    }

    public function onExecution(): void {
        $this->save();
    }

    public static function getTotalOperationCosts(Nation $nation, Turn $turn): array {
        $rows = DB::table('orders')
            ->where('orders.nation_id', $nation->getId())
            ->where('orders.turn_id', $turn->getId())
            ->whereIn('orders.type', [...OrderType::getEngagingTypes(), OrderType::Guard->value])
            ->whereNull('orders.deleted_at')
            ->join('divisions', 'orders.division_id', '=', 'divisions.id')
            ->get(['orders.type', 'divisions.division_type']);
        $catalogue = \App\Services\Resources\ResourceCatalogue::forGame($nation->getGame());
        $costs = $catalogue->zero();
        foreach ($rows as $row) {
            $factor = (int) $row->type === OrderType::Guard->value ? self::GUARD_READINESS_COST_FACTOR : 1.0;
            foreach ($catalogue->costs('operation', DivisionType::from($row->division_type)) as $resource => $cost) {
                $costs[$resource] = \App\Domain\Resources\Quantity::add($costs[$resource], \App\Domain\Resources\Quantity::mul($cost, (string) $factor));
            }
        }
        return $costs;
    }

    public function exportForOwner(): object {
        return match($this->getType()) {
            OrderType::Move => new MoveOrderInfo(
                $this->division_id,
                order_type: OrderType::Move->name,
                destination_territory_id: $this->getDestinationTerritory()->getId(),
                is_operating: false,
            ),
            OrderType::Attack => new AttackOrderInfo(
                $this->division_id,
                order_type: OrderType::Attack->name,
                rebase_territory_id: $this->getDestinationTerritory()->getId(),
                target_territory_id: $this->getTargetTerritory()->getId(),
                is_operating: true,
            ),
            OrderType::Raid => new RaidOrderInfo(
                $this->division_id,
                order_type: OrderType::Raid->name,
                target_territory_id: $this->getTargetTerritory()->getId(),
                is_operating: true,
            ),
            OrderType::Disband => new DisbandOrderInfo(
                $this->division_id,
                order_type: OrderType::Disband->name,
                is_operating: false,
            ),
            OrderType::Guard => new GuardOrderInfo(
                $this->division_id,
                order_type: OrderType::Guard->name,
                is_operating: true,
            ),
            OrderType::StandDown => new StandDownOrderInfo(
                $this->division_id,
                order_type: OrderType::StandDown->name,
                is_operating: false,
            ),
        };
    }

    private static function prepareBaseOrder(Division $division, OrderType $type, ?Turn $turn = null): Order {
        $order = new Order();
        $order->game_id = $division->getGame()->getId();
        $order->nation_id = $division->getNation()->getId();
        $order->division_id = $division->getId();
        $order->turn_id = ($turn ?? $division->getGame()->getCurrentTurn())->getId();
        $order->type = $type->value;

        return $order;
    }

    public static function createDisbandOrder(Division $division): Order {
        $order = Order::prepareBaseOrder($division, OrderType::Disband);
        $order->save();

        return $order;
    }

    public static function createGuardOrder(Division $division, ?Turn $turn = null): Order {
        $order = Order::prepareBaseOrder($division, OrderType::Guard, $turn);
        $order->save();
        return $order;
    }

    public static function createStandDownOrder(Division $division): Order {
        $order = Order::prepareBaseOrder($division, OrderType::StandDown);
        $order->save();
        return $order;
    }

    public static function createMoveOrder(Division $division, Territory $destinationTerritory): Order {
        $order = Order::prepareBaseOrder($division, OrderType::Move);
        $order->destination_territory_id = $destinationTerritory->getId();
        $order->save();

        return $order;
    }

    public static function createAttackOrder(Division $division, Territory $targetTerritory, Territory $rebaseTerritory): Order {
        $order = Order::prepareBaseOrder($division, OrderType::Attack);
        $order->destination_territory_id = $rebaseTerritory->getId();
        $order->target_territory_id = $targetTerritory->getId();
        if ($division->getGame()->diplomacy_enabled) {
            $order->intent_captured = true;
            $order->intended_owner_nation_id = $targetTerritory->getDetail()->getOwnerOrNull()?->getId();
        }
        $order->save();

        return $order;
    }

    public static function createRaidOrder(Division $division, Territory $targetTerritory): Order {
        $order = Order::prepareBaseOrder($division, OrderType::Raid);
        $order->destination_territory_id = null;
        $order->target_territory_id = $targetTerritory->getId();
        if ($division->getGame()->diplomacy_enabled) {
            $order->intent_captured = true;
            $order->intended_owner_nation_id = $targetTerritory->getDetail()->getOwnerOrNull()?->getId();
        }
        $order->save();

        return $order;
    }
}

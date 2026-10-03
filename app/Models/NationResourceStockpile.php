<?php

namespace App\Models;

use App\ModelTraits\ReplicatesForTurns;
use App\Domain\Resources\Quantity as Q;
use App\Services\Resources\ResourceCatalogue;
use Illuminate\Database\Eloquent\Model;
class NationResourceStockpile extends Model
{
    use ReplicatesForTurns;
    protected $casts = ['available_quantity' => 'decimal:6'];
    public function getAvailableQuantity(): string
    {
        return $this->available_quantity;
    }
    public function onNextTurn(string $balance): void
    {
        $value = Q::add($this->available_quantity, $balance);
        if (Q::cmp($value, '0') < 0) {
            throw new \LogicException('Stock cannot be negative.');
        }
        $this->available_quantity = $value;
        $this->save();
    }
    /** Government goods have quantities, not a private resale cost basis. */
    public function removeQuantity(string $quantity): void {
        $quantity = Q::parse($quantity);
        if (Q::cmp($quantity, $this->available_quantity) > 0) throw new \LogicException('Insufficient owned stock.');
        $this->available_quantity = Q::sub($this->available_quantity, $quantity);
        $this->save();
    }
    public static function create(Nation $nation, Turn $turn, string $key, string $quantity): static
    {
        if ($nation->game_id !== $turn->game_id) {
            throw new \LogicException('Foreign turn.');
        }
        $r = ResourceCatalogue::forGame($nation->getGame())->get($key);
        if ($r['kind'] === 'capacity') {
            throw new \LogicException('Capacity is not stored.');
        }
        $s = new self();
        $s->game_id = $nation->game_id;
        $s->nation_id = $nation->id;
        $s->turn_id = $turn->id;
        $s->resource_id = $r['id'];
        $s->available_quantity = Q::parse($quantity);
        $s->save();
        return $s;
    }
}

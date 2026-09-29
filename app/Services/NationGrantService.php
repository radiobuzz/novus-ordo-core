<?php
namespace App\Services;
use App\Domain\Resources\Quantity as Q;
use App\Models\{Nation, NationResourceStockpile};
use App\Services\Resources\ResourceLedger;
final class NationGrantService {
    public static function quantity(mixed $value): string {
        $quantity = Q::parse($value);
        if (Q::cmp($quantity, '0') <= 0) abort(422, 'Use a positive grant quantity.');
        return $quantity;
    }
    public function available(Nation $nation): array {
        $detail = $nation->getDetail(); $result = [];
        $available = app(ResourceLedger::class)->available($detail);
        foreach ($detail->resources()->resources as $key => $resource) if ($resource['grantable']) $result[$key] = $available[$key];
        return $result;
    }
    public function transfer(Nation $sender, Nation $recipient, string $key, string $quantity): bool {
        if (!GameMutation::holds($sender->getGame())) throw new \LogicException('Grant requires the game lock.');
        if ($sender->game_id !== $recipient->game_id || $sender->id === $recipient->id) abort(422, 'Invalid recipient.');
        $resource = $sender->getDetail()->resources()->get($key);
        abort_unless($resource['grantable'], 422, 'This resource cannot be granted.');
        $quantity = self::quantity($quantity);
        if (Q::cmp($quantity, $this->available($sender)[$key]) > 0) return false;
        $basis = '0';
        foreach ([[$sender, true], [$recipient, false]] as [$nation, $debit]) {
            $detail = $nation->getDetail();
            $stock = NationResourceStockpile::where('owner_kind', 'government')->where('nation_id', $nation->id)->where('turn_id', $detail->turn_id)
                ->where('resource_id', $resource['id'])->lockForUpdate()->first();
            if (!$stock) $stock = NationResourceStockpile::create($nation, $detail->getTurn(), $key, '0');
            if ($debit) $basis = $stock->removeQuantity($quantity);
            else {
                $stock->cost_basis = Q::add($stock->cost_basis, $basis);
                $stock->available_quantity = Q::add($stock->available_quantity, $quantity);
                $stock->save();
            }
        }
        return true;
    }
}

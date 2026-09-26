<?php
namespace App\Services;

use App\Domain\ResourceType;
use App\Models\{Nation, NationResourceStockpile};
use Illuminate\Validation\ValidationException;

/** Stored, uncommitted resources only. Call transfer while holding the game's mutation lock. */
final class NationGrantService {
    public static function quantityUnits(mixed $value): int {
        if ((!is_string($value) && !is_int($value) && !is_float($value))
            || !preg_match('/^(0|[1-9][0-9]{0,9})(?:\.([0-9]{1,4}))?$/D', (string) $value, $parts)) {
            throw ValidationException::withMessages(['quantity' => 'Use a positive amount with at most four decimal places.']);
        }
        $units = (int) $parts[1] * 10000 + (int) str_pad($parts[2] ?? '', 4, '0');
        if ($units < 1 || $units > 10000000000000) {
            throw ValidationException::withMessages(['quantity' => 'The amount must be between 0.0001 and 1,000,000,000.']);
        }
        return $units;
    }

    public static function formatted(int $units): string {
        return intdiv($units, 10000) . '.' . str_pad((string) ($units % 10000), 4, '0', STR_PAD_LEFT);
    }

    public function available(Nation $nation): array {
        $detail = $nation->getDetail();
        $inputs = $detail->exportProductionPlanning()['resources'];
        $result = [];
        foreach (ResourceType::cases() as $type) {
            if (!ResourceType::getMeta($type)->canBeStocked) continue;
            $row = $inputs[$type->name];
            $raw = max(0, $row['stock'] - $row['expenses'] - $row['upkeep']);
            $units = (int) floor($raw * 10000 / \App\Domain\LaborPoolConstants::LABOR_PER_UNIT_OF_PRODUCTION);
            $result[$type->name] = self::formatted($units);
        }
        return $result;
    }

    public function transfer(Nation $sender, Nation $recipient, ResourceType $type, int $units): bool {
        if (!GameMutation::holds($sender->getGame())) throw new \LogicException('Grant requires the game lock.');
        if ($sender->game_id !== $recipient->game_id || $sender->getId() === $recipient->getId()) abort(422, 'Invalid recipient.');
        if (!ResourceType::getMeta($type)->canBeStocked) abort(422, 'This resource cannot be granted.');
        if ($units < 1 || $units > 10000000000000) abort(422, 'Invalid grant quantity.');
        $available = $this->available($sender)[$type->name];
        $availableUnits = (int) round((float) $available * 10000);
        if ($units > $availableUnits) return false;
        foreach ([[$sender, -$units], [$recipient, $units]] as [$nation, $change]) {
            $detail = $nation->getDetail();
            $stock = NationResourceStockpile::where('nation_id', $nation->getId())
                ->where('turn_id', $detail->turn_id)->where('resource_type', $type->value)->lockForUpdate()->first();
            if (!$stock) $stock = NationResourceStockpile::create($nation, $detail->getTurn(), $type, 0);
            // Preserve sub-grant-precision residuals already present in the economy.
            $stock->available_quantity += $change / 10000;
            if ($stock->available_quantity < 0) throw new \LogicException('Grant would overdraw stock.');
            $stock->save();
            $detail->unsetRelations();
            $detail->onDeployment(); // Existing allocator; submitted production bids remain unchanged.
        }
        return true;
    }
}

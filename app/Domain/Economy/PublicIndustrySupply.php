<?php

declare(strict_types=1);

namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;
use Brick\Math\{BigDecimal, RoundingMode};

/** Funded business replenishment from public facilities, not a release of state reserves. */
final class PublicIndustrySupply
{
    private const Z = '0.000000';

    public static function plan(array $state, array $defs, array $civilian, array $rules, array &$rows, array &$publicTargets): void
    {
        $capacity = ['government' => [], 'producer' => []];
        foreach ($state['territories'] as $t) {
            foreach ($defs as $key => $_) foreach (['government', 'producer'] as $owner) {
                $available = isset($t['workers_per_unit'][$key]) ? Q::mul($t['capacity'][$owner][$key] ?? '0', $t['productive_condition'][$owner][$key] ?? '1') : self::Z;
                $capacity[$owner][$key] = Q::add($capacity[$owner][$key] ?? self::Z, $available);
            }
        }
        // Protect working capital for goods and upkeep. Residual services use what
        // remains after these funded replenishment orders, as they do after goods work.
        $operating = self::Z;
        foreach ($defs as $key => $def) $operating = Q::add($operating, Q::mul($capacity['producer'][$key] ?? '0', $def['wage']));
        foreach ($civilian['maintenance'] as $m) if ($m['owner'] === 'producer') $operating = Q::add($operating, Q::mul($m['required'], $m['wage']));
        $budget = Q::max('0', Q::sub($state['accounts']['producer']['cash'], Q::mul($operating, $rules['operating_reserve'])));
        foreach (CivilianProduction::order($defs) as $key) {
            $row = &$rows[$key];
            $row['public_industry_requested'] = $row['public_industry_planned'] = $row['public_industry_delivery'] = $row['public_industry_revenue'] = self::Z;
            if (Q::cmp($row['industrial_requested'], '0') <= 0) continue;
            $consumerNeed = Q::max('0', Q::sub(Q::sub($row['civilian_requested'], $civilian['subsistence_total'][$key] ?? '0'), $row['public_civilian_planned']));
            $privateCapacity = Q::cmp($defs[$key]['price'], Q::mul($defs[$key]['unit_cost'], Q::add('1', $rules['minimum_margin']))) > 0 ? ($capacity['producer'][$key] ?? self::Z) : self::Z;
            $need = Q::max('0', Q::sub(Q::add($consumerNeed, Q::mul($row['industrial_requested'], Q::add('2', $rules['input_stock_buffer']))), Q::add($row['private_opening'], $privateCapacity)));
            $row['public_industry_requested'] = $need;
            $quantity = Q::min($need, Q::max('0', Q::sub($capacity['government'][$key] ?? '0', $publicTargets[$key])));
            $quantity = Q::min($quantity, (string) BigDecimal::of($budget)->dividedBy($defs[$key]['price'], 6, RoundingMode::DOWN));
            $row['public_industry_planned'] = $quantity;
            $publicTargets[$key] = Q::add($publicTargets[$key], $quantity);
            $budget = Q::sub($budget, Q::mul($quantity, $defs[$key]['price']));
        }
        unset($row);
    }

    public static function reserve(ProductionAccounts $a, array $rows, array $defs): void
    {
        foreach ($rows as $key => $row) if (Q::cmp($row['public_industry_planned'], '0') > 0)
            $a->reserve('industry:' . $key, 'producer', Q::mul($row['public_industry_planned'], $defs[$key]['price']));
    }

    /** Work is finished: bought goods join closing inventory, not opening recipe inputs. */
    public static function exchange(ProductionAccounts $a, array &$rows, array $defs): void
    {
        foreach ($rows as $key => &$row) {
            if (Q::cmp($row['public_industry_planned'], '0') <= 0) continue;
            // Civilian public output and funded state deliveries retain their allocation.
            $made = Q::max('0', Q::sub($row['production']['government'], Q::add($row['public_civilian_planned'], $row['public_planned'])));
            $quantity = $a->purchase('producer', 'government', $key, Q::min($row['public_industry_planned'], $made), 'industry:' . $key);
            $row['public_industry_delivery'] = $quantity;
            $row['public_industry_revenue'] = Q::mul($quantity, $defs[$key]['price']);
        }
        unset($row);
    }
}

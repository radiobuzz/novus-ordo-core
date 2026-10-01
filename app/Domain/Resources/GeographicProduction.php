<?php
namespace App\Domain\Resources;

/** Shared potential for creation, public inspection, forecast and seasonal allocation. */
final class GeographicProduction
{
    /** Manufacturing has a population ceiling; geographic potential has an optional
     * catalogue conversion, without rewriting map deposits or installed assets. */
    public static function potential(array $rules, string $key, array $geography, int $population): string {
        if (isset($rules['production.manufacturing'])) return Quantity::output($population, $rules['production.manufacturing']['capacity_per_million']);
        return Quantity::mul(Quantity::max('0', Quantity::calculated((float) ($geography['resources'][$key]['capacity'] ?? 0))), $rules['production.territorial_labor']['potential_multiplier'] ?? '1');
    }
    public static function facility(array $rule, string $key, array $geography, string $terrain, int $workers): array {
        if (!($rule['geographic'] ?? false)) return ['productivity'=>$rule['yields'][$terrain],'capacity'=>$workers];
        $source=$geography['resources'][$key]??['capacity'=>0,'terrainWeights'=>[]];
        $weight=array_sum($source['terrainWeights']);$rate=0;
        foreach($source['terrainWeights'] as $type=>$amount)$rate+=(float)$rule['yields'][$type]*$amount;
        $rate=$weight>0?$rate/$weight:0;
        $productivity=number_format($rate,6,'.','');
        // Floor worker capacity: no rounding can extract more than geographic output potential.
        $potential=(float)$source['capacity']*(float)($rule['potential_multiplier']??'1');
        $capacity=(float)$productivity>0?min($workers,(int)floor($potential/(float)$productivity*1000000)):0;
        return ['productivity'=>$productivity,'capacity'=>$capacity];
    }
}

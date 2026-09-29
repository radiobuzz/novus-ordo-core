<?php
namespace App\Domain\Resources;

/** Shared potential for creation, public inspection, forecast and seasonal allocation. */
final class GeographicProduction
{
    public static function facility(array $rule, string $key, array $geography, string $terrain, int $workers): array {
        if (!($rule['geographic'] ?? false)) return ['productivity'=>$rule['yields'][$terrain],'capacity'=>$workers];
        $source=$geography['resources'][$key]??['capacity'=>0,'terrainWeights'=>[]];
        $weight=array_sum($source['terrainWeights']);$rate=0;
        foreach($source['terrainWeights'] as $type=>$amount)$rate+=(float)$rule['yields'][$type]*$amount;
        $rate=$weight>0?$rate/$weight:0;
        $productivity=number_format($rate,6,'.','');
        // Floor worker capacity: no rounding can extract more than geographic output potential.
        $capacity=(float)$productivity>0?min($workers,(int)floor($source['capacity']/(float)$productivity*1000000)):0;
        return ['productivity'=>$productivity,'capacity'=>$capacity];
    }
}

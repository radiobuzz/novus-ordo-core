<?php

namespace App\Domain\Resources;

/** Demographic consequences of fulfilled nutrition; production belongs to the coordinated economy. */
final class Agriculture
{
    public static function shortage(array $food): float
    {
        $need = (float) $food['civilian_requested'];
        return $need > 0 ? max(0, min(1, 1 - (float) $food['civilian']['fulfilled'] / $need)) : 0;
    }

    public static function growthMultiplier(array $food, array $rules): float
    {
        // Full nutrition gives ordinary growth. Total shortage causes decline; stocks do not boost growth.
        return 1 - ($rules['food_shortage_growth_penalty'] ?? 3) * self::shortage($food);
    }
}

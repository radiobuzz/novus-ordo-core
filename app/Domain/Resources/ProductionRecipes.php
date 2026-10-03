<?php
declare(strict_types=1);
namespace App\Domain\Resources;

use DomainException;

/** Stable input-before-output ordering; resource names have no special meaning. */
final class ProductionRecipes
{
    public static function order(array $definitions): array
    {
        ksort($definitions, SORT_STRING);
        $done = $active = $order = [];
        $visit = function (string $key) use (&$visit, &$done, &$active, &$order, $definitions): void {
            if (isset($done[$key])) return;
            if (isset($active[$key])) throw new DomainException('Cyclic production recipes.');
            if (!isset($definitions[$key])) throw new DomainException('Unknown recipe input.');
            $active[$key] = true;
            $inputs = $definitions[$key]['inputs'] ?? [];
            ksort($inputs, SORT_STRING);
            foreach ($inputs as $input => $_) $visit($input);
            unset($active[$key]);
            $done[$key] = true;
            $order[] = $key;
        };
        foreach ($definitions as $key => $_) $visit($key);
        return $order;
    }
}

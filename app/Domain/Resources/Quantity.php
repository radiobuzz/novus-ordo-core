<?php

namespace App\Domain\Resources;

use Brick\Math\{BigDecimal, RoundingMode};
use Illuminate\Validation\ValidationException;
/** Exact six-place quantities. Continuous simulation values are quantized at their accounting boundary. */
final class Quantity
{
    public static function parse(mixed $value, bool $signed = false): string
    {
        if (!is_string($value) && !is_int($value) || !preg_match($signed ? '/^-?\d+(?:\.\d{1,6})?$/D' : '/^\d+(?:\.\d{1,6})?$/D', (string) $value)) {
            self::fail();
        }
        return self::bounded(BigDecimal::of($value)->toScale(6));
    }
    private static function bounded(BigDecimal $v): string
    {
        if ($v->abs()->isGreaterThan('99999999999999.999999')) {
            self::fail();
        }
        return (string) $v;
    }
    private static function fail(): never
    {
        throw ValidationException::withMessages(['quantity' => 'Use a bounded decimal quantity with at most six decimal places.']);
    }
    public static function add(string $a, string $b): string
    {
        return self::bounded(BigDecimal::of($a)->plus($b)->toScale(6));
    }
    public static function sub(string $a, string $b): string
    {
        return self::bounded(BigDecimal::of($a)->minus($b)->toScale(6));
    }
    public static function mul(string $a, string|int $b): string
    {
        return self::bounded(BigDecimal::of($a)->multipliedBy($b)->toScale(6, RoundingMode::HALF_UP));
    }
    public static function cmp(string $a, string $b): int
    {
        return BigDecimal::of($a)->compareTo($b);
    }
    public static function min(string $a, string $b): string
    {
        return self::cmp($a, $b) < 0 ? $a : $b;
    }
    public static function max(string $a, string $b): string
    {
        return self::cmp($a, $b) > 0 ? $a : $b;
    }
    public static function output(int $workers, string $yield): string
    {
        return self::bounded(BigDecimal::of($workers)->multipliedBy($yield)->dividedBy(1000000, 6, RoundingMode::DOWN));
    }
    public static function workers(string $quantity, string $yield): int
    {
        return BigDecimal::of($quantity)->multipliedBy(1000000)->dividedBy($yield, 0, RoundingMode::CEILING)->toInt();
    }
    public static function calculated(float $value): string
    {
        if (!is_finite($value)) {
            self::fail();
        }
        return self::parse(number_format($value, 6, '.', ''), true);
    }
}

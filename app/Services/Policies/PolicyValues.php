<?php

namespace App\Services\Policies;

use Illuminate\Validation\ValidationException;

/** Six decimal places, using integer arithmetic for bounds and step checks. */
final class PolicyValues {
    public static function fail(string $path, string $message): never {
        throw ValidationException::withMessages([$path => $message]);
    }

    public static function decimal(mixed $value, string $path): string {
        if (!is_string($value) || !preg_match('/^-?(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?$/D', $value)) {
            self::fail($path, 'Use a decimal string with at most nine whole and six fractional digits.');
        }
        $result = str_contains($value, '.') ? rtrim(rtrim($value, '0'), '.') : $value;
        return $result === '-0' ? '0' : $result;
    }

    public static function scaled(string $value): int {
        $negative = str_starts_with($value, '-');
        [$whole, $fraction] = array_pad(explode('.', ltrim($value, '-'), 2), 2, '');
        return ((int) $whole * 1_000_000 + (int) str_pad($fraction, 6, '0')) * ($negative ? -1 : 1);
    }

    public static function parameter(array $definition, mixed $value, string $path): mixed {
        $type = $definition['value_type'];
        if ($type === 'boolean') {
            if (!is_bool($value)) self::fail($path, 'A JSON boolean is required.');
            return $value;
        }
        if ($type === 'integer' && (!is_int($value) || abs($value) > 999_999_999)) self::fail($path, 'A bounded JSON integer is required.');
        $canonical = self::decimal($type === 'integer' ? (string) $value : $value, $path);
        $scaled = self::scaled($canonical);
        $min = isset($definition['min_value']) ? self::scaled($definition['min_value']) : null;
        $max = isset($definition['max_value']) ? self::scaled($definition['max_value']) : null;
        if (($min !== null && $scaled < $min) || ($max !== null && $scaled > $max)) self::fail($path, 'Value is outside the declared bounds.');
        if (isset($definition['step']) && ($scaled - ($min ?? 0)) % self::scaled($definition['step']) !== 0) self::fail($path, 'Value does not follow the declared step.');
        return $type === 'integer' ? $value : $canonical;
    }
}

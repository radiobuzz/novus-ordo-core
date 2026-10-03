<?php
declare(strict_types=1);
namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;
use DomainException;

/** Authored coefficients copied to each game, never fetched from a changing template mid-game. */
final class IndicatorRules
{
    public const INDICATORS = ['economic_strength', 'health', 'education', 'infrastructure', 'dynamism',
        'crime', 'inequality', 'environment', 'unrest', 'informal'];

    public static function defaults(): array
    {
        return json_decode(file_get_contents(__DIR__ . '/../../../database/economy-templates/indicator.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    public static function validate(array $rules): array
    {
        $defaults = self::defaults();
        $walk = function (array $value, array $shape, string $path) use (&$walk): array {
            if (array_diff_key($value, $shape)) throw new DomainException("Unknown economy rule at $path.");
            foreach ($shape as $key => $default) {
                $v = $value[$key] ?? $default;
                if (is_array($default)) {
                    if (!is_array($v)) throw new DomainException("Expected rule group at $path.$key.");
                    if (array_is_list($default)) {
                        $sorted = $v; $expected = $default; sort($sorted); sort($expected);
                        if ($sorted !== $expected) throw new DomainException('Funding priority must include every spending class exactly once.');
                    } else $v = $walk($v, $default, "$path.$key");
                } elseif (is_string($default)) {
                    $v = Q::parse($v);
                } elseif (!is_numeric($v) || !is_finite((float) $v) || (float) $v < 0 || (float) $v > 1000000) {
                    throw new DomainException("Invalid coefficient at $path.$key.");
                } else $v = (float) $v;
                $value[$key] = $v;
            }
            return $value;
        };
        $rules = $walk($rules, $defaults, 'rules');
        $priority = array_flip($rules['funding_priority']);
        if ($priority['interest'] !== 0 || $priority['resource_development'] !== count($priority) - 1
            || $priority['infrastructure_maintenance'] > $priority['infrastructure_development']
            || $priority['acquisitions'] > $priority['infrastructure_development']) {
            throw new DomainException('Pay interest first; assess acquisitions and maintenance before construction; allocate resource expansion last.');
        }
        foreach (['initial_core', 'initial_neutral', 'rates', 'hypothesis'] as $group) foreach ($rules[$group] as $key => $value) {
            if (is_array($value)) { foreach ($value as $weight) if ($weight > 1) throw new DomainException('Invalid condition weight.'); }
            elseif ($value > 1) throw new DomainException("Ratio exceeds one: $group.$key.");
        }
        if (abs(array_sum($rules['hypothesis']['condition_weights']) - 1) > .000001) throw new DomainException('Condition weights must sum to one.');
        foreach (['private_tax_tolerance','inequality_hardship_width'] as $key) if ($rules['hypothesis'][$key] <= 0) throw new DomainException("Positive coefficient required: $key.");
        foreach (['reference_income_per_million'] as $key) if ($rules[$key] <= 0) throw new DomainException('Reference income must be positive.');
        foreach (['infrastructure_point'] as $key) if ($rules['costs_per_million'][$key] <= 0) throw new DomainException('Construction cost must be positive.');
        foreach (['interest_rate','debt_relief','credit_warning_fraction'] as $key) if (Q::cmp($rules['finance'][$key], '1') > 0) throw new DomainException('Invalid fiscal ratio.');
        foreach (['credit_lock_seasons','receipt_window'] as $key) {
            $v = $rules['finance'][$key];
            if (floor($v) !== $v || $v < ($key === 'receipt_window' ? 1 : 0) || $v > 100) throw new DomainException('Invalid fiscal duration.');
            $rules['finance'][$key] = (int) $v;
        }
        foreach (['construction_labor_share','operating_floor','shortage_health','shortage_unrest'] as $key) if ($rules['physical'][$key] > 1) throw new DomainException('Invalid physical ratio.');
        if ($rules['assessment']['informal_ceiling'] > 1) throw new DomainException('Invalid avoidance ceiling.');
        return $rules;
    }

    public static function state(array $state): array
    {
        if (array_diff_key($state, array_flip(self::INDICATORS)) || array_diff(self::INDICATORS, array_keys($state))) throw new DomainException('Every territorial indicator must be supplied, with no obsolete fields.');
        foreach ($state as &$value) {
            $value = is_float($value) ? Q::calculated($value) : Q::parse($value);
            if (Q::cmp($value, '1') > 0) throw new DomainException('Indicator exceeds one.');
        }
        unset($value);
        return $state;
    }
}

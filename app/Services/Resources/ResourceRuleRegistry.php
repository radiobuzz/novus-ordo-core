<?php

namespace App\Services\Resources;

use App\Domain\{DivisionType, TerrainType};
use App\Domain\Resources\Quantity as Q;
use Illuminate\Validation\ValidationException;
final class ResourceRuleRegistry
{
    public static function fail(string $message): never
    {
        throw ValidationException::withMessages(['resources' => $message]);
    }
    public function validate(array $document): array
    {
        if (!is_string($document['name'] ?? null) || trim($document['name']) === '') {
            self::fail('Name required.');
        }
        if (!is_array($document['resources'] ?? null) || !array_is_list($document['resources']) || !$document['resources']) {
            self::fail('Resources must be a nonempty list.');
        }
        $keys = [];
        $roles = [];
        $currencies = 0;
        foreach ($document['resources'] as &$r) {
            $key = $r['key'] ?? '';
            if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $key) || isset($keys[$key])) {
                self::fail('Resource keys must be unique lowercase identifiers.');
            }
            if (!in_array($r['kind'] ?? null, ['currency', 'stock', 'capacity'], true)) {
                self::fail("Unsupported kind for {$key}.");
            }
            $r['role'] ??= null;
            if ($r['role'] !== null) {
                $kind = ['treasury' => 'currency', 'nutrition' => 'stock', 'recruitment' => 'capacity'][$r['role']] ?? null;
                if ($kind !== $r['kind'] || isset($roles[$r['role']])) {
                    self::fail('Invalid or duplicate semantic role.');
                }
                $roles[$r['role']] = $key;
            }
            $currencies += $r['kind'] === 'currency';
            foreach (['labels', 'unit_labels'] as $field) {
                if (!is_string($r[$field]['en'] ?? null) || !trim($r[$field]['en'])) {
                    self::fail("{$field} needs an English label.");
                }
            }
            foreach (['labels', 'unit_labels', 'descriptions'] as $field) {
                $r[$field] ??= [];
                foreach ($r[$field] as $locale => $value) {
                    if (!is_string($value) || strlen($value) > 4000) {
                        self::fail('Invalid localized text.');
                    }
                }
            }
            $r['icon_key'] ??= null;
            if ($r['icon_key'] !== null && (!is_string($r['icon_key']) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $r['icon_key']))) {
                self::fail('Icon keys must be short asset identifiers or null.');
            }
            $r['sort_order'] ??= 0;
            $r['display_decimals'] ??= 2;
            if (!is_int($r['sort_order']) || !is_int($r['display_decimals']) || $r['display_decimals'] < 0 || $r['display_decimals'] > 6) {
                self::fail('Invalid display settings.');
            }
            $r['starting_quantity'] = Q::parse($r['starting_quantity'] ?? '0');
            if (!is_bool($r['grantable'] ?? null)) {
                self::fail('grantable must be boolean.');
            }
            if ($r['kind'] === 'capacity' && ($r['grantable'] || Q::cmp($r['starting_quantity'], '0') !== 0)) {
                self::fail('Capacity cannot be stocked or granted.');
            }
            $r['rules'] ??= [];
            foreach ($r['rules'] as $handler => &$p) {
                if (!is_array($p)) {
                    self::fail('Rule parameters must be objects.');
                }
                if ($handler === 'production.territorial_labor') {
                    if ($r['kind'] !== 'stock') {
                        self::fail('Only stocks have labor production.');
                    }
                    if (isset($p['geographic']) && !is_bool($p['geographic'])) self::fail('Geographic production must be a boolean.');
                    $expected = array_map(fn($t) => $t->name, TerrainType::cases());
                    $actual = array_keys($p['yields'] ?? []);
                    sort($expected);
                    sort($actual);
                    if ($actual !== $expected) {
                        self::fail('Supply yields for every supported terrain.');
                    }
                    foreach ($p['yields'] as &$yield) {
                        $yield = Q::parse($yield);
                    }
                    unset($yield);
                    if (array_diff(array_keys($p), ['geographic', 'yields'])) self::fail('Unsupported territorial production parameter.');
                    if (Q::cmp($p['yields']['Water'], '0') !== 0) {
                        self::fail('Water production is not supported.');
                    }
                } elseif (in_array($handler, ['demand.population', 'capacity.loyal_population'], true)) {
                    if ($r['kind'] !== ($handler === 'demand.population' ? 'stock' : 'capacity')) {
                        self::fail('Rule kind mismatch.');
                    }
                    $p['per_million'] = Q::parse($p['per_million'] ?? null);
                    if ($handler === 'demand.population' && (!is_int($p['priority'] ?? null) || $p['priority'] < 0)) {
                        self::fail('Invalid consumption priority.');
                    }
                } elseif (isset(self::productionContracts()[$handler])) {
                    $contract = self::productionContracts()[$handler];
                    if ($r['kind'] !== $contract['kind']) self::fail('Rule kind mismatch.');
                    $fields = array_keys($p); $expected = array_keys($contract['fields']);
                    sort($fields); sort($expected);
                    if ($fields !== $expected) self::fail("Supply exactly the registered parameters for {$handler}.");
                    foreach ($contract['fields'] as $field => $type) {
                        $p[$field] = Q::parse($p[$field]);
                        if ($type === 'positive' && Q::cmp($p[$field], '0') <= 0) self::fail("{$handler}.{$field} must be positive.");
                        if ($type === 'ratio' && Q::cmp($p[$field], '1') > 0) self::fail("{$handler}.{$field} must be between zero and one.");
                    }
                } else {
                    self::fail("Unsupported resource mechanism: {$handler}.");
                }
            }
            unset($p);
            if (isset($r['rules']['production.territorial_labor'])) {
                foreach (['production.operating', 'exchange.reference_price', 'development.capacity', 'production.founding'] as $handler) {
                    if (!isset($r['rules'][$handler])) self::fail("Production requires {$handler}.");
                }
            } elseif (array_intersect(array_keys($r['rules']), ['production.operating', 'development.capacity', 'production.founding'])) {
                self::fail('Production economics requires a physical production provider.');
            }
            if ($r['role'] === 'treasury' && !isset($r['rules']['finance.civilian_founding'])) self::fail('Treasury requires explicit civilian founding funds.');
            if (isset($r['rules']['finance.civilian_founding']) && $r['role'] !== 'treasury') self::fail('Civilian founding funds belong to the treasury definition.');
            if ($r['kind'] === 'capacity' && !isset($r['rules']['capacity.loyal_population'])) {
                self::fail('Capacity requires a provider.');
            }
            if ($r['role'] === 'nutrition' && !isset($r['rules']['demand.population'])) {
                self::fail('Nutrition requires population demand.');
            }
            $keys[$key] = $r;
        }
        unset($r);
        if ($currencies !== 1 || count($roles) !== 3) {
            self::fail('Exactly one treasury, nutrition and recruitment role is required.');
        }
        $unitKeys = array_keys($document['units'] ?? []);
        $expected = array_map(fn($t) => $t->name, DivisionType::cases());
        sort($unitKeys);
        sort($expected);
        if ($unitKeys !== $expected) {
            self::fail('Supply explicit cost maps for every supported division type.');
        }
        foreach ($document['units'] as $unit => &$phases) {
            $actual = array_keys($phases);
            sort($actual);
            if ($actual !== ['active_capacity', 'deployment', 'operation', 'season']) {
                self::fail("Supply all four cost phases for {$unit}.");
            }
            foreach ($phases as $phase => &$costs) {
                if (!is_array($costs)) {
                    self::fail('Cost map required.');
                }
                foreach ($costs as $key => &$q) {
                    $kind = $keys[$key]['kind'] ?? null;
                    if (!$kind || !in_array($kind, match ($phase) {
                        'active_capacity' => ['capacity'],
                        'season' => ['currency'],
                        default => ['stock', 'currency'],
                    }, true)) {
                        self::fail("Invalid {$phase} resource: {$key}.");
                    }
                    $q = Q::parse($q);
                    if (Q::cmp($q, '0') <= 0) {
                        self::fail('Cost entries must be positive; explicitly omit a free cost.');
                    }
                }
                unset($q);
            }
            unset($costs);
        }
        unset($phases);
        return $document;
    }

    /** Units and bounds are engine contracts, never arbitrary expressions from the catalogue. */
    public static function productionContracts(): array {
        return [
            'production.operating' => ['kind' => 'stock', 'fields' => ['wage_per_unit' => 'quantity']],
            'exchange.reference_price' => ['kind' => 'stock', 'fields' => ['price' => 'positive']],
            'development.capacity' => ['kind' => 'stock', 'fields' => [
                'capital_cost' => 'positive', 'construction_workers' => 'positive', 'max_growth_fraction' => 'ratio',
            ]],
            'production.founding' => ['kind' => 'stock', 'fields' => [
                'core_developed_fraction' => 'ratio', 'neutral_developed_fraction' => 'ratio', 'public_share' => 'ratio',
                'private_inventory_per_million' => 'quantity', 'private_inventory_unit_cost' => 'quantity',
            ]],
            'finance.civilian_founding' => ['kind' => 'currency', 'fields' => [
                'household_cash_per_million' => 'quantity', 'producer_cash_per_million' => 'quantity',
            ]],
        ];
    }
}

<?php

namespace App\Services\Policies;

use App\Services\Resources\ResourceCatalogue;

/** Supported configuration contracts. Economic consumers are deliberately not implemented here. */
final class PolicyEffectRegistry {
    public function contracts(): array {
        return [
            'food.emergency_release' => ['target' => 'resource_role', 'targets' => ['nutrition'], 'value' => 'fraction', 'type' => 'ratio', 'unit' => 'fraction_of_reserves', 'neutral' => '0'],
            'institutions.development_ownership' => ['target' => 'sector', 'targets' => ['production'], 'value' => 'arrangement', 'type' => 'enum', 'values' => ['private', 'mixed', 'public'], 'neutral' => 'mixed'],
            'production.development_funding' => ['target' => 'resource', 'targets' => [], 'catalogue' => true, 'value' => 'funding_ratio', 'type' => 'ratio', 'unit' => 'fraction_of_program_requirement', 'neutral' => '0'],
            'allocation.production_priority' => ['target' => 'resource', 'targets' => [], 'catalogue' => true, 'value' => 'priority', 'type' => 'enum', 'values' => ['potential', 'regional', 'population'], 'neutral' => 'potential'],
            'finance.treasury_reserve' => ['target' => 'account', 'targets' => ['treasury'], 'value' => 'amount', 'type' => 'amount', 'unit' => 'credits', 'neutral' => null],
            'finance.income_tax' => ['target' => 'base', 'targets' => ['taxable_income'], 'value' => 'rate', 'type' => 'ratio', 'unit' => 'fraction_of_taxable_income', 'neutral' => '0'],
            'budget.program_funding' => ['target' => 'program', 'targets' => ['infrastructure'], 'value' => 'funding_ratio', 'type' => 'ratio', 'unit' => 'fraction_of_program_requirement', 'neutral' => '0'],
            'budget.income_support' => ['target' => 'recipient', 'targets' => ['households'], 'value' => 'amount', 'type' => 'amount', 'unit' => 'credits', 'neutral' => '0'],
            'allocation.infrastructure_priority' => ['target' => 'program', 'targets' => ['infrastructure'], 'value' => 'priority', 'type' => 'enum', 'values' => ['regional', 'population', 'concentration'], 'neutral' => 'regional'],
            'food.reserve_target' => ['target' => 'resource_role', 'targets' => ['nutrition'], 'value' => 'seasons', 'type' => 'enum', 'values' => ['0', '0.5', '1', '2'], 'neutral' => '0'],
        ];
    }

    public function validate(array $effect, array $parameters, string $path): void {
        $contract = $this->contracts()[$effect['effect_type']] ?? null;
        if (!$contract) PolicyValues::fail($path, 'Unknown effect handler. New mechanisms require code.');
        $args = $effect['arguments'];
        if (count($args) !== 2 || !isset($args[$contract['target']], $args[$contract['value']])) PolicyValues::fail($path, 'Arguments must match the registered contract.');
        if ($contract['catalogue'] ?? false) {
            $target = $args[$contract['target']];
            if (!is_string($target) || !preg_match('/^(?:role:)?[a-z][a-z0-9_]{0,63}$/D', $target)) PolicyValues::fail($path, 'Use a resource key or role:name target.');
        } elseif (!in_array($args[$contract['target']], $contract['targets'], true)) PolicyValues::fail($path, 'Unsupported effect target.');
        $value = $args[$contract['value']];
        if (is_array($value)) {
            if (array_keys($value) !== ['parameter'] || !is_string($value['parameter']) || !isset($parameters[$value['parameter']])) PolicyValues::fail($path, 'Invalid parameter binding.');
            $parameter = $parameters[$value['parameter']];
            if ($contract['type'] === 'amount') {
                if ($parameter['value_type'] !== 'decimal' || $parameter['unit_key'] !== $contract['unit'] || !isset($parameter['min_value'], $parameter['max_value']) || PolicyValues::scaled($parameter['min_value']) < 0) PolicyValues::fail($path, 'This effect requires a nonnegative bounded currency amount.');
                return;
            }
            if ($contract['type'] !== 'ratio' || $parameter['value_type'] !== 'decimal' || $parameter['unit_key'] !== $contract['unit']
                || !isset($parameter['min_value'], $parameter['max_value'])
                || PolicyValues::scaled($parameter['min_value']) < 0 || PolicyValues::scaled($parameter['max_value']) > 1_000_000) PolicyValues::fail($path, 'This effect requires a decimal ratio bounded between zero and one.');
        } elseif ($contract['type'] === 'amount') {
            if (PolicyValues::scaled(PolicyValues::decimal($value, $path)) < 0) PolicyValues::fail($path, 'Currency amount must be nonnegative.');
        } elseif ($contract['type'] === 'ratio') {
            $number = PolicyValues::scaled(PolicyValues::decimal($value, $path));
            if ($number < 0 || $number > 1_000_000) PolicyValues::fail($path, 'Effect ratio must be between zero and one.');
        } elseif (!in_array($value, $contract['values'], true)) PolicyValues::fail($path, 'Unsupported effect value.');
    }

    /** Always start from neutral values: recompilation never stacks effects or charges money. */
    public function compile(array $policies, array $choices, ?ResourceCatalogue $catalogue = null): array {
        $settings = []; $assigned = [];
        foreach ($this->contracts() as $type => $contract) foreach ($contract['targets'] as $target) $settings[$type][$target] = $contract['neutral'];
        if ($catalogue) foreach ($this->contracts() as $type => $contract) {
            if ($contract['catalogue'] ?? false) foreach ($catalogue->producers() as $key => $resource) $settings[$type][$key] = $contract['neutral'];
        }
        foreach ($policies as $key => $policy) {
            if ($policy['status'] !== 'active') continue;
            $choice = $choices[$key];
            $option = collect($policy['options'])->firstWhere('key', $choice['option']);
            foreach ($option['effects'] as $effect) {
                $contract = $this->contracts()[$effect['effect_type']];
                $target = $effect['arguments'][$contract['target']];
                if (($contract['catalogue'] ?? false) && $catalogue) $target = $this->resolveTarget($catalogue, $target);
                $slot = $effect['effect_type'] . ':' . $target;
                if (isset($assigned[$slot])) PolicyValues::fail("choices.$key", "Conflicting exclusive effects from {$assigned[$slot]} and $key.");
                $assigned[$slot] = $key;
                $value = $effect['arguments'][$contract['value']];
                $value = is_array($value) ? $choice['parameters'][$value['parameter']] : $value;
                $settings[$effect['effect_type']][$target] = in_array($contract['type'], ['ratio','amount'], true) ? PolicyValues::decimal($value, $slot) : $value;
            }
        }
        return $settings;
    }

    /** Bind every option, not just today's selected option, before attaching definitions to a game. */
    public function validateCatalogueTargets(array $document, ResourceCatalogue $catalogue): void {
        foreach ($document['policies'] as $policy) foreach ($policy['options'] as $option) foreach ($option['effects'] as $effect) {
            $contract = $this->contracts()[$effect['effect_type']];
            if ($contract['catalogue'] ?? false) $this->resolveTarget($catalogue, $effect['arguments'][$contract['target']]);
        }
    }

    private function resolveTarget(ResourceCatalogue $catalogue, string $target): string {
        $key = $target;
        if (str_starts_with($target, 'role:')) {
            $key = null;
            foreach ($catalogue->resources as $candidate => $resource) if ($resource['role'] === substr($target, 5)) $key = $candidate;
            if ($key === null) PolicyValues::fail('resource', 'Unknown semantic resource role in this game.');
        }
        $resource = $catalogue->get($key);
        if ($resource['kind'] !== 'stock' || !isset($resource['rules']['development.capacity'])) PolicyValues::fail('resource', 'This effect requires a developable stock resource in the game catalogue.');
        return $key;
    }
}

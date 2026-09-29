<?php

namespace App\Services\Policies;

/** Pure selection validation shared by previews, submission, founding and seasonal resolution. */
final class PolicyRules {
    public function defaults(array $policies): array {
        $choices = [];
        foreach ($policies as $key => $policy) if ($policy['status'] === 'active') {
            $option = collect($policy['options'])->first(fn ($o) => $o['is_default'] && !$o['retired']);
            $choices[$key] = ['option' => $option['key'], 'parameters' => array_column($policy['parameters'], 'default_value', 'key')];
        }
        return $choices;
    }

    public function normalize(array $policies, array $choices): array {
        $active = array_filter($policies, fn ($p) => $p['status'] === 'active');
        if (array_diff_key($choices, $active) || array_diff_key($active, $choices)) PolicyValues::fail('choices', 'Supply exactly the active policies in this game.');
        foreach ($choices as $key => &$choice) {
            if (!is_array($choice) || count($choice) !== 2 || !isset($choice['option'], $choice['parameters']) || !is_string($choice['option']) || !is_array($choice['parameters'])) PolicyValues::fail("choices.$key", 'Use an option key and complete parameters object.');
            $policy = $active[$key];
            $option = collect($policy['options'])->firstWhere('key', $choice['option']);
            if (!$option || $option['retired']) PolicyValues::fail("choices.$key", 'Option is unavailable; reselect this test-game policy.');
            $parameters = array_column($policy['parameters'], null, 'key');
            if (array_diff_key($choice['parameters'], $parameters) || array_diff_key($parameters, $choice['parameters'])) PolicyValues::fail("choices.$key.parameters", 'Supply all declared parameters, without unknown keys.');
            foreach ($parameters as $param => $definition) $choice['parameters'][$param] = PolicyValues::parameter($definition, $choice['parameters'][$param], "choices.$key.parameters.$param");
            ksort($choice['parameters']);
            $choice = ['option' => $choice['option'], 'parameters' => $choice['parameters']];
        }
        unset($choice); ksort($choices);
        return $choices;
    }

    public function violations(array $policies, array $choices): array {
        $violations = [];
        foreach ($choices as $key => $choice) {
            $policy = $policies[$key];
            $option = collect($policy['options'])->firstWhere('key', $choice['option']);
            foreach ($policy['conditions'] as $condition) {
                if ($condition['option'] !== null && $condition['option'] !== $choice['option']) continue;
                if ($condition['option'] === null && $option['is_default']) continue;
                $matches = in_array($choices[$condition['referenced_policy']]['option'] ?? null, $condition['option_keys'], true);
                if ($condition['condition_type'] === 'requires_option' ? !$matches : $matches) {
                    $violations[] = ['policy' => $key, 'condition' => $condition['key'], 'message' => $condition['message']];
                }
            }
        }
        return $violations;
    }

    public function validate(array $policies, array $choices): array {
        $choices = $this->normalize($policies, $choices);
        foreach ($this->violations($policies, $choices) as $violation) PolicyValues::fail('choices.' . $violation['policy'], $violation['message']['en']);
        app(PolicyEffectRegistry::class)->compile($policies, $choices);
        return $choices;
    }

    public function preview(array $policies, array $current, array $changes): array {
        $proposal = $this->normalize($policies, array_replace($current, $changes));
        $violations = $this->violations($policies, $proposal);
        $defaults = $this->defaults($policies);
        $suggestions = [];
        foreach ($violations as $violation) {
            $key = $violation['policy'];
            $candidate = array_replace($proposal, [$key => $defaults[$key]]);
            $stillInvalid = array_filter($this->violations($policies, $candidate), fn ($v) => $v['policy'] === $key);
            $suggestions[$key] = $stillInvalid ? null : $defaults[$key];
        }
        return ['valid' => !$violations, 'proposal' => $proposal, 'violations' => $violations,
            'suggested_replacements' => $suggestions,
            'settings' => $violations ? null : app(PolicyEffectRegistry::class)->compile($policies, $proposal),
            'indicator_forecast' => null, 'economic_consumers_available' => false];
    }
}

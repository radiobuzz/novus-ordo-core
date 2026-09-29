<?php

namespace App\Services\Policies;

use Illuminate\Support\Facades\Validator;

final class PolicyDefinitionValidator {
    public function validate(array $document): array {
        $key = ['required', 'string', 'max:80', 'regex:/^[a-z][a-z0-9_]*$/D'];
        Validator::make($document, [
            'name' => 'required|string|max:255', 'description' => 'nullable|string|max:20000',
            'policies' => 'present|array|max:500',
            'policies.*' => 'required|array:key,category_key,labels,descriptions,sort_order,status,options,parameters,conditions',
            'policies.*.key' => $key, 'policies.*.category_key' => $key,
            'policies.*.status' => 'required|in:draft,active,retired',
            'policies.*.sort_order' => 'sometimes|integer|min:0|max:100000',
            'policies.*.options' => 'present|array|max:100',
            'policies.*.options.*' => 'required|array:key,labels,descriptions,is_default,sort_order,retired,effects',
            'policies.*.options.*.key' => $key,
            'policies.*.options.*.is_default' => 'required|boolean',
            'policies.*.options.*.retired' => 'sometimes|boolean',
            'policies.*.options.*.sort_order' => 'sometimes|integer|min:0|max:100000',
            'policies.*.options.*.effects' => 'present|array|max:100',
            'policies.*.options.*.effects.*' => 'required|array:key,effect_type,arguments,sort_order',
            'policies.*.options.*.effects.*.key' => $key,
            'policies.*.options.*.effects.*.effect_type' => 'required|string|max:100',
            'policies.*.options.*.effects.*.arguments' => 'required|array',
            'policies.*.options.*.effects.*.sort_order' => 'sometimes|integer|min:0|max:100000',
            'policies.*.parameters' => 'present|array|max:50',
            'policies.*.parameters.*' => 'required|array:key,labels,value_type,unit_key,default_value,min_value,max_value,step,sort_order',
            'policies.*.parameters.*.key' => $key,
            'policies.*.parameters.*.value_type' => 'required|in:decimal,integer,boolean',
            'policies.*.parameters.*.unit_key' => $key,
            'policies.*.parameters.*.default_value' => 'present',
            'policies.*.parameters.*.sort_order' => 'sometimes|integer|min:0|max:100000',
            'policies.*.conditions' => 'present|array|max:100',
            'policies.*.conditions.*' => 'required|array:key,option,condition_type,referenced_policy,option_keys,message',
            'policies.*.conditions.*.key' => $key,
            'policies.*.conditions.*.option' => 'nullable|string|max:80',
            'policies.*.conditions.*.condition_type' => 'required|in:requires_option,excludes_option',
            'policies.*.conditions.*.referenced_policy' => $key,
            'policies.*.conditions.*.option_keys' => 'required|array|min:1|max:100',
            'policies.*.conditions.*.option_keys.*' => $key,
        ])->validate();
        if (array_diff(array_keys($document), ['name', 'description', 'policies'])) PolicyValues::fail('catalogue', 'Unknown catalogue fields.');
        $document['description'] ??= null;
        $this->unique($document['policies'], 'policies');
        foreach ($document['policies'] as &$policy) {
            $path = 'policies.' . $policy['key'];
            $policy['sort_order'] ??= 0; $policy['descriptions'] ??= [];
            $this->labels($policy['labels'] ?? null, "$path.labels");
            $this->labels($policy['descriptions'], "$path.descriptions", false);
            foreach (['options', 'parameters', 'conditions'] as $field) $this->unique($policy[$field], "$path.$field");
            foreach ($policy['parameters'] as &$parameter) {
                $paramPath = "$path.parameters.{$parameter['key']}";
                $parameter['sort_order'] ??= 0;
                $this->labels($parameter['labels'] ?? null, "$paramPath.labels");
                foreach (['min_value', 'max_value', 'step'] as $field) {
                    $parameter[$field] ??= null;
                    if ($parameter[$field] !== null) {
                        if ($parameter['value_type'] === 'boolean') PolicyValues::fail($paramPath, 'Boolean parameters cannot have numeric bounds.');
                        $parameter[$field] = PolicyValues::decimal($parameter[$field], "$paramPath.$field");
                        if ($parameter['value_type'] === 'integer' && PolicyValues::scaled($parameter[$field]) % 1_000_000 !== 0) PolicyValues::fail($paramPath, 'Integer bounds and steps must be whole numbers.');
                    }
                }
                if (isset($parameter['step']) && PolicyValues::scaled($parameter['step']) <= 0) PolicyValues::fail($paramPath, 'Step must be positive.');
                if (isset($parameter['min_value'], $parameter['max_value']) && PolicyValues::scaled($parameter['min_value']) > PolicyValues::scaled($parameter['max_value'])) PolicyValues::fail($paramPath, 'Minimum exceeds maximum.');
                $parameter['default_value'] = PolicyValues::parameter($parameter, $parameter['default_value'], "$paramPath.default_value");
            }
            unset($parameter);
            $parameters = array_column($policy['parameters'], null, 'key');
            foreach ($policy['options'] as &$option) {
                $option['sort_order'] ??= 0; $option['retired'] ??= false; $option['descriptions'] ??= [];
                $option['is_default'] = (bool) $option['is_default']; $option['retired'] = (bool) $option['retired'];
                $optionPath = "$path.options.{$option['key']}";
                $this->labels($option['labels'] ?? null, "$optionPath.labels");
                $this->labels($option['descriptions'], "$optionPath.descriptions", false);
                $this->unique($option['effects'], "$optionPath.effects");
                foreach ($option['effects'] as &$effect) {
                    $effect['sort_order'] ??= 0;
                    app(PolicyEffectRegistry::class)->validate($effect, $parameters, "$optionPath.effects.{$effect['key']}");
                }
                unset($effect);
            }
            unset($option);
            if ($policy['status'] === 'active' && count(array_filter($policy['options'], fn ($o) => $o['is_default'] && !$o['retired'])) !== 1) PolicyValues::fail($path, 'An active policy needs exactly one available default.');
            foreach ($policy['conditions'] as &$condition) {
                $condition['option'] ??= null;
                $this->labels($condition['message'] ?? null, "$path.conditions.{$condition['key']}.message");
            }
            unset($condition);
        }
        unset($policy);
        $policies = array_column($document['policies'], null, 'key');
        $edges = [];
        foreach ($policies as $key => $policy) {
            $options = array_column($policy['options'], null, 'key');
            foreach ($policy['conditions'] as $condition) {
                $path = "policies.$key.conditions.{$condition['key']}";
                $target = $policies[$condition['referenced_policy']] ?? null;
                if (!$target || ($policy['status'] === 'active' && $target['status'] !== 'active')) PolicyValues::fail($path, 'Reference must resolve within this catalogue; active policies require active targets.');
                $targetOptions = array_column($target['options'], null, 'key');
                foreach ($condition['option_keys'] as $option) if (!isset($targetOptions[$option]) || ($policy['status'] === 'active' && $targetOptions[$option]['retired'])) PolicyValues::fail($path, 'Referenced option is unavailable.');
                if ($condition['option'] !== null && !isset($options[$condition['option']])) PolicyValues::fail($path, 'Condition option does not belong to its policy.');
                if ($condition['option'] === null) foreach ($options as $option) if ($option['is_default'] && $option['effects']) PolicyValues::fail($path, 'A topic-wide restriction needs a neutral default without effects.');
                $edges[$key][] = $condition['referenced_policy'];
            }
        }
        $visiting = []; $done = [];
        $visit = function (string $key) use (&$visit, &$visiting, &$done, $edges) {
            if (isset($done[$key])) return;
            if (isset($visiting[$key])) PolicyValues::fail('conditions', 'Cyclic policy dependencies are not supported.');
            $visiting[$key] = true;
            foreach ($edges[$key] ?? [] as $next) $visit($next);
            unset($visiting[$key]); $done[$key] = true;
        };
        foreach (array_keys($policies) as $key) $visit($key);
        $rules = app(PolicyRules::class);
        $rules->validate($policies, $rules->defaults($policies));
        return $document;
    }

    private function unique(array $rows, string $path): void {
        if (!array_is_list($rows)) PolicyValues::fail($path, 'Use a list of records.');
        $keys = array_column($rows, 'key');
        if (count($keys) !== count(array_unique($keys))) PolicyValues::fail($path, 'Keys must be unique within their parent.');
    }

    private function labels(mixed $labels, string $path, bool $required = true): void {
        if (!is_array($labels) || ($required && empty($labels['en']))) PolicyValues::fail($path, 'Provide a locale map with a generic English label.');
        foreach ($labels as $locale => $label) if (!is_string($locale) || !preg_match('/^[a-z]{2,3}(?:[-_][A-Za-z]{2,4})?$/D', $locale) || !is_string($label) || strlen($label) > 20000) PolicyValues::fail($path, 'Invalid locale content.');
    }
}

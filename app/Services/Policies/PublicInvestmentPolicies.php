<?php

namespace App\Services\Policies;

/** Additive definitions using the existing policy engine; never rewrite player choices. */
final class PublicInvestmentPolicies
{
    public static function appendMissing(array $document, array $resources): array
    {
        $funded = []; $keys = array_column($document['policies'], 'key');
        foreach ($document['policies'] as $policy) foreach ($policy['options'] as $option) foreach ($option['effects'] as $effect) {
            if ($effect['effect_type'] !== 'production.development_funding') continue;
            $target = $effect['arguments']['resource'];
            foreach ($resources as $key => $r) if ($target === $key || $target === 'role:' . ($r['role'] ?? '')) $funded[$key] = true;
        }
        foreach ($resources as $key => $r) {
            if ($r['kind'] !== 'stock' || !isset($r['rules']['development.capacity']) || isset($funded[$key])) continue;
            $policyKey = 'public_investment_' . $key;
            if (strlen($policyKey) > 80) $policyKey = substr($policyKey, 0, 63) . '_' . substr(hash('sha256', $key), 0, 16);
            if (in_array($policyKey, $keys, true)) PolicyValues::fail('catalogue', 'Public investment policy identity is already used: ' . $policyKey);
            $en = $r['labels']['en'] ?? $key; $fr = $r['labels']['fr'] ?? $en;
            $document['policies'][] = [
                'key' => $policyKey, 'category_key' => 'public_industry',
                'labels' => ['en' => 'Public expansion · ' . $en, 'fr' => 'Développement public · ' . $fr],
                'descriptions' => [
                    'en' => 'Funds new public capacity, not government stockpile purchases. Existing public facilities supply civilian demand automatically when buyers can pay. Construction is limited by deposits, workers and treasury funds, produces from the following season, and pauses when public investment is not permitted. Funding repeats each season; 0% stops expansion, not existing production.',
                    'fr' => 'Finance de nouvelles capacités publiques, pas les réserves de l’État. Les installations existantes répondent automatiquement à la demande civile solvable. La construction dépend du potentiel, des travailleurs et du trésor; elle produit dès la saison suivante et nécessite l’autorisation d’investir publiquement. Le financement se répète chaque saison; 0 % arrête l’expansion, pas la production existante.',
                ],
                'sort_order' => 100 + count($document['policies']), 'status' => 'active',
                'options' => [['key' => 'enabled', 'labels' => ['en' => 'Enabled', 'fr' => 'Activé'], 'descriptions' => [], 'is_default' => true, 'retired' => false, 'sort_order' => 0,
                    'effects' => [['key' => 'funding', 'effect_type' => 'production.development_funding', 'arguments' => ['resource' => $key, 'funding_ratio' => ['parameter' => 'funding_ratio']], 'sort_order' => 0]]]],
                'parameters' => [['key' => 'funding_ratio', 'labels' => ['en' => 'Share of feasible development requirement', 'fr' => 'Part des besoins de développement réalisable'],
                    'value_type' => 'decimal', 'unit_key' => 'fraction_of_program_requirement', 'default_value' => '0.00', 'min_value' => '0.00', 'max_value' => '1.00', 'step' => '0.01', 'sort_order' => 0]],
                'conditions' => [],
            ];
        }
        return $document;
    }
}

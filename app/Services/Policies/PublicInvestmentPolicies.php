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
                    'en' => 'Funds assessed capacity expansion when civilian needs or affordable government requests exceed existing capacity. Shares a single capacity pool with private initiative. Limited by geography, workers and actual public funds; new capacity works next season. Expansion tapers at its target. 0% stops public expansion, not existing production.',
                    'fr' => 'Finance les capacités nécessaires aux besoins civils et aux demandes publiques finançables. Partage les capacités avec l’initiative privée. Dépend de la géographie, des travailleurs et des fonds publics réels; produit dès la saison suivante. Les travaux ralentissent à la cible. 0 % arrête les travaux publics, pas la production existante.',
                ],
                'sort_order' => 100 + count($document['policies']), 'status' => 'active',
                'options' => [['key' => 'enabled', 'labels' => ['en' => 'Enabled', 'fr' => 'Activé'], 'descriptions' => [], 'is_default' => true, 'retired' => false, 'sort_order' => 0,
                    'effects' => [['key' => 'funding', 'effect_type' => 'production.development_funding', 'arguments' => ['resource' => $key, 'funding_ratio' => ['parameter' => 'funding_ratio']], 'sort_order' => 0]]]],
                'parameters' => [['key' => 'funding_ratio', 'labels' => ['en' => 'Share of feasible development requirement', 'fr' => 'Part des besoins de développement réalisable'],
                    'value_type' => 'decimal', 'unit_key' => 'fraction_of_program_requirement', 'default_value' => '1.00', 'min_value' => '0.00', 'max_value' => '1.00', 'step' => '0.01', 'sort_order' => 0]],
                'conditions' => [],
            ];
        }
        return $document;
    }
}

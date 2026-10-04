<?php
declare(strict_types=1);
namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;

/** Gradual targets describe conditions, not individual jobs, wages or company accounts. */
final class TerritorialIndicators
{
    public static function bound(float $v, float $low = 0, float $high = 1): float { return min($high, max($low, $v)); }
    public static function share(array $settings): float
    {
        return match ($settings['institutions.development_ownership']['production'] ?? 'mixed') {
            'private' => 0.0, 'public' => 1.0, 'mixed' => .5,
            default => throw new \DomainException('Unknown ownership arrangement.'),
        };
    }

    public static function opening(array $territories, array $settings, array $r): array
    {
        $tax = (float) Q::parse($settings['finance.income_tax']['taxable_income'] ?? '0');
        if ($tax > 1) throw new \DomainException('Tax exceeds one.');
        $income = $receipts = '0.000000';
        foreach ($territories as &$t) {
            $s = IndicatorRules::state($t['economy']); $h = $r['hypothesis'];
            $target = self::bound($h['informal_tax'] * $tax * (1 + (float) $s['crime'])
                + (float) $s['unrest'] * ($h['informal_unrest_base'] + (float) $s['crime']), 0, $r['assessment']['informal_ceiling']);
            $rate = $r['rates'][$target > (float) $s['informal'] ? 'avoidance_rise' : 'avoidance_recovery'];
            $s['informal'] = Q::calculated((float) $s['informal'] + $rate * ($target - (float) $s['informal']));
            $t['economy'] = $s;
            $base = Q::output($t['population'], Q::calculated($r['reference_income_per_million']));
            $earned = Q::mul($base, $s['economic_strength']);
            $income = Q::add($income, $earned);
            $t['income'] = $earned;
            $t['tax'] = Q::mul(Q::mul($earned, Q::calculated($tax)), Q::sub('1', $s['informal']));
            $receipts = Q::add($receipts, $t['tax']);
        }
        unset($t);
        return ['territories' => $territories, 'income' => $income, 'taxes' => $receipts];
    }

    public static function assess(array $territories, array $settings, array $r): array
    {
        $public = self::share($settings); $h = $r['hypothesis']; $costs = $r['costs_per_million'];
        $serviceShare = $h['public_service_floor_share'] + (1 - $h['public_service_floor_share']) * $public;
        // Optional authored standards override the game's base assessment coefficients.
        $infraTarget = (float) ($settings['budget.program_target']['infrastructure'] ?? $h['public_infrastructure_target']);
        $maintenanceCost = (float) ($settings['budget.program_cost']['infrastructure_maintenance'] ?? $costs['infrastructure_upkeep']);
        $developmentCost = (float) ($settings['budget.program_cost']['infrastructure_development'] ?? $costs['infrastructure_point']);
        if ($developmentCost <= 0 && $infraTarget > 0) throw new \DomainException('An infrastructure development target requires a positive construction cost.');
        $programs = array_fill_keys(['health','education','police','welfare','environment','public_development'], '0.000000');
        $infrastructure = []; $privateProvision = $privateConstruction = '0.000000';
        foreach ($territories as $id => $t) {
            $s = $t['economy']; $people = $t['population'] / 1000000; $scale = $r['assessment']['program_cost_floor'] + $r['assessment']['program_cost_economic'] * (float) $s['economic_strength'];
            foreach ($programs as $key => $_) {
                $amount = $people * $costs[$key] * ($key === 'public_development' ? $public : $scale);
                if (in_array($key, ['health','education'], true)) {
                    $privateProvision = Q::add($privateProvision, Q::calculated($amount * (1 - $serviceShare)));
                    $amount *= $serviceShare;
                }
                $fund = $settings['budget.program_funding'][$key] ?? '0';
                $programs[$key] = Q::add($programs[$key], Q::mul(Q::calculated($amount), Q::parse($fund)));
            }
            $maintenance = $people * $maintenanceCost * (float) $s['infrastructure'];
            $publicStep = min($r['rates']['infrastructure_growth'], max(0, $infraTarget - (float) $s['infrastructure']));
            $privateTarget = self::bound($h['private_infrastructure_floor'] + $h['private_infrastructure_dynamism'] * (float) $s['dynamism']);
            $privateStep = min($r['rates']['infrastructure_growth'] * (float) $s['dynamism'], max(0, $privateTarget - (float) $s['infrastructure']));
            $privateProvision = Q::add($privateProvision, Q::calculated($maintenance * (1 - $public)));
            $privateBuild = Q::calculated($people * $costs['infrastructure_point'] * $privateStep * (1 - $public));
            $privateConstruction = Q::add($privateConstruction, $privateBuild);
            $infra = $settings['budget.program_funding']['infrastructure'] ?? '0';
            $infrastructure[$id] = ['target' => Q::calculated($infraTarget), 'funding_ratio' => Q::parse($infra),
                'maintenance' => Q::calculated($maintenance * $public),
                'improvement' => Q::calculated($people * $developmentCost * $publicStep * $public),
                'maintenance_requested' => Q::mul(Q::calculated($maintenance * $public), Q::parse($infra)),
                'improvement_requested' => Q::mul(Q::calculated($people * $developmentCost * $publicStep * $public), Q::parse($infra)),
                'private_requested' => $privateBuild, 'public_step' => $publicStep, 'private_step' => $privateStep];
        }
        return ['programs' => $programs, 'infrastructure' => $infrastructure, 'private_provision' => $privateProvision, 'private_construction' => $privateConstruction];
    }

    public static function closing(array $territories, array $settings, array $r, array $coverage,
        float $privateCoverage, array $infrastructure, float $shortage, string $support): array
    {
        $public = self::share($settings); $h = $r['hypothesis']; $rates = $r['rates'];
        $tax = (float) ($settings['finance.income_tax']['taxable_income'] ?? 0);
        $tolerance = $h['private_tax_tolerance'] * (1 - $public) + $h['public_tax_tolerance'] * $public;
        $serviceShare = $h['public_service_floor_share'] + (1 - $h['public_service_floor_share']) * $public;
        $population = array_sum(array_column($territories, 'population'));
        foreach ($territories as $id => &$t) {
            $s = array_map('floatval', $t['economy']);
            $hardship = self::bound(($s['inequality'] - $h['inequality_hardship_threshold']) / $h['inequality_hardship_width']);
            $services = [];
            foreach (['health','education'] as $key) $services[$key] = $serviceShare * $coverage[$key] + (1 - $serviceShare) * $privateCoverage;
            $bonus = $h['private_service_bonus'] * (1 - $public) * $s['dynamism'];
            $infra = $infrastructure[$id];
            // A lower, fully funded commitment is not a broken promise. Construction
            // toward a target takes time; only undelivered assessed work adds this penalty.
            $required = (float) $infra['maintenance'] + (float) $infra['improvement'];
            $delivery = $required > 0 ? min(1, ((float) $infra['maintenance_paid'] + (float) $infra['improvement_paid']) / $required) : 1;
            $promisePenalty = $h['unrest_infrastructure_shortfall'] * $public * (1 - $delivery);
            $targets = [
                'health' => $h['service_target_floor'] + $h['service_target_provision'] * $services['health'] + $bonus
                    - $h['health_hardship'] * $hardship - $h['health_pollution'] * (1 - $s['environment']) - $r['physical']['shortage_health'] * $shortage,
                'education' => $h['service_target_floor'] + $h['service_target_provision'] * $services['education'] + $bonus - $h['education_hardship'] * $hardship,
                'crime' => $h['crime_floor'] - $h['crime_police'] * $coverage['police'] + $h['crime_hardship'] * $hardship + $h['crime_unrest'] * $s['unrest'] + $h['crime_tax_pressure'] * max(0, $r['assessment']['crime_tax_multiplier'] * $tax - $tolerance),
                'inequality' => $h['inequality_floor'] + $h['inequality_private_dynamism'] * (1 - $public) * $s['dynamism']
                    + $h['inequality_economic'] * $s['economic_strength'] - $h['inequality_welfare'] * $coverage['welfare']
                    - ($population > 0 ? (float) $support / ($population / 1000000) * $r['physical']['support_inequality_per_million'] : 0),
                'environment' => $h['environment_floor'] - $h['environment_economic'] * $s['economic_strength']
                    - $h['environment_private_dynamism'] * (1 - $public) * $s['dynamism'] + $h['environment_protection'] * $coverage['environment'],
                'unrest' => $h['unrest_floor'] + $h['unrest_hardship'] * $hardship + $h['unrest_service_shortfall'] * (1 - min($services))
                    + $h['unrest_excess_tax'] * max(0, $tax - $tolerance) + $r['physical']['shortage_unrest'] * $shortage + $promisePenalty,
            ];
            $taxStimulus = $h['dynamism_tax_floor'] + $h['dynamism_tax_response'] * self::bound(1 - $tax / $h['private_tax_tolerance']);
            $targets['dynamism'] = ($h['dynamism_health_weight'] * $s['health'] + $h['dynamism_education_weight'] * $s['education']) * $taxStimulus * (1 - $s['crime']) * (1 - $s['unrest']);
            $w = $h['condition_weights'];
            $quality = $w['health'] * $s['health'] + $w['education'] * $s['education'] + $w['infrastructure'] * $s['infrastructure'] + $w['security'] * (1 - $s['crime']);
            $productivity = (1 - $public) * self::bound($h['private_productivity_floor'] + $h['private_productivity_dynamism'] * $s['dynamism']) + $public * $h['public_productivity'];
            $targets['economic_strength'] = $quality * $productivity * (1 - $h['unrest_economic_penalty'] * $s['unrest']);
            $momentum = (1 - $public) * $s['dynamism'] * $privateCoverage + $public * $h['public_development_momentum'] * $coverage['public_development'] * $h['public_investment_efficiency'];
            foreach ($targets as $key => $target) {
                $target = self::bound($target + (float) ($settings['indicator.target_shift'][$key] ?? 0));
                $rate = $key === 'economic_strength' ? $rates['economic'] * ($target > $s[$key] ? $momentum : 1)
                    : ($key === 'dynamism' ? $rates['dynamism'] : $rates['social']);
                $step = ($target - $s[$key]) * $rate;
                if ($key === 'economic_strength') $step = self::bound($step, -$rates['economic_max_step'], $rates['economic_max_step']);
                $t['economy'][$key] = Q::calculated(self::bound($s[$key] + $step));
            }
            $maintenance = (float) $infra['maintenance'] > 0 ? (float) $infra['maintenance_paid'] / (float) $infra['maintenance'] : 1;
            $publicConstruction = (float) $infra['improvement'] > 0 ? (float) $infra['improvement_paid'] / (float) $infra['improvement'] : 0;
            $privateConstruction = (float) $infra['private_requested'] > 0 ? (float) $infra['private_paid'] / (float) $infra['private_requested'] : 0;
            $infraValue = $s['infrastructure'] - $rates['infrastructure_decay'] * (1 - ($public * $maintenance + (1 - $public) * $privateCoverage))
                + $public * $infra['public_step'] * $publicConstruction * $h['public_investment_efficiency'] + (1 - $public) * $infra['private_step'] * $privateConstruction;
            $t['economy']['infrastructure'] = Q::calculated(self::bound($infraValue));
        }
        unset($t);
        return $territories;
    }
}

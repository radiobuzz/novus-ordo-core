#!/usr/bin/env python3
"""Fixed-population, fixed-supply indicator hypothesis. No application/DB imports.

Aggregate income is an economic measurement, not a conserved civilian cash pool.
Government taxes/spending reconcile. Physical production, goods ownership,
market prices, borrowing, population growth and military are outside this trial.
Every coefficient is an authored test assumption, not an empirical estimate.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'scripts/research/economy-indicator-trial.json'


def bound(value, low=0.0, high=1.0):
    return min(high, max(low, value))


def average(territories, key):
    population = sum(t['population'] for t in territories)
    return sum(t[key] * t['population'] for t in territories) / population


def simulate(config, scenario):
    scenario = copy.deepcopy(scenario)
    initial_policy = copy.deepcopy(scenario)
    population = config['population']
    count = config['territories']
    assert population % count == 0
    territories = [dict(config['initial'], population=population // count) for _ in range(count)]
    cash = config['opening_treasury']
    h, rates, costs = config['hypothesis'], config['rates'], config['costs_per_million']
    traces = []
    for season in range(1, config['seasons'] + 1):
        if season == scenario.get('switch_season'):
            scenario.update(scenario['changes'])
        if season == scenario.get('damage_season'):
            for t in territories:
                t['infrastructure'] *= 0.5
        share, tax = scenario['public_share'], scenario['tax']
        tolerance = h['private_tax_tolerance'] * (1 - share) + h['public_tax_tolerance'] * share
        excess_tax = max(0, tax - tolerance)
        for t in territories:
            # NO2's domestic black-market shape: tax pressure applies even when
            # high tax is politically tolerated. Crime/unrest amplify avoidance.
            # Immediate upward response prevents a low-avoidance tax-hike season;
            # slower recovery after reductions is a new hypothesis, not NO2 logic.
            target = bound(h['informal_tax'] * tax * (1 + t['crime'])
                           + t['unrest'] * (h['informal_unrest_base'] + t['crime']), 0, .85)
            response = rates['avoidance_rise'] if target > t['informal'] else rates['avoidance_recovery']
            t['informal'] += response * (target - t['informal'])
        income = sum(t['population'] / 1e6 * config['reference_income_per_million'] * t['economic'] for t in territories)
        receipts = sum(t['population'] / 1e6 * config['reference_income_per_million'] * t['economic']
                       * tax * (1 - t['informal']) for t in territories)
        public_requirement = {key: 0.0 for key in ['health', 'education', 'police', 'welfare', 'environment', 'public_development', 'infrastructure_maintenance', 'infrastructure_development']}
        private_maintenance = private_provision = private_construction = 0.0
        public_service_share = h['public_service_floor_share'] + (1 - h['public_service_floor_share']) * share
        for t in territories:
            people = t['population'] / 1e6
            service_scale = .7 + .6 * t['economic']
            for key in ['health', 'education']:
                base = people * costs[key] * service_scale
                public_requirement[key] += base * public_service_share * scenario.get(key, 1.0)
                private_provision += base * (1 - public_service_share)
            for key in ['police', 'welfare', 'environment']:
                public_requirement[key] += people * costs[key] * service_scale * scenario.get(key, 1.0)
            public_requirement['public_development'] += people * costs['public_development'] * share * scenario.get('public_development', 1.0)
            maintenance = people * costs['infrastructure_upkeep'] * t['infrastructure']
            public_requirement['infrastructure_maintenance'] += maintenance * share
            private_maintenance += maintenance * (1 - share)
            public_step = min(rates['infrastructure_growth'], max(0, h['public_infrastructure_target'] - t['infrastructure']))
            private_target = bound(h['private_infrastructure_floor'] + h['private_infrastructure_dynamism'] * t['dynamism'])
            private_step = min(rates['infrastructure_growth'] * t['dynamism'], max(0, private_target - t['infrastructure']))
            public_requirement['infrastructure_development'] += people * costs['infrastructure_point'] * public_step * share * scenario.get('public_development', 1.0)
            private_construction += people * costs['infrastructure_point'] * private_step * (1 - share)
        requested = sum(public_requirement.values())
        opening_cash = cash
        paid = min(requested, opening_cash + receipts)
        public_ratio = paid / requested if requested else 1.0
        cash = opening_cash + receipts - paid
        assert cash >= -1e-8
        assert math.isclose(cash, opening_cash + receipts - paid, abs_tol=1e-7)
        assert receipts <= income + 1e-8
        private_available = income - receipts
        private_service_need = private_maintenance + private_provision
        private_service_paid = min(private_service_need, private_available)
        private_ratio = private_service_paid / private_service_need if private_service_need else 1.0
        private_investment_budget = max(0, private_available - private_service_paid) * h['private_development_share']
        private_construction_paid = min(private_construction, private_investment_budget)
        construction_ratio = private_construction_paid / private_construction if private_construction else 1.0
        private_unallocated = private_available - private_service_paid - private_construction_paid
        assert private_unallocated >= -1e-8
        assert math.isclose(receipts + private_service_paid + private_construction_paid + private_unallocated, income, abs_tol=1e-7)
        targets = []
        momentum_values = []
        productivity_values = []
        public_infrastructure_gains = []
        for t in territories:
            hardship = bound((t['inequality'] - h['inequality_hardship_threshold']) / h['inequality_hardship_width'])
            pollution = 1 - t['environment']
            service_coverage = {key: public_service_share * scenario.get(key, 1.0) * public_ratio
                                + (1 - public_service_share) * private_ratio for key in ['health', 'education']}
            bonus = h['private_service_bonus'] * (1 - share) * t['dynamism']
            next_targets = {
                'health': bound(h['service_target_floor'] + h['service_target_provision'] * service_coverage['health'] + bonus
                                - h['health_hardship'] * hardship - h['health_pollution'] * pollution),
                'education': bound(h['service_target_floor'] + h['service_target_provision'] * service_coverage['education'] + bonus
                                   - h['education_hardship'] * hardship),
                'crime': bound(h['crime_floor'] - h['crime_police'] * scenario.get('police', 1.0) * public_ratio
                               + h['crime_hardship'] * hardship + h['crime_unrest'] * t['unrest']
                               + h['crime_tax_pressure'] * max(0, 2 * tax - tolerance)),
                'inequality': bound(h['inequality_floor'] + h['inequality_private_dynamism'] * (1 - share) * t['dynamism']
                                    + h['inequality_economic'] * t['economic'] - h['inequality_welfare'] * scenario.get('welfare', 1.0) * public_ratio),
                'environment': bound(h['environment_floor'] - h['environment_economic'] * t['economic']
                                     - h['environment_private_dynamism'] * (1 - share) * t['dynamism']
                                     + h['environment_protection'] * scenario.get('environment', 1.0) * public_ratio),
                'unrest': bound(h['unrest_floor'] + h['unrest_hardship'] * hardship
                               + h['unrest_service_shortfall'] * (1 - min(service_coverage.values())) + h['unrest_excess_tax'] * excess_tax),
            }
            tax_stimulus = h['dynamism_tax_floor'] + h['dynamism_tax_response'] * bound(1 - tax / h['private_tax_tolerance'])
            next_targets['dynamism'] = bound((h['dynamism_health_weight'] * t['health'] + h['dynamism_education_weight'] * t['education'])
                                            * tax_stimulus * (1 - t['crime']) * (1 - t['unrest']))
            weights = h['condition_weights']
            quality = sum(weights[k] * t[k] for k in ['health', 'education', 'infrastructure']) + weights['security'] * (1 - t['crime'])
            # The same productive conditions have an ownership-blended ceiling.
            # Dynamism affects attainable private output, not just development speed.
            # Public productivity and investment conversion are separate assumptions:
            # one describes output, the other progress received for money spent.
            private_productivity = bound(h['private_productivity_floor'] + h['private_productivity_dynamism'] * t['dynamism'])
            productivity = (1 - share) * private_productivity + share * h['public_productivity']
            economic_target = bound(quality * productivity * (1 - h['unrest_economic_penalty'] * t['unrest']))
            public_momentum = h['public_development_momentum'] * scenario.get('public_development', 1.0) * public_ratio * h['public_investment_efficiency']
            private_momentum = t['dynamism'] * private_ratio
            momentum = (1 - share) * private_momentum + share * public_momentum
            # Momentum controls positive development. Poor conditions can cause setbacks.
            speed = rates['economic'] * (momentum if economic_target > t['economic'] else 1.0)
            step = bound((economic_target - t['economic']) * speed, -rates['economic_max_step'], rates['economic_max_step'])
            updated = copy.deepcopy(t)
            updated['economic'] = bound(t['economic'] + step)
            for key, target in next_targets.items():
                rate = rates['dynamism'] if key == 'dynamism' else rates['social']
                updated[key] = bound(t[key] + rate * (target - t[key]))
            public_step = min(rates['infrastructure_growth'], max(0, h['public_infrastructure_target'] - t['infrastructure']))
            private_target = bound(h['private_infrastructure_floor'] + h['private_infrastructure_dynamism'] * t['dynamism'])
            private_step = min(rates['infrastructure_growth'] * t['dynamism'], max(0, private_target - t['infrastructure']))
            maintenance_coverage = share * public_ratio + (1 - share) * private_ratio
            public_gain = share * public_step * scenario.get('public_development', 1.0) * public_ratio * h['public_investment_efficiency']
            updated['infrastructure'] = bound(t['infrastructure'] - rates['infrastructure_decay'] * (1 - maintenance_coverage)
                                              + public_gain
                                              + (1 - share) * private_step * construction_ratio)
            assert updated['population'] == t['population']
            for key in config['initial']:
                assert 0 <= updated[key] <= 1 and math.isfinite(updated[key])
            targets.append(economic_target)
            momentum_values.append(momentum)
            productivity_values.append(productivity)
            public_infrastructure_gains.append(public_gain * t['population'] / population)
            t.clear()
            t.update(updated)
        assert sum(t['population'] for t in territories) == population
        traces.append({
            'season': season, 'population': population, 'income': income,
            'income_per_million': income / population * 1e6, 'tax_receipts': receipts,
            'opening_treasury': opening_cash, 'treasury': cash, 'requested_spending': requested,
            'paid_spending': paid, 'balance': receipts - paid,
            'public_funding_coverage': public_ratio, 'spending': {k: v * public_ratio for k, v in public_requirement.items()},
            'private_provision_coverage': private_ratio, 'private_construction': private_construction_paid,
            'indicators': {key: average(territories, key) for key in config['initial']},
            'economic_target': sum(targets) / count, 'momentum': sum(momentum_values) / count,
            'productivity': sum(productivity_values) / count,
            'public_infrastructure_gain': sum(public_infrastructure_gains),
        })
    last = traces[-1]
    return {'scenario': scenario['name'], 'initial_policy': initial_policy,
            'first': traces[0], 'last': last, 'minimum_treasury': min(t['treasury'] for t in traces),
            'unfunded_seasons': sum(t['public_funding_coverage'] < 1 - 1e-8 for t in traces),
            'late_income_drift': abs(last['income'] - traces[-21]['income']) / max(1, last['income']),
            'late_infrastructure_spending_drift': abs(sum(v for k, v in last['spending'].items() if k.startswith('infrastructure'))
                - sum(v for k, v in traces[-21]['spending'].items() if k.startswith('infrastructure'))),
            'trace': traces}


def verify(config, results):
    by_name = {r['scenario']: r for r in results}
    checks = []
    def check(condition, explanation):
        checks.append({'check': explanation, 'passed': bool(condition)})
    for name in ['mixed_default', 'private_default', 'public_default', 'public_high_tax']:
        r = by_name[name]
        check(r['unfunded_seasons'] == 0, f'{name}: all spending funded without credit for {config["seasons"]} seasons')
        check(r['last']['income'] > r['first']['income'], f'{name}: development raises income')
        check(r['late_income_drift'] < .002, f'{name}: final 20 seasons income drift below 0.2%')
        check(r['late_infrastructure_spending_drift'] < .01, f'{name}: infrastructure spending settles')
    check(by_name['private_no_welfare']['last']['indicators']['inequality'] > by_name['private_default']['last']['indicators']['inequality'], 'Removing welfare raises inequality')
    check(by_name['private_no_welfare']['last']['income'] < by_name['private_default']['last']['income'], 'Unmanaged inequality reduces long-term income')
    check(by_name['private_no_welfare']['first']['balance'] > by_name['private_default']['first']['balance'], 'Welfare removal offers a short-term saving')
    restored = by_name['private_welfare_restored']
    check(restored['trace'][99]['income'] < restored['last']['income'], 'Restoring welfare allows recovery')
    check(abs(restored['last']['income'] - by_name['private_default']['last']['income']) / by_name['private_default']['last']['income'] < .01, 'Benefits recover within 1% of maintained-welfare path')
    check(by_name['mixed_underfunded_services']['last']['income'] < by_name['mixed_default']['last']['income'], 'Underfunding education and health reduces income')
    check(by_name['public_no_development']['last']['income'] < by_name['public_default']['last']['income'], 'Public economy responds to funded public development')
    check(by_name['mixed_no_public_development']['trace'][79]['income'] < by_name['mixed_default']['trace'][79]['income'], 'Mixed economy develops more slowly without public investment')
    damaged = by_name['mixed_infrastructure_damage']
    check(damaged['trace'][40]['income'] < by_name['mixed_default']['trace'][40]['income'], 'Infrastructure damage lowers following-season income')
    check(abs(damaged['last']['income'] - by_name['mixed_default']['last']['income']) / by_name['mixed_default']['last']['income'] < .01, 'Infrastructure damage recovers under unchanged policy')
    check(by_name['mixed_very_low_tax']['unfunded_seasons'] > 0, 'Very low taxes cannot finance the unchanged public programme')
    ordinary, high = by_name['public_default'], by_name['public_high_tax']
    check(high['last']['indicators']['informal'] > ordinary['last']['indicators']['informal'], 'High public taxes increase the black market despite political tolerance')
    check(high['last']['indicators']['crime'] > ordinary['last']['indicators']['crime'], 'NO2-inspired tax pressure increases crime independently of tax unrest')
    check(high['last']['tax_receipts'] / high['last']['income'] < .9, 'A nominal 90% tax collects less than 90% of national income')
    check(by_name['private_high_tax']['last']['income'] < by_name['private_default']['last']['income'], 'Heavy private taxes reduce long-term prosperity')
    raised = by_name['public_tax_raised']['trace']
    check(math.isclose(raised[99]['treasury'], ordinary['trace'][99]['treasury'], abs_tol=1e-8), 'Paired tax-hike countries have identical history before the change')
    check(raised[100]['indicators']['informal'] > ordinary['trace'][100]['indicators']['informal'], 'Tax avoidance reacts in the tax-hike season')
    check(raised[100]['tax_receipts'] < raised[100]['income'] * .9 * (1 - raised[99]['indicators']['informal']), 'Tax hike cannot collect at the previous lower avoidance rate')
    low_config = copy.deepcopy(config)
    low_config['initial']['informal'] = .5
    reduced = simulate(low_config, {'name': 'avoidance_recovery', 'public_share': 1.0, 'tax': .45})
    check(reduced['first']['indicators']['informal'] < .5 and reduced['first']['indicators']['informal'] > ordinary['first']['indicators']['informal'], 'Lower taxes do not instantly eliminate inherited avoidance')
    check(by_name['private_default']['last']['income'] > ordinary['last']['income'], 'Funded private default has higher productive output than funded public default')
    check(by_name['private_low_tax']['last']['income'] > by_name['private_default']['last']['income'], 'Lower private taxes raise long-term production through dynamism')
    check(by_name['private_high_tax']['last']['productivity'] < by_name['private_default']['last']['productivity'], 'High private taxes lower productive efficiency as well as development speed')
    tax_reduced = by_name['private_tax_reduced']
    check(tax_reduced['last']['income'] > tax_reduced['trace'][99]['income'], 'Reducing heavy private taxes allows prosperity to recover')
    # Compare equal initial conditions and equal spending, changing only the
    # proposed investment conversion. Costs must not silently disappear.
    efficient_config = copy.deepcopy(config)
    efficient_config['hypothesis']['public_investment_efficiency'] = 1.0
    efficient = simulate(efficient_config, {'name': 'efficient_public', 'public_share': 1.0, 'tax': .45})
    check(math.isclose(efficient['first']['paid_spending'], ordinary['first']['paid_spending'], abs_tol=1e-8), 'Public inefficiency does not erase or invent government expenditure')
    check(ordinary['first']['public_infrastructure_gain'] < efficient['first']['public_infrastructure_gain'], 'Equal public construction spending buys less progress at lower investment efficiency')
    ordinary_build_cost = sum(t['spending']['infrastructure_development'] for t in ordinary['trace'])
    efficient_build_cost = sum(t['spending']['infrastructure_development'] for t in efficient['trace'])
    check(ordinary_build_cost > efficient_build_cost, 'Reaching the same public infrastructure target costs more at lower investment efficiency')
    check(abs(ordinary['last']['indicators']['infrastructure'] - efficient['last']['indicators']['infrastructure']) < 1e-6, 'Investment inefficiency still permits a funded public country to reach its infrastructure target')
    # Compare opening targets to isolate dynamism's direct ceiling effect,
    # before tax, crime, welfare and growth-speed responses change conditions.
    strong_config = copy.deepcopy(config); weak_config = copy.deepcopy(config)
    strong_config['initial']['dynamism'] = .8; weak_config['initial']['dynamism'] = .2
    private_policy = {'name': 'dynamism_probe', 'public_share': 0.0, 'tax': .2}
    strong = simulate(strong_config, private_policy); weak = simulate(weak_config, private_policy)
    check(strong['first']['economic_target'] > weak['first']['economic_target'], 'Dynamism directly changes the private productive ceiling under identical conditions')
    public_policy = {'name': 'public_dynamism_probe', 'public_share': 1.0, 'tax': .45}
    strong = simulate(strong_config, public_policy); weak = simulate(weak_config, public_policy)
    check(math.isclose(strong['first']['economic_target'], weak['first']['economic_target'], abs_tol=1e-8), 'Public productive ceiling does not depend on private dynamism')
    # Different territory partitioning must not manufacture aggregate income or fiscal capacity.
    repartitioned = copy.deepcopy(config); repartitioned['territories'] = 10
    split = simulate(repartitioned, config['scenarios'][0])
    check(math.isclose(split['last']['treasury'], by_name['mixed_default']['last']['treasury'], abs_tol=1e-7), 'Dividing identical territory does not change national results')
    scaled = copy.deepcopy(config); scaled['opening_treasury'] *= 2; scaled['reference_income_per_million'] *= 2
    scaled['costs_per_million'] = {k: v * 2 for k, v in config['costs_per_million'].items()}
    doubled = simulate(scaled, config['scenarios'][0])
    check(math.isclose(doubled['last']['treasury'], 2 * by_name['mixed_default']['last']['treasury'], abs_tol=1e-6), 'Changing money units does not change behaviour')
    return checks


def tax_comparisons(config):
    """Record tax tradeoffs and rejected tuning candidates, not just good cases."""
    def observation(r):
        last = r['last']
        return {'income': last['income'], 'balance': last['balance'],
                'tax_receipts': last['tax_receipts'], 'informal': last['indicators']['informal'],
                'unfunded_seasons': r['unfunded_seasons'], 'late_income_drift': r['late_income_drift']}

    tuning = []
    for coefficient in [.15, .3, .45, .6]:
        variant = copy.deepcopy(config)
        variant['hypothesis']['informal_tax'] = coefficient
        for share, tax in [(.5, .25), (0, .2), (1, .45), (1, .9), (0, .8)]:
            result = simulate(variant, {'name': 'avoidance_probe', 'public_share': share, 'tax': tax})
            tuning.append({'informal_tax_coefficient': coefficient, 'public_share': share, 'tax': tax, **observation(result)})
    sweep = []
    for share in [0, 1]:
        for tenth in range(1, 10):
            tax = tenth / 10
            result = simulate(config, {'name': 'tax_probe', 'public_share': share, 'tax': tax})
            sweep.append({'public_share': share, 'tax': tax, **observation(result)})
    founding = []
    for tax in [.25, .3, .35]:
        for income_scale, cost_scale in [(1, 1), (.8, 1), (1, 1.2), (.8, 1.2)]:
            variant = copy.deepcopy(config)
            variant['reference_income_per_million'] *= income_scale
            variant['costs_per_million'] = {k: v * cost_scale for k, v in config['costs_per_million'].items()}
            result = simulate(variant, {'name': 'founding_probe', 'public_share': .5, 'tax': tax})
            founding.append({'tax': tax, 'income_scale': income_scale, 'cost_scale': cost_scale,
                             'minimum_treasury': result['minimum_treasury'], **observation(result)})
    return {'avoidance_tuning': tuning, 'tax_sweep': sweep, 'starting_budget_probes': founding}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--include-traces', action='store_true')
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text())
    results = [simulate(config, s) for s in config['scenarios']]
    checks = verify(config, results)
    sensitivity = []
    for income_scale in [.8, 1, 1.2]:
        for cost_scale in [.8, 1, 1.2]:
            variant = copy.deepcopy(config)
            variant['reference_income_per_million'] *= income_scale
            variant['costs_per_million'] = {k: v * cost_scale for k, v in config['costs_per_million'].items()}
            r = simulate(variant, config['scenarios'][0])
            sensitivity.append({'income_scale': income_scale, 'cost_scale': cost_scale, 'unfunded_seasons': r['unfunded_seasons'],
                                'minimum_treasury': r['minimum_treasury'], 'last_balance': r['last']['balance'], 'last_income': r['last']['income']})
    comparisons = tax_comparisons(config)
    for share, moderate_tax, high_tax in [(0, .5, .8), (1, .7, .9)]:
        cases = {r['tax']: r for r in comparisons['tax_sweep'] if r['public_share'] == share}
        checks.append({'check': f'Ownership share {share}: increasing tax from {moderate_tax:.0%} to {high_tax:.0%} lowers the final budget surplus',
                       'passed': cases[high_tax]['balance'] < cases[moderate_tax]['balance']})
    payload = {'purpose': __doc__, 'config': config, 'checks': checks, 'sensitivity': sensitivity, **comparisons,
               'results': results if args.include_traces else [{k:v for k,v in r.items() if k != 'trace'} for r in results]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + '\n')
    print('Scenario | Income first -> last | Closing balance | Unfunded seasons | Inequality | Final income drift')
    for r in results:
        print(f'{r["scenario"]} | {r["first"]["income"]:.2f} -> {r["last"]["income"]:.2f} | {r["last"]["balance"]:+.2f} | {r["unfunded_seasons"]} | {r["last"]["indicators"]["inequality"]:.3f} | {r["late_income_drift"]:.3%}')
    print(f'Checks: {sum(c["passed"] for c in checks)}/{len(checks)}')
    for c in checks:
        if not c['passed']: print('FAILED:', c['check'])
    print(f'Sensitivity cases with unfunded spending: {sum(r["unfunded_seasons"] > 0 for r in sensitivity)}/{len(sensitivity)}')
    for share, name in [(0, 'private'), (1, 'public')]:
        cases = [r for r in comparisons['tax_sweep'] if r['public_share'] == share]
        best = max(cases, key=lambda r: r['balance'])
        print(f'{name}: highest final balance among sampled tax rates at {best["tax"]:.0%}; this is not a gameplay optimum')
    if not all(c['passed'] for c in checks): raise SystemExit(1)


if __name__ == '__main__':
    main()

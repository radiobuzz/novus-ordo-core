#!/usr/bin/env python3
"""Isolated, deterministic hypothesis experiment. Never reads/writes the game DB.

NO2-inspired aggregate income, target indices and recurring program requirements.
Not the NO2 runtime, an equilibrium model, or an implementation proposal accepted
in detail. Private wallets, transaction wages/profits and public sales are NOT
added to this model's income. Resource quantities constrain activity; their
capital investment is allocated from disposable civilian income, not free cash.
"""
from __future__ import annotations
import argparse
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'scripts/research/economy-baseline-parameters.json'


def bound(value, low=0.0, high=1.0):
    return min(high, max(low, value))


def load_country(fixture, resources):
    raw = json.loads((ROOT / 'tests/client/fixtures/production-accounting' / f'{fixture}.json').read_text())
    regions = []
    for t in raw['state']['territories'].values():
        region = {'population': t['population'], 'economic': .5, 'health': .75,
                  'education': .75, 'dynamism': .5, 'crime': .3,
                  'infrastructure': float(t['economy']['infrastructure']),
                  'unrest': float(t['economy']['unrest']), 'resources': {}}
        for key, definition in resources.items():
            if 'demand.population' not in definition['rules']:
                continue
            geo = t['geography']['resources'][key]
            weights = geo['terrainWeights']
            rate = sum(float(definition['rules']['production.territorial_labor']['yields'][k]) * v
                       for k, v in weights.items()) / max(sum(weights.values()), 1e-12)
            region['resources'][key] = {
                'potential': geo['capacity'],
                'installed': sum(float(pool.get(key, 0)) for pool in t['capacity'].values()),
                'yield': rate,
            }
        regions.append(region)
    return regions


def simulate(scenario, config, resources):
    """One season uses opening conditions, then changes next-season indicators/capacity."""
    regions = load_country(scenario['fixture'], resources)
    cash, debt = config['opening_treasury'], 0.0
    first_shortage = first_debt = first_underfunding = None
    trace = []
    for season in range(1, config['seasons'] + 1):
        if season == scenario.get('damage_season'):
            for t in regions:
                t['infrastructure'] *= .5
                t['unrest'] = max(t['unrest'], .3)
        population = sum(t['population'] for t in regions)
        food_rows, invested = {}, 0.0
        # Essentials share available local workers. No off-map potential or free deposits.
        available = [t['population'] / 1e6 for t in regions]
        for key, resource in sorted(resources.items(), key=lambda kv: kv[1]['rules'].get('demand.population', {}).get('priority', 999)):
            if 'demand.population' not in resource['rules']:
                continue
            need = population / 1e6 * float(resource['rules']['demand.population']['per_million'])
            remaining, produced = need, 0.0
            for i, t in enumerate(regions):
                site = t['resources'][key]
                productivity = site['yield'] * (.5 + .5 * t['infrastructure']) * (1 - .9 * t['unrest'])
                output = min(remaining, site['installed'], available[i] * productivity)
                available[i] -= output / max(productivity, 1e-12)
                produced += output
                remaining -= output
            food_rows[key] = {'need': need, 'supplied': produced, 'coverage': produced / need if need else 1.0}
        coverage = min((r['coverage'] for r in food_rows.values()), default=1.0)
        if coverage < 1 - 1e-8 and first_shortage is None:
            first_shortage = season
        # Aggregate civilian income replaces, rather than supplements, detailed income.
        # Resource output is already inside this baseline; no separate sales are added.
        income = sum(t['population'] / 1e6 * config['maximum_income_per_million'] * t['economic']
                     * (1 - config['shortage_income_penalty'] * (1 - coverage)) for t in regions)
        tax = scenario.get('tax', config['tax'])
        avg = lambda key: sum(t[key] * t['population'] for t in regions) / sum(t['population'] for t in regions)
        informal = bound(config['informal_floor'] + .9 * tax * tax + .10 * avg('crime') + .25 * avg('unrest'), 0, .85)
        receipts = income * tax * (1 - informal)
        opening = cash
        interest = debt * config['interest_rate']
        required_service = sum(t['population'] / 1e6 * config['civilian_service_cost'] * (.5 + t['economic']) for t in regions)
        required_infra = sum(t['population'] / 1e6 * config['infrastructure_service_cost'] * (.5 + t['economic']) for t in regions)
        service_choice = scenario.get('service_funding', 1.0)
        infra_choice = scenario.get('infrastructure_funding', 1.0)
        military = scenario.get('military_per_million', 0) * population / 1e6
        requests = required_service * service_choice + required_infra * infra_choice + military
        # A finite credit line; no restructuring or hidden debt forgiveness in this lab.
        credit = max(0, income * config['debt_ceiling_share'] - debt)
        borrowed = min(credit, max(0, requests + interest - opening - receipts))
        debt += borrowed
        available_cash = opening + receipts + borrowed
        interest_paid = min(interest, available_cash)
        available_cash -= interest_paid
        debt += interest - interest_paid
        paid = min(requests, available_cash)
        fraction = paid / requests if requests else 1.0
        service_delivery = service_choice * fraction
        infra_delivery = infra_choice * fraction
        if min(service_delivery, infra_delivery) < 1 - 1e-8 and first_underfunding is None:
            first_underfunding = season
        cash = available_cash - paid
        repayment = min(debt, max(0, cash - config['treasury_reserve']))
        cash -= repayment
        debt -= repayment
        if debt > 1e-8 and first_debt is None:
            first_debt = season
        assert abs(cash - (opening + receipts + borrowed - interest_paid - paid - repayment)) < 1e-7
        # Civilian resource development uses an explicit slice of after-tax income.
        # No retained-cash or owner shares simulated: this is an aggregate flow envelope.
        disposable = income - receipts
        investment_budget = disposable * config['civilian_investment_share']
        for key, flow in food_rows.items():
            definition = resources[key]['rules']['development.capacity']
            desired = flow['need'] * (1 + config['capacity_buffer'])
            missing = max(0, desired - sum(t['resources'][key]['installed'] for t in regions))
            for t in sorted(regions, key=lambda row: row['resources'][key]['yield'], reverse=True):
                site = t['resources'][key]
                cost = float(definition['capital_cost'])
                addition = min(missing, max(0, site['potential'] - site['installed']),
                               site['potential'] * float(definition['max_growth_fraction']), investment_budget / cost)
                site['installed'] += addition
                missing -= addition
                investment_budget -= addition * cost
                invested += addition * cost
                assert site['installed'] <= site['potential'] + 1e-8
        assert invested <= disposable * config['civilian_investment_share'] + 1e-7
        assert abs(receipts + invested + (disposable - invested) - income) < 1e-7
        # NO2-shaped economic and dynamism targets; deterministic adjustment replaces RNG.
        # Health/education/crime responses below are minimal lab assumptions, not recovered formulas.
        for t in regions:
            stimulus = max(0, 1 - 5 * tax + 2 * config['tax_tolerance'])
            hi, edu, dyn, infra, unrest = (t[k] for k in ('health', 'education', 'dynamism', 'infrastructure', 'unrest'))
            economic_target = max(.25, min(.5 + .5 * min(hi, .5 * hi + .5 * edu),
                (.5 * hi + .5 * edu) * .35 + stimulus * (.25 + (1 - unrest) * dyn * .20)
                + (1 - t['crime']) * .15 + infra * .25
                + config['public_ownership_orientation'] * .15) * (1 - unrest))
            dynamism_target = (hi + 2 * edu) / 3 * (.5 * .25 + (1 - config['public_ownership_orientation']) * .35 + stimulus * .40)
            infra_target = bound(config['public_infrastructure_target'] * infra_delivery
                + (1 - config['public_infrastructure_share']) * (.5 + t['economic']) * (.25 + dyn * 1.75) * stimulus)
            targets = {
                'economic': economic_target, 'dynamism': dynamism_target,
                'infrastructure': infra_target,
                'health': (.25 + .5 * service_delivery) * (.5 + .5 * coverage),
                'education': .25 + .5 * service_delivery,
                'crime': .6 - .3 * service_delivery + .2 * unrest,
                'unrest': .5 * (1 - coverage) + .3 * (1 - service_delivery) + max(0, tax - config['tax_tolerance']),
            }
            for key, target in targets.items():
                t[key] = bound(t[key] + config['adjustment_rate'] * (bound(target) - t[key]))
                assert 0 <= t[key] <= 1
            t['population'] = max(1, int(t['population'] * (1 + scenario.get('population_growth', 0) * (1 - 3 * (1 - coverage)))))
        trace.append({'season': season, 'population': population, 'income': income, 'income_per_million': income / population * 1e6,
                      'tax': receipts, 'spending': paid + interest_paid, 'net_before_financing': receipts - paid - interest_paid,
                      'treasury': cash, 'debt': debt, 'food_coverage': coverage, 'service_delivery': service_delivery,
                      'infrastructure': avg('infrastructure'), 'economic_index': avg('economic'), 'resource_investment': invested})
    return {'scenario': scenario['name'], 'first_shortage': first_shortage, 'first_debt': first_debt,
            'first_underfunding': first_underfunding, 'first': trace[0], 'last': trace[-1], 'trace': trace}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--include-traces', action='store_true')
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text())
    resources = {r['key']: r for r in json.loads((ROOT / 'database/resource-templates/foundation.json').read_text())['resources']}
    results = [simulate(s, config, resources) for s in config['scenarios']]
    # Causal checks compare otherwise identical countries, not just closing cash.
    reference = results[0]
    underfunded = next(r for r in results if r['scenario'] == 'Underfunded civilian services')
    assert underfunded['last']['income_per_million'] < reference['last']['income_per_million']
    no_infra = simulate(config['scenarios'][0] | {'infrastructure_funding': 0.0}, config, resources)
    assert no_infra['last']['infrastructure'] < reference['last']['infrastructure']
    assert no_infra['last']['income_per_million'] < reference['last']['income_per_million']
    for r in results[:2]:
        assert r['first_debt'] is None and r['first_shortage'] is None and r['first_underfunding'] is None
    for name in ['Very low tax', 'Heavy military budget']:
        assert next(r for r in results if r['scenario'] == name)['first_debt'] is not None
    for result in results:
        assert result['first']['population'] == 5_000_000
    # Unit scaling must not change behavior when all monetary coefficients scale together.
    scaled = copy.deepcopy(config)
    for key in ['opening_treasury', 'maximum_income_per_million', 'civilian_service_cost', 'infrastructure_service_cost', 'treasury_reserve']:
        scaled[key] *= 2
    scaled_resources = copy.deepcopy(resources)
    for resource in scaled_resources.values():
        if 'development.capacity' in resource['rules']:
            resource['rules']['development.capacity']['capital_cost'] = str(float(resource['rules']['development.capacity']['capital_cost']) * 2)
    replay = simulate(config['scenarios'][0], scaled, scaled_resources)
    assert abs(replay['last']['income'] - reference['last']['income'] * 2) < 1e-6
    assert abs(replay['last']['treasury'] - reference['last']['treasury'] * 2) < 1e-6
    sensitivity = []
    for income_scale in [.8, 1, 1.2]:
        for cost_scale in [.8, 1, 1.2]:
            variant = copy.deepcopy(config)
            variant['maximum_income_per_million'] *= income_scale
            variant['civilian_service_cost'] *= cost_scale
            variant['infrastructure_service_cost'] *= cost_scale
            for scenario in config['scenarios'][:2]:
                r = simulate(scenario, variant, resources)
                sensitivity.append({'scenario': scenario['name'], 'income_scale': income_scale, 'cost_scale': cost_scale,
                                    'first_debt': r['first_debt'], 'last_balance': r['last']['net_before_financing']})
    published = results if args.include_traces else [{k: v for k, v in r.items() if k != 'trace'} for r in results]
    payload = {'purpose': 'Hypothesis only; no game integration', 'config': config, 'results': published, 'sensitivity': sensitivity,
               'infrastructure_comparison': {
                   'funded_income_per_million': reference['last']['income_per_million'],
                   'unfunded_income_per_million': no_infra['last']['income_per_million'],
                   'funded_infrastructure': reference['last']['infrastructure'],
                   'unfunded_infrastructure': no_infra['last']['infrastructure']}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + '\n')
    print('Scenario | First balance | Last balance | Final debt | First food shortage')
    for r in results:
        print(f"{r['scenario']} | {r['first']['net_before_financing']:+.2f} | {r['last']['net_before_financing']:+.2f} | {r['last']['debt']:.2f} | {r['first_shortage'] or 'none'}")
    print('Checks passed: treasury reconciliation, bounded indices/capacity, income allocation, causal underfunding response and currency scaling.')
    print(f"Sensitivity cases with borrowing: {sum(r['first_debt'] is not None for r in sensitivity)}/{len(sensitivity)}")


if __name__ == '__main__':
    main()

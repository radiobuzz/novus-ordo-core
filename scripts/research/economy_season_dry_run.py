#!/usr/bin/env python3
"""Standalone accounting exercise, not game code or a calibrated macroeconomic model.

All income is an assumed, already-earned fixture flow funded by an explicit payer.
No DB, network, game models, price formation or population simulation is involved.
Run with --output to regenerate the discussion evidence; otherwise only print it.
"""

from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
import argparse
import json
from random import Random

D = Decimal
CENT = D('0.01')
ZERO = D(0)


def money(value):
    return D(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def ratio(value):
    return D(str(value))


def allocate(amount, weights, caps):
    """Capped proportional allocation, with stable largest-remainder cent rounding."""
    amount = min(money(amount), sum(caps.values(), ZERO))
    result = dict.fromkeys(caps, ZERO)
    left = amount
    while left > 0:
        eligible = [k for k in sorted(caps) if caps[k] > result[k]]
        if not eligible:
            break
        total_weight = sum((weights[k] for k in eligible), ZERO)
        active_weights = weights
        if not total_weight:
            # No preferred destination remains: use remaining eligible needs, rather than lose funds.
            active_weights = {k: caps[k] - result[k] for k in eligible}
            total_weight = sum(active_weights.values(), ZERO)
        exact = {k: left * active_weights[k] / total_weight for k in eligible}
        saturated = [k for k in eligible if exact[k] >= caps[k] - result[k]]
        if saturated:
            for k in saturated:
                used = caps[k] - result[k]
                result[k] += used
                left -= used
            continue
        floor = {k: exact[k].quantize(CENT, rounding='ROUND_DOWN') for k in eligible}
        for k in eligible:
            result[k] += floor[k]
        remaining_cents = int((left - sum(floor.values(), ZERO)) / CENT)
        for k in sorted(eligible, key=lambda k: (-(exact[k] - floor[k]), k))[:remaining_cents]:
            result[k] += CENT
        left = ZERO
    return result


class CashJournal:
    """Counterparties are audit buckets, not proposed persistent household/company tables."""
    def __init__(self, treasury, paid_income, lending_capacity):
        self.balances = {
            'treasury': money(treasury), 'income_payers': money(paid_income),
            'lenders': money(lending_capacity), 'civilians': ZERO,
            'ordinary_suppliers': ZERO, 'investment_suppliers': ZERO,
            'public_suppliers': ZERO, 'military': ZERO,
        }
        self.opening = sum(self.balances.values(), ZERO)
        self.entries = []

    def transfer(self, source, destination, amount, reason):
        amount = money(amount)
        assert 0 <= amount <= self.balances[source], (source, amount, self.balances[source])
        if amount:
            self.balances[source] -= amount
            self.balances[destination] += amount
            self.entries.append(dict(source=source, destination=destination, amount=amount, reason=reason))

    def verify(self):
        assert all(v >= 0 for v in self.balances.values())
        assert sum(self.balances.values(), ZERO) == self.opening


def base_country():
    return dict(
        treasury=money(200), debt=money(500), reserve=money(500),
        # Four already-realized seasonal receipts; never use the newly selected tax rate here.
        revenue_history=[money(2000)] * 4, credit_multiple=ratio(3),
        interest_rate=ratio('0.05'), tax_rate=ratio('0.25'), funding=ratio(1),
        priority='regional_development', credit_lock=0, default_episode=False,
        divisions=[dict(id='artillery', location='Core', upkeep=money(600)),
                   dict(id='infantry', location='Frontier', upkeep=money(400))],
        territories=[
            dict(id='Core', population=4000, earned_income=money(6000), infrastructure=ratio(80),
                 productive_capacity=ratio(12000), informal=ratio('.10'), unrest=ratio('.05')),
            dict(id='Interior', population=4000, earned_income=money(3000), infrastructure=ratio(50),
                 productive_capacity=ratio(8000), informal=ratio('.15'), unrest=ratio('.10')),
            dict(id='Frontier', population=2000, earned_income=money(1000), infrastructure=ratio(20),
                 productive_capacity=ratio(4000), informal=ratio('.20'), unrest=ratio('.15')),
        ],
    )


def resolve(country, seed='discussion', season=1):
    """Resolve assumed income and fiscal choices once; return a new state and audit report.

    Interest: opening principal, charged once. New borrowing accrues next season.
    Default: unpaid interest triggers one restructuring per continuous default episode.
    Unpaid military upkeep is reduced paid service, not a silently issued extra loan.
    Coefficients below are deliberately illustrative, not approved balance settings.
    """
    c = deepcopy(country)
    assert 0 <= c['funding'] <= 1 and 0 <= c['tax_rate'] <= 1
    assert c['treasury'] >= 0 and c['debt'] >= 0
    local = {}
    history_average = sum(c['revenue_history'], ZERO) / len(c['revenue_history']) if c['revenue_history'] else ZERO
    credit_limit = money(c['credit_multiple'] * history_average)
    headroom = ZERO if c['credit_lock'] else max(ZERO, credit_limit - c['debt'])
    gross = sum((t['earned_income'] for t in c['territories']), ZERO)
    journal = CashJournal(c['treasury'], gross, headroom)
    journal.transfer('income_payers', 'civilians', gross, 'assumed settled seasonal income; not a GDP-to-cash conversion')

    for t in sorted(c['territories'], key=lambda t: t['id']):
        assert 0 <= t['informal'] <= 1 and 0 <= t['unrest'] <= 1 and 0 <= t['infrastructure'] <= 100
        assert t['population'] >= 0 and t['earned_income'] >= 0
        hidden = money(t['earned_income'] * t['informal'])
        taxable = t['earned_income'] - hidden
        tax = money(taxable * c['tax_rate'])
        disposable = t['earned_income'] - tax
        needs = money(ratio('.4') * t['population'])
        consumption = min(disposable, needs)
        surplus = disposable - consumption
        investment = min(money(surplus * ratio('.2')), money(t['productive_capacity'] * ratio('.02') * 10))
        cost_per_point = ratio(t['population']) / 100
        maintenance = money(t['infrastructure'] * ratio(t['population']) / 10000)
        improvement_cap = money(min(ratio(2), 100 - t['infrastructure']) * cost_per_point)
        local[t['id']] = dict(gross=t['earned_income'], informal_income=hidden, taxable=taxable,
            tax=tax, consumption=consumption, unmet_needs=needs - consumption,
            domestic_investment=investment, civilian_saving=surplus - investment,
            maintenance_need=maintenance, improvement_cap=improvement_cap,
            cost_per_point=cost_per_point)
        journal.transfer('civilians', 'treasury', tax, 'tax:' + t['id'])
        journal.transfer('civilians', 'ordinary_suppliers', consumption, 'consumption:' + t['id'])
        journal.transfer('civilians', 'investment_suppliers', investment, 'local investment:' + t['id'])

    taxes = sum((r['tax'] for r in local.values()), ZERO)
    interest_due = money(c['debt'] * c['interest_rate'])
    military_due = sum((d['upkeep'] for d in c['divisions']), ZERO)
    program_requirement = sum((r['maintenance_need'] + r['improvement_cap'] for r in local.values()), ZERO)
    program_request = money(program_requirement * c['funding'])
    total_request = interest_due + military_due + program_request
    available_before_loans = c['treasury'] + taxes
    deficit = max(ZERO, total_request - available_before_loans)
    loan = min(deficit, headroom)
    journal.transfer('lenders', 'treasury', loan, 'borrowing; creates debt, not revenue')
    interest_paid = min(interest_due, journal.balances['treasury'])
    journal.transfer('treasury', 'lenders', interest_paid, 'interest on opening principal')
    military_paid = min(military_due, journal.balances['treasury'])
    journal.transfer('treasury', 'military', military_paid, 'military upkeep')
    program_available = min(program_request, journal.balances['treasury'])
    maintenance_needs = {k: r['maintenance_need'] for k, r in local.items()}
    maintenance = allocate(program_available, maintenance_needs, maintenance_needs)
    development_budget = program_available - sum(maintenance.values(), ZERO)
    improvement_caps = {k: r['improvement_cap'] for k, r in local.items()}
    weights = {}
    for t in c['territories']:
        if c['priority'] == 'population':
            weights[t['id']] = ratio(t['population'])
        elif c['priority'] == 'regional_development':
            weights[t['id']] = ratio(t['population']) * (ratio('.05') + 1 - t['infrastructure'] / 100)
        elif c['priority'] == 'economic_concentration':
            weights[t['id']] = t['earned_income']
        else:
            raise ValueError(c['priority'])
    improvements = allocate(development_budget, weights, improvement_caps)
    program_paid = sum(maintenance.values(), ZERO) + sum(improvements.values(), ZERO)
    journal.transfer('treasury', 'public_suppliers', program_paid, 'funded maintenance and improvements')
    unpaid_interest = interest_due - interest_paid
    new_default = unpaid_interest > 0 and not c['default_episode']
    principal_before_relief = c['debt'] + loan + unpaid_interest
    relief = money(principal_before_relief * ratio('.5')) if new_default else ZERO
    debt_after_relief = principal_before_relief - relief
    # A reserve is retained from available surplus; it is never itself a reason to borrow.
    repayment = min(debt_after_relief, max(ZERO, journal.balances['treasury'] - c['reserve']))
    journal.transfer('treasury', 'lenders', repayment, 'principal repayment above treasury reserve')
    c['treasury'] = journal.balances['treasury']
    c['debt'] = debt_after_relief - repayment
    c['credit_lock'] = max(4 if new_default else 0, c['credit_lock'] - 1)
    c['default_episode'] = c['default_episode'] or new_default
    # Restoration is based on sustained receipts and cured interest, not repeated write-offs.
    if c['credit_lock'] == 0 and unpaid_interest == 0 and c['debt'] <= credit_limit:
        c['default_episode'] = False

    military_fraction = military_paid / military_due if military_due else ratio(1)
    probability = ratio('.35') * (1 - military_fraction)
    desertions = []
    surviving = []
    for division in sorted(c['divisions'], key=lambda d: d['id']):
        digest = sha256(f'{seed}:{season}:{division["id"]}'.encode()).digest()
        draw = D(int.from_bytes(digest[:8], 'big')) / D(2 ** 64)
        if draw < probability:
            desertions.append(dict(division=division['id'], location=division['location'], draw=draw,
                probability=probability, news=f'{division["id"]} division at {division["location"]} deserted after unpaid upkeep.'))
        else:
            surviving.append(division)
    c['divisions'] = surviving

    for t in c['territories']:
        r = local[t['id']]
        paid_fraction = maintenance[t['id']] / r['maintenance_need'] if r['maintenance_need'] else ratio(1)
        deterioration = 1 - paid_fraction
        improvement = improvements[t['id']] / r['cost_per_point'] if r['cost_per_point'] else ZERO
        closing_infrastructure = min(ratio(100), max(ZERO, t['infrastructure'] - deterioration + improvement))
        informal_target = min(ratio('.8'), max(ZERO, (c['tax_rate'] - ratio('.2')) * ratio('1.5')))
        next_informal = t['informal'] + ratio('.25') * (informal_target - t['informal'])
        needs = r['consumption'] + r['unmet_needs']
        hardship = r['unmet_needs'] / needs if needs else ZERO
        # Disposable income already includes evasion: don't add a second generic "black market relief" bonus.
        unrest_target = min(ratio(1), hardship * ratio('.5') + max(ZERO, c['tax_rate'] - ratio('.3')) * ratio('.3'))
        next_unrest = min(ratio(1), max(ZERO, t['unrest'] + ratio('.2') * (unrest_target - t['unrest']) + (ratio('.15') if new_default else ZERO)))
        capacity_addition = r['domestic_investment'] / 10
        r.update(maintenance_paid=maintenance[t['id']], improvement_paid=improvements[t['id']],
            opening_infrastructure=t['infrastructure'], closing_infrastructure=closing_infrastructure,
            opening_capacity=t['productive_capacity'], capacity_addition=capacity_addition,
            closing_capacity=t['productive_capacity'] + capacity_addition,
            opening_informal=t['informal'], closing_informal=next_informal,
            opening_unrest=t['unrest'], closing_unrest=next_unrest)
        t.update(infrastructure=closing_infrastructure, productive_capacity=t['productive_capacity'] + capacity_addition,
            informal=next_informal, unrest=next_unrest)

    c['revenue_history'] = (c['revenue_history'] + [taxes])[-4:]
    projected_gap = max(ZERO, total_request - taxes)
    # A simple stationary-budget warning, deliberately not an economic forecast.
    remaining_credit = max(ZERO, credit_limit - c['debt']) if not c['credit_lock'] else ZERO
    shortfall = total_request - interest_paid - military_paid - program_paid
    warning = 'default' if unpaid_interest else 'unfunded_budget' if shortfall else 'credit_at_risk' if projected_gap > c['treasury'] + remaining_credit else 'borrowing' if loan else 'funded'
    report = dict(season=season, gross_income=gross, tax_receipts=taxes,
        opening_cash=country['treasury'], opening_debt=country['debt'], credit_limit=credit_limit,
        borrowing_headroom=headroom, interest_due=interest_due, interest_paid=interest_paid,
        military_due=military_due, military_paid=military_paid, military_funded_fraction=military_fraction,
        infrastructure_requirement=program_requirement, infrastructure_requested=program_request,
        infrastructure_paid=program_paid, borrowing=loan, principal_repayment=repayment,
        interest_arrears=unpaid_interest, debt_relief=relief, new_default=new_default,
        closing_cash=c['treasury'], closing_debt=c['debt'], credit_lock=c['credit_lock'],
        remaining_credit=remaining_credit, warning=warning, budget_shortfall=shortfall,
        operating_balance=taxes - interest_due - military_due - program_request,
        probability_per_division=probability, desertions=desertions, local=local,
        cash_journal=journal.entries, closing_cash_accounts=journal.balances)

    # Accounting and physical boundaries, checked for every scenario and every repeated season.
    assert c['treasury'] == country['treasury'] + taxes + loan - interest_paid - military_paid - program_paid - repayment
    assert c['debt'] == country['debt'] + loan + unpaid_interest - relief - repayment
    assert not (loan > 0 and repayment > 0)
    assert interest_paid <= interest_due and military_paid <= military_due and program_paid <= program_request
    assert not military_paid or interest_paid == interest_due
    assert not program_paid or military_paid == military_due
    assert sum(maintenance.values(), ZERO) == min(program_paid, sum(maintenance_needs.values(), ZERO))
    assert all(r['improvement_paid'] == 0 for r in local.values()) if sum(maintenance.values(), ZERO) < sum(maintenance_needs.values(), ZERO) else True
    assert taxes == sum((r['tax'] for r in local.values()), ZERO)
    for r in local.values():
        assert r['gross'] == r['tax'] + r['consumption'] + r['domestic_investment'] + r['civilian_saving']
        assert r['informal_income'] + r['taxable'] == r['gross']
        assert 0 <= r['closing_infrastructure'] <= 100
        assert r['closing_capacity'] >= r['opening_capacity']
    assert not desertions or military_paid < military_due
    journal.verify()
    return c, report


def tax_response_experiment():
    """Fixed real income: isolate delayed evasion and reveal same-season tax-toggle exploits."""
    gross = ratio(10000)
    results = []
    for high in ['0.50', '0.75', '1.00']:
        totals = {}
        for timing in ['opening_share', 'adjust_before_collection', 'faster_evasion_slower_return']:
            schedules = {}
            for schedule in ['steady_low', 'steady_high', 'alternating']:
                informal = ratio('.1'); collected = ZERO; last = []
                for season in range(1, 81):
                    tax = ratio('.25') if schedule == 'steady_low' or (schedule == 'alternating' and season % 2 == 0) else ratio(high)
                    target = min(ratio('.8'), max(ZERO, (tax - ratio('.2')) * ratio('1.5')))
                    adjustment = ratio('.75' if target > informal else '.1') if timing == 'faster_evasion_slower_return' else ratio('.25')
                    updated = informal + adjustment * (target - informal)
                    taxable_share = informal if timing == 'opening_share' else updated
                    receipt = money(gross * (1 - taxable_share) * tax)
                    if season > 40:
                        collected += receipt
                        last.append(receipt)
                    informal = updated
                schedules[schedule] = dict(average_receipts=money(collected / 40), last_four=last[-4:])
            totals[timing] = schedules
        results.append(dict(high_rate=ratio(high), schedules=totals))
    steady_grid = []
    for percent in range(101):
        tax = ratio(percent) / 100
        target = min(ratio('.8'), max(ZERO, (tax - ratio('.2')) * ratio('1.5')))
        steady_grid.append(dict(rate=tax, receipts=money(gross * (1 - target) * tax)))
    best = max(steady_grid, key=lambda r: r['receipts'])
    # Explore simple recurring high/low schedules; this is sensitivity evidence, not a strategy-proof guarantee.
    rates = [ratio(x) for x in ['0', '.1', '.2', '.25', '.3', '.4', '.5', '.6', '.75', '1']]
    sweep = []
    for timing in ['opening_share', 'adjust_before_collection', 'faster_evasion_slower_return']:
        tested = []
        for low in rates:
            for high in rates:
                if high <= low:
                    continue
                for high_seasons, low_seasons in [(1, 1), (1, 3), (3, 1), (3, 3)]:
                    informal = ratio('.1'); receipts = ZERO
                    cycle = [high] * high_seasons + [low] * low_seasons
                    for season in range(240):
                        tax = cycle[season % len(cycle)]
                        target = min(ratio('.8'), max(ZERO, (tax - ratio('.2')) * ratio('1.5')))
                        adjustment = ratio('.75' if target > informal else '.1') if timing == 'faster_evasion_slower_return' else ratio('.25')
                        updated = informal + adjustment * (target - informal)
                        receipt = money(gross * (1 - (informal if timing == 'opening_share' else updated)) * tax)
                        if season >= 120:
                            receipts += receipt
                        informal = updated
                    tested.append(dict(low_rate=low, high_rate=high, high_seasons=high_seasons,
                        low_seasons=low_seasons, average_receipts=money(receipts / 120)))
        highest = max(tested, key=lambda r: r['average_receipts'])
        sweep.append(dict(timing=timing, schedules_tested=len(tested), best_cycle=highest,
            cycles_above_best_constant=sum(r['average_receipts'] > best['receipts'] for r in tested)))
    return dict(fixed_income=gross, paired_examples=results, best_constant_one_percent_grid=best, schedule_sweep=sweep)


def run():
    checks = []
    def check(condition, description):
        assert condition, description
        checks.append(description)

    base = base_country()
    scenarios = {}
    _, scenarios['affordable'] = resolve(base)
    check(scenarios['affordable']['closing_cash'] == money('606.50'), 'Affordable season cash reconciliation')
    check(scenarios['affordable']['closing_debt'] == 0, 'Affordable season pays down debt above reserve')
    check(scenarios['affordable']['local']['Frontier']['domestic_investment'] == 0, 'Basic needs can exhaust a poor territory surplus')

    strained = deepcopy(base)
    strained.update(treasury=money(100), debt=money(4000))
    strained['divisions'][0]['upkeep'] = money(2000)
    strained['divisions'][1]['upkeep'] = money(1500)
    _, scenarios['borrowed_budget'] = resolve(strained)
    check(scenarios['borrowed_budget']['borrowing'] == money('1668.50'), 'Borrowing funds the requested seasonal deficit')
    check(scenarios['borrowed_budget']['budget_shortfall'] == 0 and scenarios['borrowed_budget']['warning'] == 'credit_at_risk', 'Warn before actual missed payments')

    exhausted = deepcopy(strained); exhausted['debt'] = money(5900)
    _, scenarios['exhausted_credit'] = resolve(exhausted)
    check(scenarios['exhausted_credit']['borrowing'] == money(100), 'Borrowing stops at the opening credit limit')
    check(scenarios['exhausted_credit']['military_paid'] < scenarios['exhausted_credit']['military_due'], 'Army can be partially funded')
    check(scenarios['exhausted_credit']['infrastructure_paid'] == 0 and scenarios['exhausted_credit']['debt_relief'] == 0, 'Military underfunding alone is not a debt default')

    collapse = deepcopy(strained)
    collapse.update(treasury=money(10), debt=money(6000), revenue_history=[money(150)] * 4)
    for t in collapse['territories']:
        t['earned_income'] = money(t['earned_income'] * ratio('.04'))
    crisis, scenarios['bankruptcy'] = resolve(collapse)
    check(scenarios['bankruptcy']['interest_arrears'] == money('202.50'), 'Unpaid contractual interest triggers default')
    check(scenarios['bankruptcy']['closing_debt'] == money('3101.25'), 'Restructuring includes explicit arrears and halves debt once')
    check(scenarios['bankruptcy']['closing_cash'] == 0, 'Debt relief is not spendable cash')

    repeated, second_default = resolve(crisis, season=2)
    check(second_default['interest_arrears'] > 0 and second_default['debt_relief'] == 0, 'No repeated haircut every season in the same crisis')
    check(second_default['borrowing'] == 0, 'Credit remains closed during crisis')
    scenarios['continued_crisis'] = second_default

    recovery = deepcopy(crisis)
    recovery['divisions'] = [dict(id='reduced_army', location='Core', upkeep=money(500))]
    recovery['funding'] = ratio('.5')
    recovery['revenue_history'] = [money(2000)] * 4
    for t, original in zip(recovery['territories'], base['territories']):
        t['earned_income'] = original['earned_income']  # Explicit recovery assumption, not a forecast.
    trajectory = []
    for season in range(2, 6):
        recovery, report = resolve(recovery, season=season)
        trajectory.append(report)
    scenarios['recovery_trajectory'] = trajectory
    check(trajectory[-1]['closing_debt'] == 0 and trajectory[-1]['credit_lock'] == 0, 'Recovery possible under explicit income recovery and smaller army')

    priorities = {}
    for priority in ['population', 'regional_development', 'economic_concentration']:
        candidate = deepcopy(base); candidate.update(priority=priority, funding=ratio('.5'))
        _, report = resolve(candidate)
        priorities[priority] = report
    scenarios['investment_priorities'] = priorities
    check(len({r['infrastructure_paid'] for r in priorities.values()}) == 1, 'Priority cannot create additional public funds')
    check(len({sum(t['maintenance_paid'] for t in r['local'].values()) for r in priorities.values()}) == 1, 'Priority does not divert basic upkeep')
    check(priorities['regional_development']['local']['Frontier']['improvement_paid'] > priorities['population']['local']['Frontier']['improvement_paid'], 'Regional development directs more improvements toward the frontier')

    no_funding = deepcopy(base); no_funding['funding'] = ZERO
    _, report = resolve(no_funding); scenarios['zero_infrastructure_funding'] = report
    check(report['infrastructure_paid'] == 0 and all(t['improvement_paid'] == 0 for t in report['local'].values()), 'Zero public funding grants no new infrastructure')
    check(report['local']['Core']['closing_infrastructure'] == ratio(79), 'Unpaid maintenance gradually damages existing infrastructure')
    check(report['local']['Core']['domestic_investment'] > 0, 'Zero public funding does not erase the civilian economy')

    high_tax = deepcopy(base); high_tax['tax_rate'] = ratio('.9')
    _, report = resolve(high_tax); scenarios['high_tax_first_season'] = report
    check(report['local']['Core']['closing_informal'] > report['local']['Core']['opening_informal'], 'High taxes push informal activity upward gradually')
    formal = deepcopy(high_tax)
    for t in formal['territories']: t['informal'] = ZERO
    _, formal_report = resolve(formal)
    check(report['tax_receipts'] < formal_report['tax_receipts'], 'Tax evasion reduces government collection')
    check(report['local']['Core']['unmet_needs'] < formal_report['local']['Core']['unmet_needs'], 'Informal income cushions household hardship through retained income')

    seeds = [resolve(exhausted, seed=str(seed))[1] for seed in range(80)]
    check(any(not r['desertions'] for r in seeds) and any(r['desertions'] for r in seeds), 'Underfunding gives a chance of desertion, not guaranteed disbanding')
    check(len({(r['closing_cash'], r['military_paid']) for r in seeds}) == 1, 'Desertion cannot refund the just-resolved budget')
    check(resolve(exhausted, seed='repeat')[1] == resolve(exhausted, seed='repeat')[1], 'Named seed repeats the same dry-run event outcome')
    reversed_order = deepcopy(exhausted)
    reversed_order['territories'].reverse(); reversed_order['divisions'].reverse()
    check(resolve(exhausted)[1] == resolve(reversed_order)[1], 'Territory and division enumeration do not change allocation or events')

    over_limit = deepcopy(base); over_limit['debt'] = money(6500)
    _, report = resolve(over_limit)
    check(report['borrowing'] == 0 and report['interest_arrears'] == 0 and report['debt_relief'] == 0, 'Falling borrowing capacity does not call in the principal automatically')
    c = deepcopy(base); c['reserve'] = money(100000)
    _, report = resolve(c)
    check(report['borrowing'] == 0 and report['principal_repayment'] == 0, 'A large desired reserve does not cause loans')
    no_population = deepcopy(base)
    for t in no_population['territories']:
        t.update(population=0, earned_income=ZERO, productive_capacity=ZERO)
    no_population.update(debt=ZERO, divisions=[], revenue_history=[])
    _, report = resolve(no_population)
    check(report['infrastructure_paid'] == 0 and report['tax_receipts'] == 0, 'Empty economy creates neither tax receipts nor phantom infrastructure spending')

    no_income = deepcopy(base)
    no_income.update(priority='economic_concentration', treasury=ZERO, reserve=ZERO, debt=ZERO, divisions=[])
    for t in no_income['territories']: t['earned_income'] = ZERO
    _, report = resolve(no_income)
    check(report['borrowing'] == report['infrastructure_paid'] == money(256), 'Zero investment weights use eligible needs rather than borrowing idle cash')

    check(sum(allocate(money(20), {'a': ratio(100), 'b': ratio(1)}, {'a': money(1), 'b': money(30)}).values()) == money(20), 'Capped allocation redistributes a saturated territory share')
    check(allocate(money(20), {'a': ZERO, 'b': ZERO}, {'a': money(10), 'b': money(30)}) == {'a': money(5), 'b': money(15)}, 'Zero preference weights have a defined fallback')
    before = deepcopy(base); resolve(base)
    check(base == before, 'A dry-run call does not mutate its input')
    check(scenarios['affordable']['tax_receipts'] == scenarios['zero_infrastructure_funding']['tax_receipts'], 'New infrastructure cannot produce same-season tax receipts recursively')

    sensitivity = []
    for interest in ['.01', '.03', '.05', '.10']:
        for multiple in [1, 3, 6]:
            candidate = deepcopy(strained)
            candidate.update(interest_rate=ratio(interest), credit_multiple=ratio(multiple))
            _, report = resolve(candidate)
            sensitivity.append({k: report[k] for k in ['interest_due', 'credit_limit', 'borrowing', 'military_paid', 'infrastructure_paid', 'warning']} | dict(interest_rate=ratio(interest), credit_multiple=multiple))
    checks.append('Accounting invariants also hold across all 12 interest/credit sensitivity combinations')
    rng = Random(927)
    for iteration in range(250):
        candidate = deepcopy(base)
        candidate.update(treasury=money(rng.randrange(0, 100000) / 100),
            debt=money(rng.randrange(0, 2000000) / 100),
            reserve=money(rng.randrange(0, 100000) / 100),
            tax_rate=ratio(rng.randrange(0, 101)) / 100,
            funding=ratio(rng.randrange(0, 101)) / 100,
            interest_rate=ratio(rng.randrange(0, 11)) / 100,
            credit_multiple=ratio(rng.randrange(0, 7)),
            revenue_history=[money(rng.randrange(0, 300000) / 100) for _ in range(4)],
            priority=rng.choice(['population', 'regional_development', 'economic_concentration']),
            credit_lock=rng.randrange(0, 5), default_episode=bool(rng.randrange(0, 2)))
        for t in candidate['territories']:
            t.update(earned_income=money(rng.randrange(0, 900000) / 100),
                infrastructure=ratio(rng.randrange(0, 101)),
                informal=ratio(rng.randrange(0, 101)) / 100,
                unrest=ratio(rng.randrange(0, 101)) / 100)
        for d in candidate['divisions']: d['upkeep'] = money(rng.randrange(0, 400000) / 100)
        resolve(candidate, seed=f'stress-{iteration}')
    checks.append('All accounting/priority/bounds invariants hold in 250 deterministic mixed-condition stress cases')
    return dict(status='discussion-only; provisional coefficients; no game integration',
        assumptions=dict(income='Exogenous, already-paid income funded by explicit income-payer cash. No endogenous demand or GDP-to-cash mechanism is demonstrated.',
            values='Money amounts rounded half-up to cents; other ratios retained as Decimal.',
            time='One season. Interest rates are seasonal, not annual.',
            recovery='Explicit restoration of assumed income plus reduced army costs; not an automatic effect of restructuring.',
            behaviour='Informality, unrest, investment conversion, credit cap, reserve, relief and desertion coefficients are illustrative.'),
        checks=checks, mixed_condition_cases=250, scenarios=scenarios, sensitivity=sensitivity, tax_response=tax_response_experiment())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', help='Optional JSON report path; no other files are changed.')
    args = parser.parse_args()
    result = run()
    encoded = json.dumps(result, indent=2, default=lambda value: format(value, 'f') if isinstance(value, Decimal) else str(value)) + '\n'
    if args.output:
        with open(args.output, 'w') as out:
            out.write(encoded)
        print(f'PASS: {len(result["checks"])} named checks, per-scenario accounting invariants, sensitivity and tax-response experiments. Wrote {args.output}')
    else:
        print(encoded, end='')

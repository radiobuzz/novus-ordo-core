import test from 'node:test';
import assert from 'node:assert/strict';
import {
    COUNTRY_IDS,
    defaultSettings,
    createState,
    advanceSeason,
    compareInvestment,
} from '../../resources/js/economy-lab/model.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const request = (report, country, activity) =>
    report.countries[country].requests.find((r) => r.activity === activity);

test('balanced baseline trades exactly 20 units and conserves copper, budgets and receipts', () => {
    const settings = defaultSettings();
    let state = createState(settings);
    for (let i = 0; i < 20; i++) state = advanceSeason(state, settings);
    for (const report of state.history) {
        close(report.price, 10);
        close(report.nextPrice, 10);
        close(report.countries.aurelia.imports, 20);
        close(report.countries.borealis.exports, 20);
        close(report.accounts.consumed, 100);
        close(report.accounts.closingStock, 0);
        close(report.accounts.spending, 1000);
        close(report.countries.aurelia.receipts, 400);
        close(report.countries.borealis.receipts, 600);
        close(report.accounts.moneyError, 0);
    }
    // Production finance is external initially, then retained producer cash pays costs.
    close(state.history[0].accounts.financing, 540);
    close(state.history[1].accounts.financing, 0);
    close(state.countries.aurelia.supplierCash, 3440);
});

test('funded military buildup competes with civilians; the price changes next season only', () => {
    const settings = defaultSettings();
    const initial = advanceSeason(createState(settings), settings);
    settings.countries.aurelia.military = 40;
    settings.countries.aurelia.militaryBudget = 600;
    const report = advanceSeason(initial, settings).history.at(-1);
    close(report.price, 10);
    close(report.fundedDemand, 120);
    close(report.accounts.consumed, 100);
    close(request(report, 'aurelia', 'military').delivered, 30);
    close(request(report, 'aurelia', 'expansion').delivered, 15);
    assert.ok(report.nextPrice > report.price);
    close(initial.history[0].settings.countries.aurelia.military, 20);
    close(initial.season, 1);
});

test('military priority reallocates the same scarce copper without increasing spending capacity', () => {
    const settings = defaultSettings();
    settings.countries.aurelia.military = 40;
    settings.countries.aurelia.militaryBudget = 600;
    settings.allocation = 'military';
    const report = advanceSeason(createState(settings), settings).history[0];
    close(request(report, 'aurelia', 'military').delivered, 40);
    close(request(report, 'aurelia', 'operations').delivered, 10);
    close(request(report, 'aurelia', 'expansion').delivered, 10);
    close(report.countries.aurelia.militarySpending, 400);
    close(report.accounts.consumed, 100);
});

test('export restrictions retain physical copper; reopening releases carried stock', () => {
    const settings = defaultSettings();
    settings.countries.borealis.exportCap = 0;
    let state = advanceSeason(createState(settings), settings);
    const embargo = state.history[0];
    close(embargo.countries.aurelia.imports, 0);
    close(embargo.countries.borealis.closingStock, 20);
    close(embargo.accessibleSupply, 80);
    assert.ok(embargo.nextPrice > embargo.price);
    settings.countries.borealis.exportCap = 100;
    state = advanceSeason(state, settings);
    assert.ok(state.history[1].countries.borealis.exports > 0);
    close(state.history[1].accounts.openingStock, 20);
    close(state.history[1].accounts.copperError, 0);
});

test('unaffordable military wishes do not bid up prices; civilians never borrow from military funds', () => {
    const settings = defaultSettings();
    settings.countries.aurelia.military = 10000;
    settings.countries.aurelia.militaryBudget = 0;
    settings.countries.aurelia.civilianBudget = 100;
    const report = advanceSeason(createState(settings), settings).history[0];
    close(request(report, 'aurelia', 'military').funded, 0);
    close(request(report, 'aurelia', 'operations').funded, 10);
    close(request(report, 'aurelia', 'expansion').funded, 0);
    assert.ok(report.nextPrice < report.price);
});

test('reverse trade works; no supply, no demand and all-zero markets stay finite', () => {
    const settings = defaultSettings();
    [settings.countries.aurelia, settings.countries.borealis] = [
        settings.countries.borealis,
        settings.countries.aurelia,
    ];
    close(advanceSeason(createState(settings), settings).history[0].countries.aurelia.exports, 20);
    for (const id of COUNTRY_IDS) settings.countries[id].capacity = 0;
    let state = createState(settings);
    for (let i = 0; i < 20; i++) state = advanceSeason(state, settings);
    close(state.history[0].accounts.consumed, 0);
    assert.ok(state.price > 0 && Number.isFinite(state.price));
    for (const id of COUNTRY_IDS) {
        for (const field of ['operations', 'expansion', 'military', 'civilianBudget', 'militaryBudget'])
            settings.countries[id][field] = 0;
    }
    const empty = advanceSeason(createState(settings), settings).history[0];
    close(empty.pressure, 0);
    close(empty.nextPrice, 10);
    close(empty.accounts.moneyError, 0);
});

test('bounded multi-season shocks never spend or deliver beyond their constraints', () => {
    let seed = 27621;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const settings = defaultSettings();
    let state = createState(settings);
    for (let season = 0; season < 200; season++) {
        settings.allocation = random() > 0.5 ? 'military' : 'proportional';
        settings.sensitivity = random() * 3;
        for (const id of COUNTRY_IDS) {
            for (const field of ['capacity', 'exportCap', 'operations', 'expansion', 'military'])
                settings.countries[id][field] = random() * 100;
            settings.countries[id].civilianBudget = random() * 1200;
            settings.countries[id].militaryBudget = random() * 1200;
        }
        const previousPrice = state.price;
        state = advanceSeason(state, settings);
        const report = state.history.at(-1);
        assert.ok(report.nextPrice <= previousPrice * 1.2 + 1e-7);
        assert.ok(report.nextPrice >= previousPrice * 0.8 - 1e-7);
        for (const id of COUNTRY_IDS) {
            const c = report.countries[id];
            assert.ok(c.closingStock >= 0 && c.closingCash >= -1e-7);
            assert.ok(c.exports <= settings.countries[id].exportCap + 1e-7);
            assert.ok(c.civilianSpending <= c.civilianBudget + 1e-7);
            assert.ok(c.militarySpending <= c.militaryBudget + 1e-7);
            for (const r of c.requests)
                assert.ok(
                    r.delivered <= r.funded + 1e-7 &&
                        r.funded <= r.wanted + 1e-7 &&
                        r.wanted <= r.need + 1e-7,
                );
        }
        close(report.accounts.moneyError, 0);
        close(report.accounts.copperError, 0);
        close(report.accounts.spending, report.accounts.receipts);
        close(report.countries.aurelia.imports, report.countries.borealis.exports);
        close(report.countries.borealis.imports, report.countries.aurelia.exports);
    }
    assert.throws(() => advanceSeason(state, settings), /200 seasons/);
    settings.basePrice = NaN;
    assert.throws(() => createState(settings), /Invalid/);
});

test('investment spends earned cash, waits for construction and keeps funded terms after edits', () => {
    const settings = defaultSettings();
    settings.countries.aurelia.military = 40;
    settings.countries.aurelia.militaryBudget = 600;
    let state = createState(settings);
    while (!state.countries.aurelia.projects.length && state.season < 12)
        state = advanceSeason(state, settings);
    const committedState = structuredClone(state);
    const report = state.history.at(-1);
    const c = report.countries.aurelia;
    assert.ok(c.investment > 0);
    close(c.newCapacity * settings.investmentCost, c.investment);
    close(c.closingCash, c.openingCash + c.financing + c.receipts - c.costs - c.investment);
    assert.ok(c.investment <= c.investableCash);
    assert.ok(c.closingCash >= c.workingReserve);
    close(c.capacity, 40);
    const project = state.countries.aurelia.projects[0];
    close(project.readySeason, report.season + 4);
    settings.investmentEnabled = false;
    settings.investmentDelay = 12;
    settings.investmentCost = 9999;
    while (state.season < project.readySeason - 1) {
        state = advanceSeason(state, settings);
        close(state.countries.aurelia.builtCapacity, 0);
        close(state.history.at(-1).accounts.investmentSpending, 0);
    }
    state = advanceSeason(state, settings);
    close(state.countries.aurelia.builtCapacity, project.capacity);
    close(state.history.at(-1).countries.aurelia.capacity, 40 + project.capacity);
    close(state.history.at(-1).countries.aurelia.completedCapacity, project.capacity);
    assert.equal(state.countries.aurelia.projects.length, 0);
    assert.deepEqual(committedState.history.at(-1), report);
    const restarted = createState(settings);
    assert.equal(restarted.countries.aurelia.projects.length, 0);
    close(restarted.countries.aurelia.builtCapacity, 0);
});

test('external operating finance cannot be reclassified as investment earnings', () => {
    const settings = defaultSettings();
    settings.investmentWindow = 1;
    settings.investmentThreshold = 0;
    settings.reserveSeasons = 0;
    settings.investmentShare = 1;
    settings.countries.aurelia.unitCost = 9.9;
    const report = advanceSeason(createState(settings), settings).history[0];
    const c = report.countries.aurelia;
    close(c.financing, 396);
    close(c.receipts, 400);
    close(c.investment, 4);
    close(c.retainedEarnings, 0);
    close(c.closingCash, 396);
    close(report.accounts.moneyError, 0);
});

test('private capacity idles below cost, preserves stock and restarts without rebuilding', () => {
    const settings = defaultSettings();
    settings.countries.aurelia.unitCost = 12;
    settings.countries.aurelia.stock = 10;
    let state = advanceSeason(createState(settings), settings);
    let c = state.history[0].countries.aurelia;
    close(c.capacity, 40);
    close(c.production, 0);
    close(c.idleCapacity, 40);
    close(c.costs, 0);
    close(c.investment, 0);
    assert.ok(c.localSales > 0, 'Previously produced stock is still saleable while idle');
    settings.countries.aurelia.unitCost = 4;
    settings.investmentEnabled = false;
    state = advanceSeason(state, settings);
    c = state.history[1].countries.aurelia;
    close(c.production, 40);
    close(c.idleCapacity, 0);
});

test('controlled stories isolate investment and expose overbuilding without requiring a crash', () => {
    const settings = defaultSettings();
    const original = structuredClone(settings);
    const comparison = compareInvestment(settings);
    assert.deepEqual(settings, original);
    const stable = comparison.stories[0].runs;
    close(stable[1].state.countries.aurelia.builtCapacity, 0);
    close(stable[1].state.price, stable[0].state.price);
    const temporary = comparison.stories[2].runs;
    assert.ok(temporary[1].state.countries.aurelia.builtCapacity > 0);
    assert.ok(temporary[1].state.history[12].countries.aurelia.projects.length > 0);
    assert.equal(temporary[1].state.history[11].settings.countries.aurelia.military, 40);
    assert.equal(temporary[1].state.history[12].settings.countries.aurelia.military, 20);
    const low = (run) => Math.min(...run.state.history.slice(12).map((r) => r.price));
    assert.ok(low(temporary[1]) < low(temporary[0]));
    for (const story of comparison.stories)
        for (const run of story.runs) {
            for (const report of run.state.history) {
                close(report.accounts.moneyError, 0);
                close(report.accounts.copperError, 0);
                close(report.countries.borealis.investment, 0);
                const c = report.countries.aurelia;
                close(c.capacity - c.production, c.idleCapacity);
                assert.ok(c.investment <= c.investableCash + 1e-7);
            }
        }
    settings.investmentThreshold = 1000;
    const cautious = compareInvestment(settings);
    for (const story of cautious.stories) close(story.runs[1].state.countries.aurelia.builtCapacity, 0);
});

test('invalid fractional construction dates and nonfinite investment controls are rejected', () => {
    const settings = defaultSettings();
    settings.investmentDelay = 1.5;
    assert.throws(() => createState(settings), /Invalid investment/);
    settings.investmentDelay = 4;
    settings.investmentCost = 0;
    assert.throws(() => createState(settings), /Invalid investment/);
    settings.investmentCost = Infinity;
    assert.throws(() => createState(settings), /Invalid investment/);
});

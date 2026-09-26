// A deliberately open, one-resource experiment. No game services or persistence.
export const COUNTRY_IDS = ['aurelia', 'borealis'];
export const ACTIVITIES = ['operations', 'expansion', 'military'];
export const MAX_SEASONS = 200;
const EPSILON = 1e-8;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function defaultSettings() {
    return {
        basePrice: 10,
        sensitivity: 1,
        maxChange: 0.2,
        allocation: 'proportional',
        investmentEnabled: true,
        investmentWindow: 3,
        investmentDelay: 4,
        investmentCost: 25,
        investmentShare: 0.35,
        investmentThreshold: 4.5,
        reserveSeasons: 2,
        countries: {
            aurelia: {
                capacity: 40,
                stock: 0,
                unitCost: 6,
                exportCap: 100,
                operations: 20,
                expansion: 20,
                military: 20,
                civilianBudget: 400,
                militaryBudget: 200,
            },
            borealis: {
                capacity: 60,
                stock: 0,
                unitCost: 5,
                exportCap: 20,
                operations: 30,
                expansion: 10,
                military: 0,
                civilianBudget: 400,
                militaryBudget: 0,
            },
        },
    };
}

export function validateSettings(settings) {
    const number = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
    if (
        !number(settings?.basePrice, 0.1, 1000) ||
        !number(settings?.sensitivity, 0, 3) ||
        !number(settings?.maxChange, 0, 1) ||
        !['proportional', 'military'].includes(settings?.allocation)
    )
        throw new RangeError('Invalid market settings.');
    if (
        typeof settings.investmentEnabled !== 'boolean' ||
        !Number.isInteger(settings.investmentWindow) ||
        !number(settings.investmentWindow, 1, 12) ||
        !Number.isInteger(settings.investmentDelay) ||
        !number(settings.investmentDelay, 1, 12) ||
        !number(settings.investmentCost, 1, 10000) ||
        !number(settings.investmentShare, 0, 1) ||
        !number(settings.investmentThreshold, 0, 10000) ||
        !number(settings.reserveSeasons, 0, 12)
    )
        throw new RangeError('Invalid investment settings.');
    for (const id of COUNTRY_IDS) {
        const country = settings.countries?.[id];
        for (const field of [
            'capacity',
            'stock',
            'unitCost',
            'exportCap',
            ...ACTIVITIES,
            'civilianBudget',
            'militaryBudget',
        ]) {
            if (!number(country?.[field], 0, field.endsWith('Budget') ? 1000000 : 10000))
                throw new RangeError(`Invalid ${id}.${field}.`);
        }
    }
    return settings;
}

export function createState(settings = defaultSettings()) {
    validateSettings(settings);
    return {
        season: 0,
        price: settings.basePrice,
        countries: Object.fromEntries(
            COUNTRY_IDS.map((id) => [
                id,
                {
                    stock: settings.countries[id].stock,
                    supplierCash: 0,
                    builtCapacity: 0,
                    projects: [],
                    retainedEarnings: 0,
                    unitMargins: [],
                },
            ]),
        ),
        history: [],
    };
}

// Fractional aggregate copper units; proportional allocation has no ordering bias.
function allocate(requests, supply, policy) {
    const result = requests.map(() => 0);
    const groups =
        policy === 'military'
            ? [
                  requests.map((r, i) => (r.activity === 'military' ? i : -1)),
                  requests.map((r, i) => (r.activity !== 'military' ? i : -1)),
              ]
            : [requests.map((_, i) => i)];
    for (const group of groups) {
        const indices = group.filter((index) => index >= 0);
        const total = sum(indices.map((index) => requests[index].quantity));
        const ratio = total > EPSILON ? Math.min(1, Math.max(0, supply) / total) : 0;
        for (const index of indices) result[index] = requests[index].quantity * ratio;
        supply -= total * ratio;
    }
    return result;
}

function requestsFor(country, price, basePrice) {
    // Operations reserve the civilian purchasing budget before optional expansion.
    const operations = Math.min(country.operations, country.civilianBudget / price);
    const expansionWanted = country.expansion * Math.min(1, basePrice / price);
    const expansion = Math.min(
        expansionWanted,
        Math.max(0, country.civilianBudget - operations * price) / price,
    );
    const military = Math.min(country.military, country.militaryBudget / price);
    return ACTIVITIES.map((activity) => ({
        activity,
        need: country[activity],
        wanted: activity === 'expansion' ? expansionWanted : country[activity],
        funded: { operations, expansion, military }[activity],
        delivered: 0,
    }));
}

export function advanceSeason(state, settings) {
    validateSettings(settings);
    if (state.season >= MAX_SEASONS) throw new RangeError('Reset after 200 seasons.');
    // A posted price is used for this entire season. Pressure sets the NEXT price.
    const price = state.price;
    const season = state.season + 1;
    const countries = {};
    for (const id of COUNTRY_IDS) {
        const config = settings.countries[id];
        const opening = state.countries[id];
        const completedCapacity = sum(
            opening.projects.filter((p) => p.readySeason <= season).map((p) => p.capacity),
        );
        const builtCapacity = opening.builtCapacity + completedCapacity;
        const capacity = config.capacity + builtCapacity;
        // Only Aurelia responds to profitability. Borealis remains the manual control.
        // Homogeneous variable costs: private capacity runs fully or idles, without demolition.
        const production = id === 'aurelia' && price < config.unitCost ? 0 : capacity;
        const available = opening.stock + production;
        const requests = requestsFor(config, price, settings.basePrice);
        const local = allocate(
            requests.map((r) => ({ activity: r.activity, quantity: r.funded })),
            available,
            settings.allocation,
        );
        requests.forEach((request, index) => {
            request.delivered = local[index];
        });
        const localSales = sum(local);
        const surplus = Math.max(0, available - localSales);
        const exportOffer = Math.min(surplus, config.exportCap);
        const costs = production * config.unitCost;
        const financing = Math.max(0, costs - opening.supplierCash);
        countries[id] = {
            id,
            requests,
            openingStock: opening.stock,
            production,
            capacity,
            builtCapacity,
            completedCapacity,
            idleCapacity: capacity - production,
            projects: opening.projects.filter((p) => p.readySeason > season),
            available,
            localSales,
            exportOffer,
            restrictedStock: surplus - exportOffer,
            imports: 0,
            exports: 0,
            costs,
            financing,
            openingCash: opening.supplierCash,
            civilianBudget: config.civilianBudget,
            militaryBudget: config.militaryBudget,
        };
    }

    // Domestic funded requests are served first; only remaining inventory is exportable.
    // With two countries, at most one has both an export offer and a foreign customer.
    for (const id of COUNTRY_IDS) {
        const buyer = countries[id];
        const seller = countries[COUNTRY_IDS.find((other) => other !== id)];
        const imports = allocate(
            buyer.requests.map((r) => ({
                activity: r.activity,
                quantity: Math.max(0, r.funded - r.delivered),
            })),
            seller.exportOffer,
            settings.allocation,
        );
        buyer.requests.forEach((request, index) => {
            request.delivered += imports[index];
        });
        buyer.imports = sum(imports);
        seller.exports += buyer.imports;
    }

    for (const id of COUNTRY_IDS) {
        const country = countries[id];
        country.consumed = sum(country.requests.map((r) => r.delivered));
        country.spending = country.consumed * price;
        country.militarySpending = country.requests.find((r) => r.activity === 'military').delivered * price;
        country.civilianSpending = country.spending - country.militarySpending;
        country.receipts = (country.localSales + country.exports) * price;
        country.importPayment = country.imports * price;
        country.exportReceipts = country.exports * price;
        country.closingStock = Math.max(
            0,
            country.available + country.imports - country.consumed - country.exports,
        );
        country.closingCash = country.openingCash + country.financing - country.costs + country.receipts;
        country.unspent = country.civilianBudget + country.militaryBudget - country.spending;
        country.margin = country.receipts - country.costs;
        const opening = state.countries[id];
        const config = settings.countries[id];
        // This is a claim on existing cash, not a second account. Outside financing
        // is excluded; cumulative operating losses must be recovered before investing.
        country.retainedEarnings = opening.retainedEarnings + country.margin;
        country.unitMargins = [
            ...opening.unitMargins,
            country.capacity > EPSILON ? country.margin / country.capacity : 0,
        ].slice(-12);
        const recent = country.unitMargins.slice(-settings.investmentWindow);
        country.expectedMargin = sum(recent) / recent.length;
        country.workingReserve = country.capacity * config.unitCost * settings.reserveSeasons;
        country.investableCash = Math.min(
            Math.max(0, country.closingCash - country.workingReserve),
            Math.max(0, country.retainedEarnings),
        );
        country.investment = 0;
        country.newCapacity = 0;
        country.investmentReason =
            id !== 'aurelia'
                ? 'manual'
                : !settings.investmentEnabled
                  ? 'off'
                  : recent.length < settings.investmentWindow
                    ? 'history'
                    : country.expectedMargin <= settings.investmentThreshold || price <= config.unitCost
                      ? 'margin'
                      : country.investableCash * settings.investmentShare <= EPSILON
                        ? 'cash'
                        : 'invested';
        if (country.investmentReason === 'invested') {
            country.investment = country.investableCash * settings.investmentShare;
            country.newCapacity = country.investment / settings.investmentCost;
            country.closingCash -= country.investment;
            country.retainedEarnings -= country.investment;
            country.projects = [
                ...country.projects,
                {
                    capacity: country.newCapacity,
                    spending: country.investment,
                    committedSeason: season,
                    readySeason: season + settings.investmentDelay,
                },
            ];
        }
        country.pendingCapacity = sum(country.projects.map((p) => p.capacity));
        country.copperError =
            country.available + country.imports - country.consumed - country.exports - country.closingStock;
    }
    const all = Object.values(countries);
    const total = (key) => sum(all.map((country) => country[key]));
    const fundedDemand = sum(all.flatMap((c) => c.requests.map((r) => r.funded)));
    const need = sum(all.flatMap((c) => c.requests.map((r) => r.need)));
    const accessibleSupply = total('available') - total('restrictedStock');
    const pressure =
        Math.max(fundedDemand, accessibleSupply) > EPSILON
            ? (fundedDemand - accessibleSupply) / Math.max(fundedDemand, accessibleSupply)
            : 0;
    const targetPrice = settings.basePrice * clamp(1 + settings.sensitivity * pressure, 0.25, 3);
    const nextPrice = clamp(targetPrice, price * (1 - settings.maxChange), price * (1 + settings.maxChange));
    const budgets = total('civilianBudget') + total('militaryBudget');
    const accounts = {
        openingCash: total('openingCash'),
        budgets,
        financing: total('financing'),
        operatingCosts: total('costs'),
        investmentSpending: total('investment'),
        returnedBudgets: total('unspent'),
        closingCash: total('closingCash'),
        spending: total('spending'),
        receipts: total('receipts'),
        openingStock: total('openingStock'),
        production: total('production'),
        consumed: total('consumed'),
        closingStock: total('closingStock'),
    };
    accounts.moneyError =
        accounts.openingCash +
        budgets +
        accounts.financing -
        accounts.operatingCosts -
        accounts.investmentSpending -
        accounts.returnedBudgets -
        accounts.closingCash;
    accounts.copperError =
        accounts.openingStock + accounts.production - accounts.consumed - accounts.closingStock;
    accounts.settlementError = accounts.spending - accounts.receipts;
    if (
        [
            accounts.moneyError,
            accounts.copperError,
            accounts.settlementError,
            ...all.map((c) => c.copperError),
        ].some((error) => Math.abs(error) > 0.000001)
    )
        throw new Error('Conservation check failed. Season was not committed.');
    const report = {
        season,
        price,
        nextPrice,
        targetPrice,
        pressure,
        fundedDemand,
        need,
        accessibleSupply,
        countries,
        accounts,
        settings: structuredClone(settings),
    };
    return {
        season: report.season,
        price: nextPrice,
        countries: Object.fromEntries(
            all.map((country) => [
                country.id,
                {
                    stock: country.closingStock,
                    supplierCash: country.closingCash,
                    builtCapacity: country.builtCapacity,
                    projects: country.projects,
                    retainedEarnings: country.retainedEarnings,
                    unitMargins: country.unitMargins,
                },
            ]),
        ),
        history: [...state.history, report],
    };
}

// Independent controlled stories. Never alter the interactive run or its settings.
export function compareInvestment(settings) {
    validateSettings(settings);
    const stories = ['stable', 'sustained', 'temporary'].map((story) => ({
        story,
        runs: [false, true].map((enabled) => {
            const baseline = structuredClone(settings);
            baseline.investmentEnabled = enabled;
            let state = createState(baseline);
            for (let season = 1; season <= 32; season++) {
                const current = structuredClone(baseline);
                if (story !== 'stable' && season >= 5 && (story === 'sustained' || season <= 12)) {
                    current.countries.aurelia.military = Math.max(
                        40,
                        baseline.countries.aurelia.military * 2,
                    );
                    current.countries.aurelia.militaryBudget = Math.max(
                        600,
                        baseline.countries.aurelia.militaryBudget * 2,
                    );
                }
                state = advanceSeason(state, current);
            }
            return { enabled, state };
        }),
    }));
    return { settings: structuredClone(settings), seasons: 32, buildupStart: 5, temporaryEnd: 12, stories };
}

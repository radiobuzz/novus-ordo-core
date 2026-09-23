import { axialKey, neighborCoordinates, hexDistance } from './hex.js';

const neighbors = (model, cell) =>
    neighborCoordinates(cell.q, cell.r)
        .map(({ q, r }) => model.cellById.get(axialKey(q, r)))
        .filter(Boolean);
const navigable = (cell) => cell?.terrain === 'ocean' && !cell.frozen;
const dry = (cell) => cell && !['ocean', 'lake'].includes(cell.terrain);
export const navalFinished = (naval) => ['secured', 'evacuated', 'failed'].includes(naval.phase);

export function seaApproach(model, beachId) {
    const beach = model.cellById.get(beachId);
    if (!dry(beach)) return null;
    const start = neighbors(model, beach).find(navigable);
    if (!start) return null;
    const queue = [{ cell: start, path: [start.id] }],
        seen = new Set([start.id]);
    let best = queue[0];
    for (let i = 0; i < queue.length; i++) {
        const current = queue[i];
        if (current.path.length > best.path.length) best = current;
        if (current.path.length === 5) return current.path.toReversed();
        for (const next of neighbors(model, current.cell))
            if (navigable(next) && !seen.has(next.id)) {
                seen.add(next.id);
                queue.push({ cell: next, path: [...current.path, next.id] });
            }
    }
    return best.path.toReversed();
}

export function createNaval(model, beachId = null, options = {}) {
    const front = model.cellById.get(model.army.cellId);
    const candidates = beachId
        ? [model.cellById.get(beachId)].filter(Boolean)
        : model.cells
              .filter((cell) => dry(cell) && neighbors(model, cell).some(navigable))
              .sort((a, b) => hexDistance(a, front) - hexDistance(b, front));
    let path = null,
        beach;
    for (const candidate of candidates) {
        const approach = seaApproach(model, candidate.id);
        if (approach && (approach.length >= 3 || beachId)) {
            path = approach;
            beach = candidate;
            break;
        }
    }
    if (!path)
        return {
            available: false,
            phase: 'unavailable',
            history: [],
            message:
                'No suitable ice-free ocean coast in this map. Try the full world or another coast; geography is not altered.',
        };
    const defense = Math.max(
        0,
        Math.min(100, Number.isFinite(Number(options.defense)) ? Number(options.defense) : 75),
    );
    const naval = {
        available: true,
        beachId: beach.id,
        originalOwnerId: beach.politicalOwnerId,
        path,
        index: 0,
        phase: 'ready',
        tick: 0,
        defense,
        defenseStrength: defense,
        escortEnabled: options.escortEnabled ?? true,
        transportHealth: 100,
        escortHealth: 100,
        secondWave: false,
        fuelSpent: 0,
        contacts: [],
        events: [],
        history: [],
        waves: ['1st Marine Group “Harborwatch”', '2nd Landing Group “Breakwater”'].map((name) => ({
            name,
            initial: 100,
            aboard: 100,
            ashore: 0,
            evacuated: 0,
            killed: 0,
            captured: 0,
            stranded: 0,
            morale: 90,
        })),
    };
    record(naval, ['Operation prepared: two groups embarked. No beach reconnaissance received yet.']);
    return naval;
}

function record(naval, events) {
    naval.events = events;
    const { history, ...snapshot } = naval;
    history.push(structuredClone(snapshot));
}

export function configureNaval(naval, { defense, escortEnabled }) {
    if (!naval.available || naval.tick) return false;
    if (Number.isFinite(Number(defense)))
        naval.defense = naval.defenseStrength = Math.max(0, Math.min(100, Number(defense)));
    if (typeof escortEnabled === 'boolean') naval.escortEnabled = escortEnabled;
    naval.history = [];
    record(naval, ['Scenario settings updated; this is an authoring view, not hidden intelligence.']);
    return true;
}

export function requestWithdrawal(naval) {
    if (!naval.available || navalFinished(naval) || naval.phase === 'ready') return false;
    naval.phase = 'withdrawal';
    return true;
}

export function advanceNaval(naval) {
    if (!naval.available || navalFinished(naval)) return false;
    naval.tick++;
    const events = [],
        escort = naval.escortEnabled && naval.escortHealth > 0;
    naval.fuelSpent += escort ? 3 : 2;
    const loss = (wave, field, amount) => {
        const actual = Math.min(wave[field], Math.max(0, Math.ceil(amount)));
        wave[field] -= actual;
        wave.killed += actual;
        return actual;
    };
    const shellFleet = (factor = 1) => {
        if (naval.defenseStrength <= 0) return;
        const damage = Math.ceil(naval.defenseStrength * (escort ? 0.045 : 0.1) * factor);
        naval.transportHealth = Math.max(0, naval.transportHealth - damage);
        if (escort) naval.escortHealth = Math.max(0, naval.escortHealth - Math.ceil(damage * 0.6));
        events.push(
            `Coastal fire: transport −${damage} hull. ${escort ? 'Escort screens the transport.' : 'No escort protection.'}`,
        );
        if (!naval.contacts.length)
            naval.contacts.push({
                tick: naval.tick,
                cellId: naval.beachId,
                observation:
                    'Coastal gunfire observed near the landing beach; inland defenses remain unknown.',
            });
    };
    if (naval.phase === 'ready') naval.phase = 'approach';
    if (naval.phase === 'approach') {
        naval.index = Math.min(naval.path.length - 1, naval.index + 1);
        events.push(
            `${escort ? 'Transport and escort advance' : 'Transport advances'} through ocean cells. Both troop groups remain aboard.`,
        );
        if (naval.index >= naval.path.length - 2) shellFleet();
        if (naval.index === naval.path.length - 1) {
            naval.phase = 'landing';
            events.push('Offshore staging reached. First wave will land on the next step.');
        }
    } else if (naval.phase === 'landing' || naval.phase === 'beachhead') {
        for (const [i, wave] of naval.waves.entries()) {
            if ((i === 0 || naval.secondWave) && wave.aboard) {
                wave.ashore += wave.aboard;
                wave.aboard = 0;
                events.push(`${wave.name} disembarks onto one coastal micro-cell.`);
                if (i === 1) naval.waves[0].morale = Math.min(100, naval.waves[0].morale + 12);
            }
        }
        naval.phase = 'beachhead';
        if (!naval.contacts.some((contact) => contact.observation.includes('Landing troops')))
            naval.contacts.push({
                tick: naval.tick,
                cellId: naval.beachId,
                observation:
                    naval.defenseStrength > 0
                        ? 'Landing troops report defenders at the beach. This does not reveal the whole region.'
                        : 'Landing troops report no opposition at this beach. Inland defenses remain unknown.',
            });
        const firing = naval.defenseStrength * (escort ? 0.45 : 0.9);
        const ashore = naval.waves.filter((wave) => wave.ashore > 0);
        for (const wave of ashore) {
            const casualties = loss(wave, 'ashore', (firing * 0.22) / ashore.length);
            wave.morale = Math.max(0, wave.morale - Math.ceil(firing * 0.4));
            events.push(`${wave.name}: ${casualties} killed in the exchange; morale ${wave.morale}%.`);
        }
        const pressure = naval.waves.reduce((sum, wave) => sum + wave.ashore, 0) * 0.08 + (escort ? 6 : 0);
        naval.defenseStrength = Math.max(0, naval.defenseStrength - pressure);
        shellFleet();
        if (!naval.defenseStrength && naval.waves.some((wave) => wave.ashore)) {
            naval.phase = 'secured';
            events.push(
                'Beachhead secured: local foothold only, not regional conquest. Survivors aboard have not automatically landed.',
            );
        } else if (!naval.waves.some((wave) => wave.ashore && wave.morale > 25)) {
            naval.phase = 'withdrawal';
            events.push('Landing cannot hold. Withdrawal ordered; uncommitted troops remain aboard.');
        } else events.push('Foothold contested. Reinforce, continue, or withdraw.');
    } else if (naval.phase === 'withdrawal') {
        for (const wave of naval.waves)
            if (wave.ashore) {
                const casualties = loss(wave, 'ashore', naval.defenseStrength * (escort ? 0.025 : 0.08));
                wave.aboard += wave.ashore;
                wave.ashore = 0;
                events.push(`${wave.name} re-embarks; ${casualties} killed during evacuation.`);
            }
        if (naval.index >= naval.path.length - 2) shellFleet();
        naval.index = Math.max(0, naval.index - 1);
        if (!naval.index && naval.transportHealth > 0) {
            for (const wave of naval.waves) {
                wave.evacuated += wave.aboard;
                wave.aboard = 0;
            }
            naval.phase = 'evacuated';
            events.push(
                'Survivors reach safe water. Failed or aborted operation does not mean total troop loss.',
            );
        } else events.push('Fleet withdraws along its recorded sea route.');
    }
    if (!naval.transportHealth) {
        for (const wave of naval.waves) {
            loss(wave, 'aboard', wave.aboard * (escort && naval.escortHealth > 0 ? 0.3 : 1));
            wave.evacuated += wave.aboard;
            wave.aboard = 0;
            if (naval.defenseStrength > 0) {
                const captured = Math.ceil(wave.ashore * 0.5);
                wave.captured += captured;
                wave.ashore -= captured;
            }
            wave.stranded += wave.ashore;
            wave.ashore = 0;
        }
        naval.phase = 'failed';
        events.push(
            'Transport sunk. Ledger records rescue where an escort survives, deaths aboard, and stranded/captured troops ashore.',
        );
    }
    record(naval, events);
    return true;
}

export function troopLedger(naval) {
    return Object.fromEntries(
        ['initial', 'aboard', 'ashore', 'evacuated', 'killed', 'captured', 'stranded'].map((key) => [
            key,
            naval.waves.reduce((sum, wave) => sum + wave[key], 0),
        ]),
    );
}

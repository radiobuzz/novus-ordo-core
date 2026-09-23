import { nations } from './model.js';
import { createCartography } from './cartography.js';
import { createNaturalResources } from './natural-resources.js';
import {
    createEconomy,
    recomputeEconomy,
    setFoodShare,
    setNationFoodShare,
    allocationPreview,
    advanceEconomy,
    recordOilUse,
    oilCommitments,
} from './economy.js';
import {
    createNaval,
    configureNaval,
    advanceNaval,
    requestWithdrawal,
    navalFinished,
    troopLedger,
} from './naval.js';

const number = (value) => Number(value).toLocaleString('en', { maximumFractionDigits: 1 });
export function initializeExperiments(state) {
    state.cartography = createCartography(state.model, state.atlasSettings);
    state.substrate = createNaturalResources(state.model, state.resourceSettings);
    state.economy = createEconomy(state.model, state.substrate);
    state.naval = createNaval(state.model);
    state.navalReplay = 0;
    state.selectingBeach = false;
}
const activeDistrict = (state) => {
    const selected = state.economy.districtById.get(state.selectedRegionId);
    return selected?.nationId === state.economicNation
        ? selected
        : state.economy.districts.find((district) => district.nationId === state.economicNation);
};
const selectOptions = (values, current) =>
    values
        .map(
            ([value, label]) =>
                `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`,
        )
        .join('');
const metric = (label, value) => `<div><dt>${label}</dt><dd>${number(value)}</dd></div>`;

export function renderExperiments(root, state) {
    const econPanel = root.querySelector('[data-field="economy-panel"]');
    const navalPanel = root.querySelector('[data-field="naval-panel"]');
    econPanel.hidden = !state.layers.economy || state.labFocus !== 'economy';
    navalPanel.hidden = !state.layers.naval || state.labFocus !== 'naval';
    for (const button of root.querySelectorAll('[data-inspect]')) {
        button.setAttribute('aria-pressed', String(button.dataset.inspect === state.labFocus));
        button.disabled =
            button.dataset.inspect !== 'geography' &&
            !state.layers[button.dataset.inspect === 'military' ? 'formations' : button.dataset.inspect];
    }
    if (!econPanel.hidden) {
        const district = activeDistrict(state),
            resource = state.economicResource,
            totals = state.economy.totals[state.economicNation][resource];
        const stock = state.economy.accounts[state.economicNation][resource];
        const pending = resource === 'Oil' ? state.economy.pendingOil[state.economicNation] : 0;
        const planned =
            resource === 'Oil' ? oilCommitments(state.military, state.naval)[state.economicNation] : 0;
        const last = state.economy.lastTurn?.[state.economicNation][resource];
        econPanel.innerHTML = `
            <p class="eyebrow">Economic experiment · turn ${state.economy.tick}</p><h2>Where the economy happens</h2>
            <p class="hint">Illustrative food/oil economy, not live-game values. National pooled stockpiles; no physical freight routes. All factions are visible.</p>
            <label>Economic faction<select data-economic="nation" aria-label="Economic faction">${selectOptions(
                Object.values(nations).map((nation) => [nation.id, nation.name]),
                state.economicNation,
            )}</select></label>
            <label>Economic resource<select data-economic="resource" aria-label="Economic resource">${selectOptions(
                [
                    ['Food', 'Food'],
                    ['Oil', 'Oil'],
                ],
                resource,
            )}</select></label>
            <label>Economic view<select data-economic="lens" aria-label="Economic view">${selectOptions(
                [
                    ['potential', 'Potential'],
                    ['production', 'Production'],
                    ['demand', 'Demand'],
                    ['balance', 'Balance'],
                ],
                state.economicLens,
            )}</select></label>
            <p class="hint">${state.economicLens === 'balance' ? 'Green: production minus local civilian demand; coral: deficit. Operating oil costs are separate consumer badges and ledger entries. A local deficit is not a national shortage.' : state.economicLens === 'demand' ? 'Food: purple population demand. Oil: USED consumer badges show unsettled spending; LAST shows the previous settled turn; PLAN is estimated next-step cost, not consumption. No freight routes are implied.' : 'Brighter: greater output per area within this view. F/O labels show district totals. Gray: no output.'} Click land to inspect its district.</p>
            <dl class="experiment-metrics">${metric('Potential / turn', totals.potential)}${metric('Production / turn', totals.production)}${metric('Civilian demand / turn', totals.demand)}${resource === 'Oil' ? metric('Operations awaiting settlement', pending) + metric('Next-step oil commitment (estimate)', planned) : ''}${metric('National stock', stock)}${metric('Balance before stock', totals.production - totals.demand - pending)}</dl>
            ${last ? `<p class="hint" data-field="economic-ledger">Last turn: ${number(last.opening)} opening + ${number(last.production)} produced − ${number(last.consumed)} used = ${number(last.closing)} closing. Unmet demand: ${number(last.shortage)}.</p>` : ''}
            ${
                district
                    ? `<div class="formation-detail"><h3>${district.name} district</h3>
                <dl class="experiment-metrics">${metric('Available workers', district.workforce)}${metric('Food workers', district.assigned.Food)}${metric('Oil workers', district.assigned.Oil)}${metric('Idle workers (capacity limit)', district.workforce - district.usedWorkers)}${metric(`${resource} output`, district.output[resource].production)}${metric(`${resource} local demand`, district.output[resource].demand)}</dl>
                <p class="hint">Food potential follows terrain, climate, and moisture. Oil uses a separate seeded deposit overlay. Labor limits actual output; occupation and damage reduce accessible capacity. No double-allocation of workers.</p>
                <label>Food labor share <output data-field="labor-share">${district.foodShare}%</output><input aria-label="Food labor share" data-economic="share" type="range" min="0" max="100" value="${district.foodShare}" /></label>
                <p class="hint" data-field="labor-preview">Remaining labor goes to oil; excess capacity-limited labor stays idle. Moving the slider is a preview.</p>
                <div class="command-buttons"><button type="button" data-economic-action="apply">Apply to district</button><button type="button" data-economic-action="apply-nation">Apply to faction</button></div></div>`
                    : '<p class="hint">This faction has no land districts in this crop.</p>'
            }
            <button type="button" class="secondary-button" data-economic-action="advance">Advance economy turn</button>
            <button type="button" class="secondary-button" data-economic-action="reset">Reset economy demo</button>
            <p class="hint">Actual military/naval steps accrue demo oil costs. Advancing this economy settles those costs once, plus food consumption. Shortages are reported, not yet enforced against combat. No trade, logistics, starvation, or population-growth simulation.</p>`;
    }
    if (!navalPanel.hidden) {
        if (!state.naval.available) {
            navalPanel.innerHTML = `<p class="eyebrow">Naval experiment</p><h2>No landing site</h2><p class="hint">${state.naval.message}</p>`;
            return;
        }
        const live = state.naval,
            replay = state.navalReplay < live.history.length - 1;
        const naval = replay ? live.history[state.navalReplay] : live;
        const ledger = troopLedger(naval);
        navalPanel.innerHTML = `
            <p class="eyebrow">Naval experiment · ${replay ? 'recorded replay' : 'live'} step ${naval.tick}</p><h2>Operation Breakwater</h2>
            <p class="hint">One transport, one optional escort, two 100-person groups. A defended coastal micro-cell—not an entire region—is the objective. Independent naval fixture; does not rewrite ground-demo forces or ownership.</p>
            <p class="naval-phase" data-field="naval-phase">${naval.phase.toUpperCase()} · ${naval.beachId}</p>
            <label>Coastal defense <output>${live.defense} / 100</output><input data-naval-setting="defense" aria-label="Coastal defense" type="range" min="0" max="100" value="${live.defense}" ${live.tick ? 'disabled' : ''} /></label>
            <label class="escort-option"><input data-naval-setting="escort" aria-label="Escort support" type="checkbox" ${live.escortEnabled ? 'checked' : ''} ${live.tick ? 'disabled' : ''} /> Escort support</label>
            <p class="hint">Scenario-author controls, not secret intelligence. Change before the first step. Strong defenses without an escort make withdrawal likely.</p>
            <dl class="experiment-metrics">${metric('Transport hull %', naval.transportHealth)}${metric('Escort hull %', naval.escortEnabled ? naval.escortHealth : 0)}${metric('Oil spent on recorded steps', naval.fuelSpent)}</dl>
            <div class="troop-ledger" data-field="troop-ledger">${Object.entries(ledger)
                .map(([key, value]) => `<span><strong>${value}</strong>${key}</span>`)
                .join('')}</div>
            ${naval.waves.map((wave) => `<p class="hint"><strong>${wave.name}</strong><br/>${wave.aboard} aboard · ${wave.ashore} ashore · morale ${wave.morale}%</p>`).join('')}
            <div class="command-buttons">
                <button type="button" data-naval-action="advance" ${replay || navalFinished(live) ? 'disabled' : ''}>Advance naval step</button>
                <button type="button" data-naval-action="reinforce" ${replay || !['landing', 'beachhead'].includes(live.phase) || live.secondWave ? 'disabled' : ''}>Commit second wave</button>
                <button type="button" data-naval-action="withdraw" ${replay || navalFinished(live) || live.phase === 'ready' || live.phase === 'withdrawal' ? 'disabled' : ''}>Withdraw / evacuate</button>
                <button type="button" data-naval-action="focus">Find landing operation</button>
                <button type="button" data-naval-action="beach" ${live.tick && !navalFinished(live) ? 'disabled' : ''}>Choose landing beach</button>
                <button type="button" data-naval-action="reset">Reset naval demo</button>
            </div>
            <p class="hint">Choosing a new beach resets this operation. Ships follow connected, ice-free ocean cells; lakes are excluded. Securing the beach ends this bounded test before inland expansion.</p>
            <label>Recorded naval step<input aria-label="Recorded naval step" data-naval-replay type="range" min="0" max="${live.history.length - 1}" value="${state.navalReplay}" /></label>
            <button type="button" class="secondary-button" data-naval-action="live">Return to live operation</button>
            <p class="hint">Replay is read-only: it does not advance the simulation, reroll losses, or charge oil.</p>
            <ol class="combat-log" aria-label="Naval events">${naval.events.map((event) => `<li>${event}</li>`).join('')}</ol>
            <h3>Contact reports</h3><ul class="combat-log">${naval.contacts.length ? naval.contacts.map((contact) => `<li>Step ${contact.tick}: ${contact.observation}</li>`).join('') : '<li>No contact reported yet. Inland defenses unknown.</li>'}</ul>`;
    }
}

export function installExperiments({ root, state, camera, renderer, updateInspector, fitMap }) {
    const refresh = () => {
        updateInspector();
        renderer.invalidate();
    };
    const focusNaval = () => {
        if (!state.naval.available) return;
        const beach = state.model.cellById.get(state.naval.beachId),
            start = state.model.cellById.get(state.naval.path[0]);
        camera.x = (beach.x + start.x) / 2;
        camera.y = (beach.y + start.y) / 2;
        camera.zoom = Math.max(
            camera.fitZoom,
            Math.min(camera.width, camera.height) / (state.model.cellSize * 18),
        );
        camera.constrain();
    };
    for (const type of ['economy', 'naval'])
        root.querySelector(`[data-action="${type}-demo"]`).addEventListener('click', () => {
            state.layers[type] = true;
            state.labFocus = type;
            root.querySelector(`[data-layer="${type}"]`).checked = true;
            state.view = 'terrain';
            root.querySelector('#geography-view').value = 'terrain';
            root.querySelector('#geography-view').dispatchEvent(new Event('change'));
            state.commandMode = null;
            state.orderPreview = null;
            state.armySelected = false;
            if (type === 'naval') {
                state.navalReplay = Math.max(0, state.naval.history.length - 1);
                focusNaval();
            } else fitMap();
            state.message =
                type === 'naval'
                    ? 'Landing operation ready. Tune defense/escort, then advance one recorded step at a time.'
                    : 'Choose Food or Oil and a view. Click land to inspect production and preview labor allocation.';
            if (type === 'naval' && !state.naval.available) state.message = state.naval.message;
            refresh();
        });
    for (const button of root.querySelectorAll('[data-inspect]'))
        button.addEventListener('click', () => {
            state.labFocus = button.dataset.inspect;
            state.selectingBeach = false;
            state.commandMode = null;
            state.orderPreview = null;
            refresh();
        });
    const economyPanel = root.querySelector('[data-field="economy-panel"]');
    economyPanel.addEventListener('change', (event) => {
        const type = event.target.dataset.economic;
        if (['nation', 'resource', 'lens'].includes(type)) {
            state[
                {
                    nation: 'economicNation',
                    resource: 'economicResource',
                    lens: 'economicLens',
                }[type]
            ] = event.target.value;
            refresh();
        }
    });
    economyPanel.addEventListener('input', (event) => {
        if (event.target.dataset.economic !== 'share') return;
        const share = Number(event.target.value),
            district = activeDistrict(state),
            preview = allocationPreview(district, share);
        root.querySelector('[data-field="labor-share"]').textContent = `${share}%`;
        root.querySelector('[data-field="labor-preview"]').textContent =
            `Preview only: Food ${number(preview.Food)} / turn; Oil ${number(preview.Oil)} / turn. Apply to commit.`;
    });
    economyPanel.addEventListener('click', (event) => {
        const action = event.target.closest('[data-economic-action]')?.dataset.economicAction;
        if (!action) return;
        if (action === 'advance') {
            recomputeEconomy(state.economy);
            advanceEconomy(state.economy);
            state.message =
                'Economic turn settled. National stocks and unmet demand updated; no freight movement is simulated.';
        } else if (action === 'reset') {
            state.economy = createEconomy(state.model, state.substrate);
            state.message =
                'Economy reset to demo allocations and reserves. Geography and other simulations are unchanged.';
        } else {
            const share = Number(economyPanel.querySelector('[data-economic="share"]').value);
            if (action === 'apply') setFoodShare(state.economy, activeDistrict(state).id, share);
            if (action === 'apply-nation') setNationFoodShare(state.economy, state.economicNation, share);
            state.message = 'Labor allocation applied. Production changed; no economic turn has elapsed.';
        }
        refresh();
    });
    const navalPanel = root.querySelector('[data-field="naval-panel"]');
    navalPanel.addEventListener('change', (event) => {
        if (event.target.dataset.navalSetting) {
            configureNaval(
                state.naval,
                event.target.dataset.navalSetting === 'defense'
                    ? { defense: event.target.value }
                    : { escortEnabled: event.target.checked },
            );
            refresh();
        }
    });
    // Keep the range element alive during dragging; rendering its surrounding
    // report happens on change, while map playback updates immediately on input.
    navalPanel.addEventListener('input', (event) => {
        if (!event.target.hasAttribute('data-naval-replay')) return;
        state.navalReplay = Number(event.target.value);
        renderer.invalidate();
    });
    navalPanel.addEventListener('change', (event) => {
        if (event.target.hasAttribute('data-naval-replay')) {
            refresh();
            navalPanel.querySelector('[data-naval-replay]')?.focus({ preventScroll: true });
        }
    });
    navalPanel.addEventListener('click', (event) => {
        const button = event.target.closest('[data-naval-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.navalAction,
            naval = state.naval;
        if (
            state.navalReplay < naval.history.length - 1 &&
            ['advance', 'reinforce', 'withdraw'].includes(action)
        )
            return;
        if (action === 'advance') {
            const before = naval.fuelSpent;
            advanceNaval(naval);
            recordOilUse(state.economy, 'sable', naval.fuelSpent - before, {
                id: 'landing-fleet',
                cellId: naval.path[naval.index],
                label: 'Landing fleet',
            });
            state.navalReplay = naval.history.length - 1;
            state.message = naval.events.at(-1);
        } else if (action === 'reinforce') {
            naval.secondWave = true;
            state.message = 'Second wave committed; it disembarks on the next landing step.';
        } else if (action === 'withdraw') {
            requestWithdrawal(naval);
            state.message = 'Withdrawal ordered. Advance steps to recover troops and return to safe water.';
        } else if (action === 'reset') {
            state.naval = createNaval(state.model, naval.beachId, naval);
            state.navalReplay = 0;
            state.selectingBeach = false;
            state.message = 'Landing reset. Previously incurred economic costs are not refunded.';
        } else if (action === 'live') state.navalReplay = naval.history.length - 1;
        else if (action === 'focus') focusNaval();
        else if (action === 'beach') {
            state.selectingBeach = true;
            state.message =
                'Click a land cell adjacent to ice-free ocean. This chooses a new landing scenario.';
        }
        refresh();
    });
    return {
        inspectCell(cell) {
            if (!cell || state.view !== 'terrain') return false;
            if (state.selectingBeach) {
                const replacement = createNaval(state.model, cell.id, state.naval);
                if (!replacement.available)
                    state.message =
                        'That cell is not a suitable ocean landing beach. Choose coastal land, not water, lake shore, or frozen coast.';
                else {
                    state.naval = replacement;
                    state.navalReplay = 0;
                    state.selectingBeach = false;
                    state.message = 'New beach selected. Operation reset; geography is unchanged.';
                    focusNaval();
                }
                refresh();
                return true;
            }
            if (state.labFocus === 'economy' && state.layers.economy) {
                state.selectedCellId = cell.id;
                state.selectedRegionId = cell.regionId;
                state.armySelected = false;
                const district = state.economy.districtById.get(cell.regionId);
                if (district) state.economicNation = district.nationId;
                state.message = district
                    ? `${district.name}: inspect capacity, labor, output, and demand.`
                    : 'Water has no farming or oil-extraction site in this demo.';
                refresh();
                return true;
            }
            return false;
        },
    };
}

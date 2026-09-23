import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { ImageChoice } from '../../ui/ImageChoice.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { CompactMessage } from '../../ui/CompactMessage.js';
import { unitVisual } from '../../ui/unitVisuals.js';
import { resourceIcon } from '../../ui/resourceVisuals.js';
import { deploymentDraft, remainingDeploymentMaximum } from '../../services/militaryCommands.js';

/** Feature-local composition; the editable placement draft never publishes confirmed game data. */
export function renderDeploymentBrush(owner, body) {
    const t = owner.t;
    const help = new Tooltip({
        scope: owner.viewScope,
        text: t('brushHelp'),
        label: owner.services.i18n.t('common.helpFor', { name: t('deploy') }),
    });
    body.closest('.ui-panel').querySelector('.ui-panel-actions').prepend(help.element);
    const catalogue = el('div', { class: 'world-unit-catalogue', 'aria-label': t('unitTypes') });
    const cards = new Map();
    for (const meta of owner.data.definitions.divisions) {
        const type = meta.division_type;
        const card = new ImageChoice({
            label: owner.unit(type),
            image: unitVisual(type),
            selected: owner.type === type,
        });
        card.element.dataset.unitType = type;
        card.element.dataset.focusKey = `type-${type}`;
        owner.viewScope.listen(card.element, 'click', () => {
            owner.type = type;
            owner.remember();
            update();
        });
        cards.set(type, card);
        catalogue.append(card.element);
    }
    const summary = el('span', { class: 'deployment-draft-summary', role: 'status' });
    const cost = el('div', { class: 'world-cost deployment-resource-costs' });
    const info = new Tooltip({
        scope: owner.viewScope,
        label: t('unitDetails'),
    });
    const legend = el(
        'div',
        { class: 'deployment-card-legend' },
        el('span', { text: t('badgeLegend') }),
        info.element,
    );
    const draftInfo = new Tooltip({ scope: owner.viewScope, label: t('draftDetails') });
    const validation = new CompactMessage(owner.viewScope, { className: 'deployment-draft-validation' });
    const entries = el('ul', { class: 'deployment-draft-list' });
    const placements = el('details', { class: 'deployment-placements' }, el('summary', {}, summary), entries);
    const submit = new Button({ label: t('confirmDeployment'), variant: 'primary' });
    submit.element.dataset.command = '';
    owner.controls.push(submit);
    const undo = new Button({ label: t('undo'), variant: 'quiet', icon: null });
    const clear = new Button({ label: t('clearDraft'), variant: 'quiet', icon: null });
    const changeDraft = (next) => {
        owner.deploymentEntries = next;
        owner.remember();
        update();
        owner.updateOverlay();
    };
    owner.viewScope.listen(undo.element, 'click', () => changeDraft(owner.deploymentEntries.slice(0, -1)));
    owner.viewScope.listen(clear.element, 'click', () => changeDraft([]));
    owner.viewScope.listen(submit.element, 'click', () => {
        if (!deploymentDraft(owner.data, owner.snapshot, owner.deploymentEntries).valid) return;
        const deployments = owner.deploymentEntries.map(({ division_type, territory_id }) => ({
            division_type,
            territory_id,
        }));
        void owner.command('deploy', { deployments });
    });
    // Native alternatives for touch/keyboard, without a second server-submit path.
    const alternative = el(
        'details',
        { class: 'deployment-list-placement' },
        el('summary', { text: t('placeFromList') }),
    );
    const destination = owner.destinationSelect('deploy');
    const quantity = el('input', {
        type: 'number',
        min: 1,
        max: 100,
        step: 1,
        value: owner.quantity,
        'aria-label': t('quantity'),
    });
    const add = new Button({ label: t('addPreview') });
    owner.viewScope.listen(quantity, 'input', () => {
        owner.quantity = Number(quantity.value);
        owner.remember();
    });
    owner.viewScope.listen(destination, 'change', () => {
        owner.destination = Number(destination.value) || null;
        owner.remember();
    });
    owner.viewScope.listen(add.element, 'click', () =>
        owner.stageDeployment(Number(destination.value), Number(quantity.value)),
    );
    alternative.append(
        el(
            'div',
            { class: 'deployment-list-fields' },
            owner.field(t('destination'), destination),
            owner.field(t('quantityShort'), quantity),
            add.element,
        ),
    );
    body.append(
        legend,
        catalogue,
        placements,
        el('div', { class: 'deployment-cost-summary' }, cost, draftInfo.element),
        validation.element,
        el(
            'div',
            { class: 'world-command-actions deployment-actions' },
            submit.element,
            undo.element,
            clear.element,
        ),
        alternative,
    );
    const update = () => {
        const draft = deploymentDraft(owner.data, owner.snapshot, owner.deploymentEntries);
        for (const [type, card] of cards) {
            const max = remainingDeploymentMaximum(owner.data, owner.snapshot, owner.deploymentEntries, type);
            card.setSelected(type === owner.type);
            const count = owner.deploymentEntries.filter((d) => d.division_type === type).length;
            card.setBadges([
                {
                    text: max === null ? '—' : String(max),
                    label: max === null ? t('unknownMax') : t('max', { count: max }),
                },
                { text: `◇ ${count}`, label: t('previewCount', { count }) },
            ]);
            card.setUnavailable(max === null || max === 0);
        }
        summary.textContent = t('draftSummary', {
            count: owner.deploymentEntries.length,
            territories: new Set(owner.deploymentEntries.map((d) => d.territory_id)).size,
        });
        cost.replaceChildren(
            el('span', { text: `${t('costShort')}:` }),
            ...Object.entries(draft.costs).map(([resource, value]) =>
                el(
                    'span',
                    {},
                    el('img', {
                        src: resourceIcon(resource),
                        alt: t(`resource.${resource}`),
                        width: 18,
                        height: 18,
                    }),
                    el('span', { text: value }),
                ),
            ),
            ...(Object.keys(draft.costs).length ? [] : [el('span', { text: t('none') })]),
        );
        draftInfo.setText(
            `${t('deploymentCost')}: ${owner.costs(draft.costs)}\n${t('upkeep')}: ${owner.costs(draft.upkeep)}`,
        );
        const max = remainingDeploymentMaximum(
            owner.data,
            owner.snapshot,
            owner.deploymentEntries,
            owner.type,
        );
        const meta = owner.data.definitions.divisions.find((d) => d.division_type === owner.type);
        const shortage = Object.entries(meta?.deployment_costs ?? {})
            .filter(
                ([resource, needed]) =>
                    needed > 0 &&
                    Number.isFinite(draft.remaining[resource]) &&
                    draft.remaining[resource] < needed,
            )
            .map(([resource, needed]) =>
                t('resourceShortage', {
                    resource: t(`resource.${resource}`),
                    needed,
                    available: draft.remaining[resource],
                }),
            )
            .join('\n');
        const noEligible = !owner.snapshot.ownTerritories.some((territory) => territory.can_deploy);
        const problem =
            owner.deploymentEntries.length && !draft.valid
                ? t('draftChangedShort')
                : max === null
                  ? t('unknownMax')
                  : noEligible
                    ? t('noEligibleShort')
                    : max === 0
                      ? t('limitReached')
                      : '';
        const problemDetail =
            owner.deploymentEntries.length && !draft.valid
                ? t('draftChanged')
                : noEligible
                  ? t('noEligible')
                  : max === 0
                    ? shortage || (owner.deploymentEntries.length >= 100 ? t('draftFull') : t('serverLimit'))
                    : problem;
        validation.show(problem, problemDetail);
        submit.setDisabled(!draft.valid);
        undo.setDisabled(!owner.deploymentEntries.length);
        clear.setDisabled(!owner.deploymentEntries.length);
        const groups = new Map();
        for (const d of owner.deploymentEntries) {
            const key = `${d.division_type}:${d.territory_id}`;
            const entry = groups.get(key) ?? { ...d, count: 0 };
            entry.count++;
            groups.set(key, entry);
        }
        entries.replaceChildren(
            ...[...groups.values()].map((d) =>
                el('li', {
                    text: `${d.count} × ${owner.unit(d.division_type)} · ${owner.name(d.territory_id)}`,
                }),
            ),
        );
        info.setLabel(t('unitDetailsFor', { name: owner.unit(owner.type) }));
        info.setText(
            meta
                ? [
                      owner.unit(owner.type),
                      t('sharedMax'),
                      t('unitStats', {
                          moves: meta.moves,
                          attack: meta.attack_power,
                          defense: meta.defense_power,
                      }),
                      `${t('deploymentCost')}: ${owner.costs(meta.deployment_costs)}`,
                      `${t('upkeep')}: ${owner.costs(meta.upkeep_costs)}`,
                      `${t('attackCost')}: ${owner.costs(meta.attack_costs)}`,
                      !meta.can_take_territory ? t('noCapture') : '',
                      problemDetail,
                  ]
                      .filter(Boolean)
                      .join('\n')
                : t('unknownMax'),
        );
        owner.updateDestinations(destination, 'deploy');
        owner.updateBusy();
    };
    owner.refreshDock = update;
    update();
}

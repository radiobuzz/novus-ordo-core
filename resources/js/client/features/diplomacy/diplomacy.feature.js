import { resourceName } from '../../ui/resourceVisuals.js';
import { Component } from '../../runtime/Component.js';
import { el } from '../../ui/dom.js';
import { Button } from '../../ui/Button.js';
import { FieldShell } from '../../ui/FieldShell.js';
import { confirmDialog } from '../../ui/ConfirmDialog.js';
import { relationTo, requestKey } from '../../services/diplomacy.js';
import './diplomacy.scss';

export default class Diplomacy extends Component {
    render() {
        this.t = (key, params) => this.services.i18n.t(`diplomacy.${key}`, params);
        this.comms = this.services.diplomacy;
        this.identities = [];
        this.messageNodes = new Map();
        this.nationNodes = new Map();
        this.keys = this.comms.requestKeys;
        this.selected = this.comms.other;
        this.comms.open = true;
        this.scope.own(() => {
            this.comms.open = false;
        });
        this.heading = el('h1');
        this.status = el('p', { role: 'status', class: 'diplomacy-status' });
        this.list = el('nav', { class: 'diplomacy-nations' });
        this.partner = el('h2');
        this.relation = el('p');
        this.aiHint = el('p', { class: 'ui-field-help' });
        this.back = new Button({ variant: 'quiet' });
        this.peace = new Button();
        this.alliance = new Button();
        this.cancel = new Button({ variant: 'danger' });
        this.older = new Button({ variant: 'quiet' });
        this.latest = new Button({ variant: 'quiet' });
        this.refresh = new Button({ icon: 'refresh' });
        this.review = new Button({ variant: 'quiet' });
        this.messageList = el('div', { class: 'diplomacy-messages', tabindex: 0 });
        this.text = el('textarea', { rows: 3, maxlength: 2000 });
        this.textField = new FieldShell({ control: this.text, label: '' });
        this.send = new Button({ type: 'submit', variant: 'primary' });
        this.textForm = el('form', {}, this.textField.element, this.send.element);
        this.resource = el('select');
        for (const meta of this.services.world.snapshot.nation.definitions.resources.filter(r => r.grantable))
            this.resource.append(el('option', { value: meta.resource_key }));
        this.amount = el('input', {
            type: 'number',
            min: '0.000001',
            max: '1000000000',
            step: '0.000001',
            inputmode: 'decimal',
        });
        this.resourceField = new FieldShell({ control: this.resource, label: '' });
        this.amountField = new FieldShell({ control: this.amount, label: '' });
        this.give = new Button({ type: 'submit' });
        this.grantSummary = el('summary');
        this.grantForm = el(
            'form',
            { class: 'diplomacy-grant-form' },
            this.resourceField.element,
            this.amountField.element,
            this.give.element,
        );
        this.grant = el('details', { class: 'diplomacy-grant' }, this.grantSummary, this.grantForm);
        this.detail = el(
            'section',
            { class: 'diplomacy-conversation', hidden: true },
            this.back.element,
            this.partner,
            this.relation,
            this.aiHint,
            el(
                'div',
                { class: 'ui-panel-actions' },
                this.peace.element,
                this.alliance.element,
                this.cancel.element,
            ),
            el('div', { class: 'ui-panel-actions' }, this.older.element, this.latest.element),
            this.messageList,
            this.textForm,
            this.grant,
        );
        this.layout = el('div', { class: 'diplomacy-layout' }, this.list, this.detail);
        this.element.append(
            el(
                'section',
                { class: 'diplomacy-workspace' },
                this.heading,
                el('div', { class: 'ui-panel-actions' }, this.refresh.element, this.review.element),
                this.status,
                this.layout,
            ),
        );
        this.scope.listen(this.list, 'click', (event) => {
            const button = event.target.closest('[data-nation-id]');
            if (button) this.select(Number(button.dataset.nationId));
        });
        this.scope.listen(this.back.element, 'click', () =>
            this.layout.classList.remove('diplomacy-selected'),
        );
        this.scope.listen(this.text, 'input', () => {
            if (this.selected) this.comms.draft(this.selected).text = this.text.value;
            this.updateButtons();
        });
        this.scope.listen(this.amount, 'input', () => {
            if (this.selected) this.comms.draft(this.selected).quantity = this.amount.value;
            this.updateButtons();
        });
        this.scope.listen(this.resource, 'change', () => {
            if (this.selected) this.comms.draft(this.selected).resource = this.resource.value;
            this.update();
        });
        this.scope.listen(this.textForm, 'submit', (event) => {
            event.preventDefault();
            if (!this.selected || !this.text.value.trim()) return;
            const id = this.selected,
                submitted = this.text.value;
            void this.command(
                'sendNationMessage',
                { nation_id: id, body: submitted, request_key: this.key(['text', id, submitted]) },
                () => {
                    if (this.comms.draft(id).text === submitted) this.comms.draft(id).text = '';
                    if (this.selected === id && this.text.value === submitted) this.text.value = '';
                },
            );
        });
        this.scope.listen(this.grantForm, 'submit', (event) => {
            event.preventDefault();
            if (!this.grantForm.reportValidity()) return;
            const id = this.selected,
                quantity = this.amount.value,
                resource = this.resource.value;
            void this.command(
                'proposeNationOffer',
                {
                    nation_id: id,
                    kind: 'ResourceGrant',
                    quantity,
                    resource_key: resource,
                    request_key: this.key(['grant', id, resource, quantity]),
                },
                () => {
                    if (this.comms.draft(id).quantity === quantity) this.comms.draft(id).quantity = '';
                    if (this.selected === id && this.amount.value === quantity) this.amount.value = '';
                },
            );
        });
        this.scope.listen(this.peace.element, 'click', () => this.propose('Peace'));
        this.scope.listen(this.alliance.element, 'click', () => this.propose('Alliance'));
        this.scope.listen(this.cancel.element, 'click', () => void this.cancelTreaty());
        this.scope.listen(this.messageList, 'click', (event) => {
            const button = event.target.closest('[data-offer-id]');
            if (button)
                void this.command('respondNationOffer', {
                    offer_id: Number(button.dataset.offerId),
                    action: button.dataset.action,
                });
        });
        this.scope.listen(this.older.element, 'click', () => {
            const first = this.comms.store.value.conversation?.messages[0];
            if (first) void this.comms.select(this.selected, first.id);
        });
        this.scope.listen(this.latest.element, 'click', () => void this.comms.select(this.selected));
        this.scope.listen(
            this.refresh.element,
            'click',
            () =>
                void (async () => {
                    await this.services.world.refresh();
                    await this.comms.refresh();
                })(),
        );
        this.scope.listen(this.review.element, 'click', () => {
            this.services.gameplay.acknowledgeOutcome();
            this.update();
        });
        this.services.world.store.subscribe(this.scope, () => {
            this.update();
            void this.loadIdentities();
        });
        this.comms.store.subscribe(this.scope, () => this.update());
        this.services.gameplay.changed.subscribe(this.scope, () => this.update());
        this.services.i18n.changed.subscribe(this.scope, () => {
            this.messageNodes.clear();
            this.messageList.replaceChildren();
            this.update();
        });
        if (this.selected) this.select(this.selected);
    }
    key(parts) {
        const signature = JSON.stringify(parts);
        if (!this.keys.has(signature)) this.keys.set(signature, requestKey());
        return this.keys.get(signature);
    }
    async loadIdentities() {
        const snapshot = this.services.world.snapshot;
        if (!snapshot || !this.services.world.current || this.identityRead || this.scope.closed) return;
        this.identityRead = true;
        try {
            const result = await this.services.gameplay.identities(snapshot, this.scope.signal);
            if (!this.scope.closed) {
                this.identities = result.nations;
                this.update();
            }
        } catch {
            /* Existing world status owns access/context failures; refresh retries. */
        } finally {
            this.identityRead = false;
        }
    }
    name(id) {
        return this.identities.find((row) => row.nation_id === id)?.usual_name ?? `#${id}`;
    }
    select(id) {
        this.selected = id;
        const draft = this.comms.draft(id);
        this.text.value = draft.text;
        this.amount.value = draft.quantity;
        this.resource.value = draft.resource;
        this.layout.classList.add('diplomacy-selected');
        this.messageNodes.clear();
        this.messageList.replaceChildren();
        void this.comms.select(id);
        this.update();
    }
    async command(name, body, accepted = () => {}, snapshot = this.services.world.snapshot) {
        try {
            await this.services.gameplay.command(name, body, snapshot);
            if (!this.comms.scope.closed) accepted();
            if (body.request_key)
                for (const [key, value] of this.keys) if (value === body.request_key) this.keys.delete(key);
        } catch {
            /* GameplayService owns rejected/uncertain state; preserve the submitted draft/key. */
        }
        if (!this.scope.closed) this.update();
    }
    propose(kind) {
        const relation = relationTo(this.services.world.snapshot, this.selected);
        void this.command('proposeNationOffer', {
            nation_id: this.selected,
            kind,
            basis_revision: relation.revision ?? null,
            request_key: this.key([kind, this.selected, relation.revision]),
        });
    }
    async cancelTreaty() {
        const snapshot = this.services.world.snapshot,
            id = this.selected,
            relation = relationTo(snapshot, id);
        if (
            await confirmDialog(this.scope, {
                title: this.t('cancelTreaty'),
                message: this.t('cancelConfirm', { name: this.name(id), turn: snapshot.turn_number + 5 }),
                confirmLabel: this.t('giveNotice'),
                cancelLabel: this.services.i18n.t('command.cancel'),
            })
        )
            await this.command(
                'cancelNationTreaty',
                { nation_id: id, revision: relation.revision },
                undefined,
                snapshot,
            );
    }
    update() {
        if (this.scope.closed) return;
        const snapshot = this.services.world.snapshot,
            state = this.comms.store.value;
        this.heading.textContent = this.t('title');
        this.list.setAttribute('aria-label', this.t('nations'));
        for (const [button, label] of [
            [this.back, 'back'],
            [this.peace, 'proposePeace'],
            [this.alliance, 'proposeAlliance'],
            [this.cancel, 'cancelTreaty'],
            [this.older, 'older'],
            [this.latest, 'latest'],
            [this.send, 'send'],
            [this.give, 'offerGrant'],
            [this.refresh, 'refresh'],
            [this.review, 'review'],
        ])
            button.setLabel(this.t(label));
        this.textField.label.textContent = this.t('message');
        this.resourceField.label.textContent = this.t('resource');
        this.amountField.label.textContent = this.t('amount');
        this.grantSummary.textContent = this.t('grant');
        this.messageList.setAttribute('aria-label', this.t('conversation'));
        for (const option of this.resource.options)
            option.textContent = resourceName(this.services.world.snapshot.nation, option.value, this.services.i18n);
        const enabled = snapshot?.nation?.diplomacy?.enabled;
        this.layout.hidden = !enabled;
        this.status.textContent = !enabled
            ? this.t('unavailable')
            : this.services.gameplay.notice ||
              (state.status === 'stale' ? this.t('stale') : this.t('delivery'));
        this.review.element.hidden = !this.services.gameplay.needsReview;
        if (!enabled) {
            this.messageNodes.clear();
            this.messageList.replaceChildren();
            this.text.value = '';
            this.amount.value = '';
            this.identities = [];
            this.nationNodes.clear();
            this.list.replaceChildren();
            return;
        }
        for (const nation of this.identities.filter((n) => n.nation_id !== snapshot.setup.nation_id)) {
            let button = this.nationNodes.get(nation.nation_id);
            if (!button) {
                button = el('button', {
                    type: 'button',
                    class: 'ui-button ui-button--quiet',
                    'data-nation-id': nation.nation_id,
                });
                this.nationNodes.set(nation.nation_id, button);
                this.list.append(button);
            }
            const unread = state.inbox.find((row) => row.other_nation_id === nation.nation_id)?.unread ?? 0;
            button.textContent = `${nation.usual_name}${unread ? ` (${unread})` : ''}`;
            button.setAttribute('aria-current', String(this.selected === nation.nation_id));
        }
        this.detail.hidden = !this.selected;
        if (!this.selected) return;
        this.partner.textContent = this.name(this.selected);
        const relation = relationTo(snapshot, this.selected);
        this.relation.textContent =
            this.t(`state.${relation.state}`) +
            (relation.ends_on_turn_number
                ? ` · ${this.t('expires', { turn: relation.ends_on_turn_number })}`
                : '');
        const isAI = snapshot.nation.diplomacy.ai_nation_ids.includes(this.selected);
        this.aiHint.hidden = !isAI;
        this.aiHint.textContent = this.t('ai');
        this.alliance.element.hidden =
            isAI || relation.state === 'Allied' || Boolean(relation.ends_on_turn_number);
        this.peace.element.hidden = ['Peace', 'Allied'].includes(relation.state);
        this.cancel.element.hidden =
            !['Peace', 'Allied'].includes(relation.state) || Boolean(relation.ends_on_turn_number);
        this.grant.hidden = isAI;
        this.amountField.setHelp(
            this.t('available', { amount: snapshot.nation.diplomacy.grantable[this.resource.value] ?? '0' }),
        );
        const conversation =
            state.conversation?.other_nation_id === this.selected ? state.conversation : null;
        this.older.element.hidden = !conversation?.has_more;
        this.latest.element.hidden = !this.comms.before;
        if (conversation) this.updateMessages(conversation);
        this.updateButtons();
    }
    updateMessages(conversation) {
        const pinned =
            this.messageList.scrollHeight - this.messageList.scrollTop - this.messageList.clientHeight < 60;
        const ids = new Set(conversation.messages.map((m) => m.id));
        for (const [id, row] of this.messageNodes)
            if (!ids.has(id)) {
                row.element.remove();
                this.messageNodes.delete(id);
            }
        for (const message of conversation.messages) {
            let row = this.messageNodes.get(message.id);
            const signature = JSON.stringify([message, this.name(message.sender_nation_id)]);
            if (row?.signature === signature) continue;
            if (!row) {
                row = {
                    element: el('article', { class: 'diplomacy-message', 'data-message-id': message.id }),
                };
                this.messageNodes.set(message.id, row);
                this.messageList.append(row.element);
            }
            row.signature = signature;
            const header = el('small', {
                text: `${message.sender_nation_id ? this.name(message.sender_nation_id) : this.t('system')} · ${this.t('turn', { turn: message.turn_number })}`,
            });
            const content = [];
            if (message.kind === 'Text') content.push(el('p', { text: message.body }));
            else if (message.offer) {
                const offer = message.offer;
                const label =
                    offer.kind === 'ResourceGrant'
                        ? `${offer.quantity} ${resourceName(this.services.world.snapshot.nation, offer.resource_key, this.services.i18n)}`
                        : this.t(`kind.${offer.kind}`);
                content.push(
                    el('strong', { text: label }),
                    el('p', { text: this.t(`status.${offer.status}`) }),
                );
                if (offer.reason) content.push(el('p', { text: this.t(`reason.${offer.reason}`) }));
                if (offer.status === 'Pending' && !message.reverted) {
                    for (const action of offer.sender_nation_id ===
                    this.services.world.snapshot.setup.nation_id
                        ? ['cancel']
                        : ['accept', 'decline']) {
                        const button = new Button({
                            label: this.t(action),
                            variant: action === 'accept' ? 'primary' : 'quiet',
                        }).element;
                        button.dataset.offerId = offer.id;
                        button.dataset.action = action;
                        content.push(button);
                    }
                }
            } else if (!message.reverted) {
                const data = message.event_data ?? {};
                let text;
                if (message.event_type === 'relationship')
                    text = this.t('relationshipNotice', { state: this.t(`state.${data.state}`) });
                else if (message.event_type === 'cancellation')
                    text = this.t('expires', { turn: data.ends_on_turn_number });
                else if (message.event_type === 'offer_result')
                    text = this.t('offerResult', {
                        id: data.offer_id,
                        status: this.t(`status.${data.status}`),
                    });
                else if (message.event_type === 'troops_returned')
                    text = this.t('returned', { count: data.count });
                else if (message.event_type === 'troops_disbanded')
                    text = this.t('disbanded', { count: data.count });
                else text = this.t('notice');
                content.push(el('p', { text }));
            }
            if (message.reverted) content.push(el('p', { class: 'ui-field-help', text: this.t('reverted') }));
            row.element.replaceChildren(header, ...content);
        }
        if (pinned) this.messageList.scrollTop = this.messageList.scrollHeight;
        const last = conversation.messages.at(-1)?.id;
        const marker = `${this.selected}:${last}`;
        if (last && this.lastRead !== marker) {
            this.lastRead = marker;
            void this.comms.markRead(last);
        }
    }
    updateButtons() {
        const safe =
            this.services.world.current &&
            !this.services.gameplay.busy &&
            !this.services.gameplay.needsReview &&
            !this.services.world.snapshot?.nation?.automated_nation &&
            this.comms.store.value.status === 'ready';
        for (const button of [this.peace, this.alliance, this.cancel, this.give, this.send])
            button.setDisabled(!safe || !this.selected);
        this.send.setDisabled(!safe || !this.selected || !this.text.value.trim());
        this.give.setDisabled(!safe || !this.selected || !this.amount.value);
        for (const button of this.messageList.querySelectorAll('[data-offer-id]')) button.disabled = !safe;
    }
}

export function createInstance(options) {
    return new Diplomacy(options);
}

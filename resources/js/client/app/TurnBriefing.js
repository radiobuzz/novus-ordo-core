import { Scope } from '../runtime/Scope.js';
import { el } from '../ui/dom.js';
import { Button } from '../ui/Button.js';
import { panel } from '../ui/Panel.js';
import { battleParticipants, reportEvent } from '../ui/ReportEvent.js';
import { reportText } from '../services/reportText.js';
import { turnKey } from '../services/turnBriefing.js';

/** Game composition. The service reads reports; this owns the presentation and seen marker. */
export class TurnBriefing {
    constructor(scope, services, onReport) {
        Object.assign(this, { scope, services, onReport });
        this.saved = services.saved.child(`game-${services.boot.gameId}`).child('briefing');
        this.seen = new Set();
        this.t = (key, params) => services.i18n.t(`hud.${key}`, params);
        this.closeButton = new Button({ label: this.t('continue'), variant: 'primary' });
        this.title = el('h2', { id: 'turn-briefing-title' });
        this.summary = el('div', { class: 'briefing-summary' });
        this.reportBody = el('div', { class: 'briefing-reports' });
        this.notice = el('p', { role: 'status', class: 'muted' });
        this.retry = new Button({ label: this.t('retryNews') });
        this.retry.element.hidden = true;
        this.dialog = el(
            'dialog',
            { class: 'turn-briefing', 'aria-labelledby': this.title.id },
            el('header', {}, el('p', { class: 'eyebrow', text: 'NOVUS ORDO' }), this.title),
            this.notice,
            this.summary,
            this.reportBody,
            el('footer', {}, this.retry.element, this.closeButton.element),
        );
        document.body.append(this.dialog);
        scope.listen(this.closeButton.element, 'click', () => this.close());
        scope.listen(this.retry.element, 'click', () => void this.load());
        scope.listen(this.dialog, 'cancel', (event) => {
            event.preventDefault();
            this.close();
        });
        // Don't interrupt a confirmation/inspector already open when a turn arrives.
        scope.listen(
            document,
            'close',
            () => {
                if (!scope.closed) scope.timeout(() => this.maybeOpen(), 0);
            },
            true,
        );
        scope.own(() => {
            this.request?.dispose();
            this.dialog.close();
            this.dialog.remove();
        });
        services.i18n.changed.subscribe(scope, () => {
            this.closeButton.setLabel(this.t('continue'));
            this.retry.setLabel(this.t('retryNews'));
            this.renderSummary();
            this.renderReport();
        });
        services.world.store.subscribe(scope, (state) => {
            const next = turnKey(state.snapshot);
            if (next !== this.key) {
                this.seen.clear();
                this.request?.dispose();
                this.report = null;
                this.reportBody.replaceChildren();
                this.summary.replaceChildren();
                this.onReport(null);
                this.close();
                this.key = next;
            }
            this.snapshot = state.snapshot;
            if (!next) {
                this.summary.replaceChildren();
                this.reportBody.replaceChildren();
            }
            if (this.dialog.open) this.renderSummary();
            if (state.status === 'ready') this.maybeOpen();
        });
    }
    maybeOpen() {
        if (
            !this.key ||
            this.services.automation?.autoReady ||
            !this.services.world.current ||
            this.seen.has(this.key) ||
            this.saved.read().lastKey === this.key ||
            document.querySelector('dialog[open]')
        )
            return;
        this.open();
    }
    open() {
        if (!this.snapshot?.nation || !this.services.world.current) return;
        this.previousFocus = document.activeElement;
        this.seen.add(this.key);
        this.saved.write({ lastKey: this.key });
        this.renderSummary();
        if (!this.dialog.open) this.dialog.showModal();
        this.closeButton.element.focus();
        void this.load();
    }
    close() {
        this.request?.dispose();
        if (!this.dialog.open) return;
        this.dialog.close();
        if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    }
    renderSummary() {
        const data = this.snapshot?.nation;
        if (!data) return;
        const number = (value, signed = false) =>
            Number.isFinite(value)
                ? this.services.i18n.number(value, {
                      maximumFractionDigits: 2,
                      ...(signed ? { signDisplay: 'always' } : {}),
                  })
                : '—';
        this.title.textContent = this.t('briefing', { turn: this.snapshot.turn_number });
        const summary = data.turn_summary;
        const growth = panel(
            { title: this.t('growth') },
            el('p', {
                text: this.t('population', {
                    value: number(summary?.population),
                    change: number(summary?.population_change, true),
                }),
            }),
            el('p', {
                text: this.t('territories', {
                    value: number(summary?.territories),
                    change: number(summary?.territory_change, true),
                }),
            }),
            el('small', {
                class: 'muted',
                text:
                    summary?.previous_turn_number != null
                        ? this.t('compared', { turn: summary.previous_turn_number })
                        : this.t('noBaseline'),
            }),
        );
        const completed = Object.entries(summary?.completed_units ?? {});
        const production = panel(
            { title: this.t('completed') },
            el('p', {
                text: completed.length
                    ? completed
                          .map(
                              ([type, count]) =>
                                  `${number(count)} ${this.services.i18n.t(`command.unit.${type}`)}`,
                          )
                          .join(' · ')
                    : this.t('noCompleted'),
            }),
            el('h3', { text: this.t('availableUnits') }),
            el('p', {
                text: Object.entries(data.deployment_limits ?? {})
                    .map(
                        ([type, count]) => `${this.services.i18n.t(`command.unit.${type}`)} ${number(count)}`,
                    )
                    .join(' · '),
            }),
            el('small', { class: 'muted', text: this.services.i18n.t('command.sharedMax') }),
        );
        this.summary.replaceChildren(growth, production);
        if (!this.services.world.current) this.notice.textContent = this.t('staleNews');
        else if (this.report) this.notice.textContent = this.t('newsScope');
    }
    async load() {
        if (!this.dialog.open || !this.services.world.current) return;
        this.request?.dispose();
        const request = new Scope();
        this.request = request;
        const key = this.key;
        this.notice.textContent = this.t('loadingNews');
        this.retry.element.hidden = true;
        try {
            const report = await this.services.gameplay.briefing(this.snapshot, request.signal);
            if (request.closed || this.scope.closed || key !== this.key) return;
            this.report = report;
            this.onReport(report);
            this.renderReport();
            this.notice.textContent = this.t('newsScope');
        } catch (error) {
            if (request.closed || this.scope.closed) return;
            if (['session', 'forbidden'].includes(error.category)) this.services.world.invalidate(error);
            else {
                this.notice.textContent = this.t('failedNews');
                this.retry.element.hidden = false;
            }
        } finally {
            void request.dispose();
        }
    }
    renderReport() {
        if (!this.report || !this.snapshot) {
            this.reportBody.replaceChildren();
            return;
        }
        const report = this.report;
        const text = (content) => reportText(content, { ...report, territories: this.snapshot.territories });
        const reportOptions = {
            ...report,
            territories: this.snapshot.territories,
            nationColors: this.snapshot.nation_colors,
            labels: {
                neutral: this.t('neutral'),
                versus: this.t('versus'),
                conquered: this.t('conquered'),
                repelledBy: this.t('repelledBy'),
            },
        };
        const battles = panel({ title: this.t('battles') });
        for (const battle of report.battles) {
            const territory = this.snapshot.territories.find((t) => t.territory_id === battle.territory_id);
            const result =
                battle.winner_nation_id == null
                    ? 'draw'
                    : battle.winner_nation_id === this.snapshot.setup.nation_id
                      ? 'won'
                      : 'lost';
            battles.append(
                el(
                    'details',
                    {},
                    el(
                        'summary',
                        {},
                        el('span', { text: `${territory?.name ?? battle.territory_id} · ` }),
                        battleParticipants(battle, reportOptions),
                        el('span', { text: ` · ${this.t(result)}` }),
                    ),
                    el('pre', { class: 'report-text', text: text(battle.text) }),
                ),
            );
        }
        if (!report.battles.length) battles.append(el('p', { text: this.t('noBattles') }));
        const news = panel({ title: this.t('headlines') });
        for (const item of report.news) news.append(reportEvent(item, reportOptions));
        if (!report.news.length) news.append(el('p', { text: this.t('noNews') }));
        this.reportBody.replaceChildren(battles, news);
    }
}

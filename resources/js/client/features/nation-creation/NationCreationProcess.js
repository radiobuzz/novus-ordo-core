import { Scope } from '../../runtime/Scope.js';
import { Signal } from '../../runtime/Signal.js';
import { nationColorChoices } from '../../services/nationColors.js';

export const stepIds = ['identity', 'leader', 'homeland', 'review'];
const fields = {
    nation_name: 'identity',
    nation_formal_name: 'identity',
    nation_flag: 'identity',
    primary_color_id: 'identity',
    secondary_color_id: 'identity',
    leader_name: 'leader',
    leader_title: 'leader',
    leader_picture: 'leader',
    territory_ids: 'homeland',
};
export class NationCreationProcess {
    scope = new Scope();
    changed = new Signal();
    stepId = 'identity';
    status = 'editing';
    errors = {};
    dirty = false;
    message = null;
    constructor(options, service, onSession) {
        this.options = options;
        this.service = service;
        this.onSession = onSession;
        this.draft = {
            identity: { nation_name: options.pending_name ?? '', nation_formal_name: '', nation_flag: null },
            leader: { leader_name: '', leader_title: '', leader_picture: null },
            homeland: [],
        };
        if (options.nation_colors) {
            const own = options.nation_colors.assignments.find(
                (a) => a.nation_id === options.pending_nation_id,
            );
            const primary = nationColorChoices(
                options.nation_colors,
                options.pending_nation_id,
                'en',
                true,
            ).find((c) => !c.disabled);
            this.draft.identity.primary_color_id = own?.primary_color_id ?? primary?.id ?? null;
            this.draft.identity.secondary_color_id =
                own?.secondary_color_id ??
                options.nation_colors.colors.find((c) => c.id !== primary?.id)?.id ??
                null;
        }
    }
    get busy() {
        return ['submitting', 'reconciling'].includes(this.status);
    }
    snapshot() {
        return { stepId: this.stepId, status: this.status, errors: this.errors, draft: this.draft };
    }
    emit() {
        this.changed.emit(this.snapshot());
    }
    updateDraft(group, patch) {
        if (this.busy) return;
        if (group === 'homeland') this.draft.homeland = [...patch];
        else Object.assign(this.draft[group], patch);
        this.dirty = true;
        this.errors = {};
        this.message = null;
        this.emit();
    }
    validate(step) {
        const issues = {};
        const text = (field, min, max, optional = false) => {
            const value = String(this.draft[step][field] ?? '').trim();
            if (optional && !value) return;
            if (value.length < min || value.length > max)
                issues[field] = { key: 'errors.length', params: { min, max } };
        };
        if (step === 'identity') {
            text('nation_name', 2, 100);
            text('nation_formal_name', 2, 1024, true);
            if (this.options.nation_colors) {
                for (const [field, primary] of [
                    ['primary_color_id', true],
                    ['secondary_color_id', false],
                ]) {
                    const choices = nationColorChoices(
                        this.options.nation_colors,
                        this.options.pending_nation_id,
                        'en',
                        primary,
                    );
                    if (!choices.some((c) => c.id === this.draft.identity[field] && !c.disabled))
                        issues[field] = { key: 'nation.colorUnavailable' };
                }
            }
        }
        if (step === 'leader') {
            text('leader_name', 2, 1024);
            text('leader_title', 2, 1024, true);
        }
        if (step === 'homeland' && !this.validHomeland())
            issues.territory_ids = {
                key: 'errors.territories',
                params: { count: this.options.required_territories },
            };
        return issues;
    }
    validHomeland() {
        const ids = this.draft.homeland;
        if (
            ids.length !== this.options.required_territories ||
            new Set(ids).size !== ids.length ||
            ids.some((id) => !this.options.suitable_ids.includes(id))
        )
            return false;
        const visited = new Set([ids[0]]);
        for (let changed = true; changed; ) {
            changed = false;
            for (const id of ids)
                if (!visited.has(id) && [...visited].some((from) => this.neighbors(from).includes(id))) {
                    visited.add(id);
                    changed = true;
                }
        }
        return visited.size === ids.length;
    }
    neighbors(id) {
        return (
            this.options.territories.find((t) => t.territory_id === id)?.connected_land_territory_ids ?? []
        );
    }
    selectable(id) {
        return (
            this.options.suitable_ids.includes(id) &&
            (this.draft.homeland.length === 0 ||
                this.draft.homeland.some((from) => this.neighbors(from).includes(id)))
        );
    }
    select(id) {
        if (this.draft.homeland.includes(id)) {
            this.updateDraft(
                'homeland',
                this.draft.homeland.filter((value) => value !== id),
            );
            return;
        }
        if (this.draft.homeland.length < this.options.required_territories && this.selectable(id))
            this.updateDraft('homeland', [...this.draft.homeland, id]);
    }
    goTo(id) {
        if (!stepIds.includes(id) || this.busy || this.status === 'complete' || this.status === 'blocked')
            return false;
        const target = stepIds.indexOf(id);
        for (let index = 0; index < target; index++) {
            const errors = this.validate(stepIds[index]);
            if (Object.keys(errors).length) {
                this.errors = errors;
                this.stepId = stepIds[index];
                this.emit();
                return false;
            }
        }
        this.errors = {};
        this.stepId = id;
        this.emit();
        return true;
    }
    back() {
        return this.goTo(stepIds[Math.max(0, stepIds.indexOf(this.stepId) - 1)]);
    }
    next() {
        return this.goTo(stepIds[Math.min(3, stepIds.indexOf(this.stepId) + 1)]);
    }
    async submit() {
        if (this.busy || this.status === 'complete' || this.status === 'blocked' || !this.goTo('review'))
            return;
        this.status = 'submitting';
        this.message = null;
        this.emit();
        try {
            await this.service.submit(this.draft, this.scope.signal);
            if (this.scope.closed) return;
            this.status = 'complete';
            this.dirty = false;
        } catch (error) {
            if (this.scope.closed) return;
            if (error.category === 'session') {
                this.status = 'blocked';
                this.message = 'nation.resumeSession';
                this.emit();
                this.onSession?.();
                return;
            }
            if (error.uncertain || error.category === 'conflict') {
                await this.reconcile();
                return;
            }
            this.status = 'editing';
            this.message = `errors.${error.category ?? 'unknown'}`;
            if (error.category === 'validation') {
                this.errors = error.fields;
                const first = Object.keys(error.fields).find((key) => fields[key]);
                if (first) this.stepId = fields[first];
                if (['territory_ids', 'primary_color_id', 'secondary_color_id'].includes(first)) {
                    try {
                        this.options = await this.service.load(this.scope.signal);
                    } catch {
                        /* Keep the draft and display the validation failure. */
                    }
                }
            }
        }
        this.emit();
    }
    async reconcile() {
        if (this.scope.closed || this.status === 'reconciling') return;
        this.status = 'reconciling';
        this.message = 'nation.reconciling';
        this.emit();
        try {
            const result = await this.service.load(this.scope.signal);
            if (this.scope.closed) return;
            if (result.user_id !== this.options.user_id || result.game_id !== this.options.game_id) {
                this.status = 'blocked';
                this.message = 'errors.session';
            } else if (result.status === 'FinishedSetup') {
                this.status = 'complete';
                this.dirty = false;
            } else {
                this.options = result;
                this.status = 'editing';
                this.message = 'nation.recovered';
            }
        } catch (error) {
            if (this.scope.closed) return;
            this.status = 'blocked';
            this.message = error.category === 'session' ? 'nation.resumeSession' : 'nation.uncertain';
            if (error.category === 'session') this.onSession?.();
        }
        this.emit();
    }
    dispose() {
        this.draft.identity.nation_flag = null;
        this.draft.leader.leader_picture = null;
        return this.scope.dispose();
    }
}

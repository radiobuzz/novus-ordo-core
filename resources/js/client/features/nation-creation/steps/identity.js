import { Component } from '../../../runtime/Component.js';
import { el } from '../../../ui/dom.js';
import { FormField } from '../../../ui/FormField.js';
import { ImageField } from '../../../ui/ImageField.js';
import { PaletteField } from '../../../ui/PaletteField.js';
import { nationColorChoices } from '../../../services/nationColors.js';

export class IdentityStep extends Component {
    async render() {
        const { process } = this.inputs,
            { i18n } = this.services;
        const leader = this.inputs.stepId === 'leader';
        const group = leader ? 'leader' : 'identity';
        this.element.append(
            i18n.bind(
                this.scope,
                el('h2', { tabindex: -1 }),
                leader ? 'nation.leaderTitle' : 'nation.identityTitle',
            ),
            i18n.bind(
                this.scope,
                el('p', { class: 'step-intro' }),
                leader ? 'nation.leaderBody' : 'nation.identityBody',
            ),
        );
        const specifications = leader
            ? [
                  ['leader_name', 'nation.leaderName', 1024, false],
                  ['leader_title', 'nation.leaderOffice', 1024, true],
              ]
            : [
                  ['nation_name', 'nation.name', 100, false, 'nation.namePlaceholder'],
                  ['nation_formal_name', 'nation.formalName', 1024, true, 'nation.formalPlaceholder'],
              ];
        this.fields = {};
        for (const [name, key, maxLength, optional, placeholder] of specifications) {
            const field = new FormField({
                scope: this.scope,
                i18n,
                id: `${this.id}-${name}`,
                key,
                maxLength,
                optional,
                placeholder,
                value: process.draft[group][name],
                onChange: (value) => process.updateDraft(group, { [name]: value }),
            });
            this.fields[name] = field;
            this.element.append(field.element);
        }
        const name = leader ? 'leader_picture' : 'nation_flag';
        const image = new ImageField({
            scope: this.scope,
            i18n,
            id: `${this.id}-${name}`,
            key: leader ? 'nation.portrait' : 'nation.flag',
            portrait: leader,
            file: process.draft[group][name],
            onChange: (value) => process.updateDraft(group, { [name]: value }),
        });
        this.fields[name] = image;
        this.element.append(image.element);
        if (!leader)
            this.element.append(
                i18n.bind(this.scope, el('p', { class: 'field-help' }), 'nation.defaultFlag'),
            );
        const update = () => {
            if (!leader && process.options.nation_colors)
                for (const [field, primary] of [
                    ['primary_color_id', true],
                    ['secondary_color_id', false],
                ])
                    this.fields[field].update({
                        label: i18n.t(primary ? 'identity.primary' : 'identity.secondary'),
                        choices: nationColorChoices(
                            process.options.nation_colors,
                            process.options.pending_nation_id,
                            i18n.locale,
                            primary,
                        ),
                        value: process.draft.identity[field],
                        disabled: process.busy,
                    });
            for (const [name, field] of Object.entries(this.fields)) {
                const issue = process.errors[name];
                field.setError(
                    issue?.key
                        ? i18n.t(issue.key, issue.params)
                        : Array.isArray(issue)
                          ? issue.join(' ')
                          : '',
                );
            }
        };
        if (!leader && process.options.nation_colors) {
            this.element.append(i18n.bind(this.scope, el('p', { class: 'field-help' }), 'nation.colorHelp'));
            for (const field of ['primary_color_id', 'secondary_color_id']) {
                const palette = new PaletteField(this.scope, {
                    label: '',
                    onChange: (id) => process.updateDraft('identity', { [field]: id }),
                });
                this.fields[field] = palette;
                this.element.append(palette.element);
            }
        }
        process.changed.subscribe(this.scope, update);
        i18n.changed.subscribe(this.scope, update);
        update();
    }
    focusError() {
        this.element.querySelector('[aria-invalid="true"]')?.focus();
    }
}
export function createInstance(options) {
    return new IdentityStep(options);
}

import { Component } from '../../../runtime/Component.js';
import { el, button } from '../../../ui/dom.js';
class ReviewStep extends Component {
    async render() {
        const { process } = this.inputs,
            { i18n } = this.services;
        this.element.append(
            i18n.bind(this.scope, el('h2', { tabindex: -1 }), 'nation.reviewTitle'),
            i18n.bind(this.scope, el('p', { class: 'step-intro' }), 'nation.reviewBody'),
        );
        for (const [step, names] of [
            ['identity', ['nation_name', 'nation_formal_name']],
            ['leader', ['leader_name', 'leader_title']],
            ['homeland', []],
        ]) {
            const heading = i18n.bind(this.scope, el('h3'), `wizard.${step}`);
            const edit = i18n.bind(this.scope, button('', 'text-button'), 'nation.edit', () => ({
                step: i18n.t(`wizard.${step}`),
            }));
            this.scope.listen(edit, 'click', () => process.goTo(step));
            const section = el('section', { class: 'review-section' }, el('header', {}, heading, edit));
            if (step === 'homeland')
                section.append(
                    el('p', {
                        text: process.draft.homeland
                            .map(
                                (id) =>
                                    process.options.territories.find((t) => t.territory_id === id)?.name ??
                                    id,
                            )
                            .join(' · '),
                    }),
                );
            else {
                const group = process.draft[step];
                if (step === 'identity' && process.options.nation_colors) {
                    for (const [field, key] of [
                        ['primary_color_id', 'identity.primary'],
                        ['secondary_color_id', 'identity.secondary'],
                    ]) {
                        const color = process.options.nation_colors.colors.find((c) => c.id === group[field]);
                        if (color) {
                            const chip = el('span', { class: 'ui-palette-chip', 'aria-hidden': 'true' });
                            if (/^#[0-9a-f]{6}$/i.test(color.hex)) chip.style.backgroundColor = color.hex;
                            const label = el('span');
                            const update = () => {
                                label.textContent = `${i18n.t(key)}: ${i18n.locale === 'fr' ? color.name_fr : color.name}`;
                            };
                            i18n.changed.subscribe(this.scope, update);
                            update();
                            section.append(el('p', { class: 'review-colour' }, chip, label));
                        }
                    }
                }
                for (const name of names)
                    if (group[name])
                        section.append(
                            el('p', {
                                class: name.endsWith('_name') ? 'review-name' : '',
                                text: group[name],
                            }),
                        );
                const file = group[step === 'identity' ? 'nation_flag' : 'leader_picture'];
                if (file) {
                    const src = URL.createObjectURL(file);
                    this.scope.own(() => URL.revokeObjectURL(src));
                    section.append(el('img', { class: `review-image ${step}`, src, alt: '' }));
                } else if (step === 'identity')
                    section.append(
                        i18n.bind(this.scope, el('p', { class: 'field-help' }), 'nation.defaultFlag'),
                    );
            }
            this.element.append(section);
        }
    }
}
export function createInstance(options) {
    return new ReviewStep(options);
}

import { el as element, button as makeButton } from './dom.js';
export function localizedDom(scope, i18n) {
    const el = (tag, { textKey, textParams, ...attributes } = {}, ...children) => {
        const node = element(tag, attributes, ...children);
        if (textKey) i18n.bind(scope, node, textKey, textParams);
        return node;
    };
    const button = (key, className = 'no-button') => i18n.bind(scope, makeButton('', className), key);
    return { el, button };
}

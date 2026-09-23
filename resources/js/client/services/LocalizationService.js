import en from '../strings/en.js';
import fr from '../strings/fr.js';
import { Signal } from '../runtime/Signal.js';

export class LocalizationService {
    changed = new Signal();
    constructor(saved, preferred = globalThis.navigator?.language ?? 'en') {
        this.saved = saved;
        this.locale = ['en', 'fr'].includes(saved.read().locale)
            ? saved.read().locale
            : preferred.startsWith('fr')
              ? 'fr'
              : 'en';
        this.applyDocument();
    }
    t(key, params = {}) {
        let value = (this.locale === 'fr' ? fr : en)[key] ?? en[key];
        if (value === undefined) {
            if (import.meta.env?.DEV) console.warn(`Missing translation: ${key}`);
            value = en['errors.unknown'];
        }
        if (typeof value === 'object')
            value = value[new Intl.PluralRules(this.locale).select(params.count)] ?? value.other;
        return value.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
    }
    setLocale(locale) {
        if (!['en', 'fr'].includes(locale) || locale === this.locale) return;
        this.locale = locale;
        this.saved.write({ ...this.saved.read(), locale });
        this.applyDocument();
        this.changed.emit(locale);
    }
    applyDocument() {
        if (!globalThis.document) return;
        document.documentElement.lang = this.locale;
        document.title = this.t('entry.title');
    }
    number(value, options) {
        return new Intl.NumberFormat(this.locale, options).format(value);
    }
    date(value, options) {
        return new Intl.DateTimeFormat(this.locale, options).format(value);
    }
    bind(scope, node, key, params = {}, attribute = null) {
        const update = () => {
            const text = this.t(key, typeof params === 'function' ? params() : params);
            if (attribute) node.setAttribute(attribute, text);
            else node.textContent = text;
        };
        update();
        this.changed.subscribe(scope, update);
        return node;
    }
    error(error) {
        return this.t(`errors.${error?.category ?? 'unknown'}`);
    }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalizationService } from '../../resources/js/client/services/LocalizationService.js';
import { economicWarning } from '../../resources/js/client/services/economicWarnings.js';

const warning = { type: 'annexed_maintenance_no_workforce', territory_id: 22819 };
const locale = (language) => new LocalizationService({ read: () => ({ locale: language }) });
test('Budget and header explanation includes the actual territory and agreed wording', () => {
    assert.equal(
        economicWarning(locale('en'), warning),
        'Newly annexed territory #22819 cannot perform maintenance this season because no workforce is available. Your infrastructure funding is sufficient.',
    );
    assert.match(economicWarning(locale('fr'), warning), /territoire nouvellement annexé nº 22819/);
    assert.match(economicWarning(locale('fr'), warning), /financement des infrastructures est suffisant/);
});
test('Unrelated warnings keep their existing localized text', () => {
    const i18n = locale('en');
    assert.equal(
        economicWarning(i18n, { type: 'acquisition_shortfall', resource: 'ore' }),
        i18n.t('economy.acquisition_shortfall'),
    );
});

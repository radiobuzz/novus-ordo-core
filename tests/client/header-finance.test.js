import test from 'node:test';
import assert from 'node:assert/strict';
import { headerFinance } from '../../resources/js/client/app/headerFinance.js';

const economy = () => ({
    state: { debt: '47' },
    forecast: {
        warnings: [],
        expected: {
            opening_treasury: '20',
            closing_treasury: '20',
            fiscal: {
                borrowing: '5',
                principal_repaid: '2',
                closing_debt: '50',
                interest_due: '0.7',
                credit_limit: '80',
                credit_lock: 0,
                default_episode: false,
            },
        },
    },
});

test('HUD separates operating deficit from financing and marks forecast debt direction', () => {
    const e = economy();
    assert.deepEqual(headerFinance(e), {
        debt: 47,
        closingDebt: 50,
        change: 3,
        trend: 'rising',
        interest: 0.7,
        remainingCredit: 30,
        restricted: false,
        tone: 'warning',
        balance: -3,
    });
    e.forecast.expected.fiscal.borrowing = '0';
    e.forecast.expected.fiscal.principal_repaid = '5';
    e.forecast.expected.fiscal.closing_debt = '42';
    assert.equal(headerFinance(e).balance, 5);
    assert.equal(headerFinance(e).trend, 'falling');
});

test('HUD distinguishes zero debt, warned/restricted credit and unavailable data', () => {
    const e = economy();
    e.state.debt = '0';
    e.forecast.expected.fiscal.closing_debt = '0';
    assert.equal(headerFinance(e).tone, 'muted');
    assert.equal(headerFinance(e).trend, 'steady');
    e.forecast.warnings = [{ type: 'credit_low' }];
    assert.equal(headerFinance(e).tone, 'danger');
    e.forecast.expected.fiscal.credit_lock = 2;
    assert.equal(headerFinance(e).remainingCredit, 0);
    const missing = headerFinance({ state: { debt: '12' } });
    assert.equal(missing.debt, 12);
    assert.equal(missing.change, null);
    assert.equal(missing.balance, null);
    assert.equal(missing.remainingCredit, null);
    assert.equal(headerFinance(undefined).debt, null);
});

import { chromium, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? '', /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const fixture = JSON.parse(readFileSync(`${root}/production-fixture.json`));
const origin = 'http://127.0.0.1:8792';
const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox'],
});
try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
    });
    page.setDefaultTimeout(30000);
    const errors = [];
    let workspace;
    page.on('pageerror', (e) => {
        errors.push(e.message);
        console.error(e.stack);
    });
    page.on('console', (message) => {
        if (message.type() === 'error') console.error('Browser:', message.text());
    });
    page.on('response', async (r) => {
        if (new URL(r.url()).pathname === '/client/gameplay' && r.ok()) workspace = await r.json();
        if (r.url().includes(origin) && r.status() >= 500)
            console.error(r.url(), r.status(), (await r.text()).slice(0, 500));
    });
    const session = await (await page.request.get(origin + '/client/session')).json();
    const login = await page.request.post(origin + '/login-user', {
        headers: {
            Accept: 'application/json',
            'X-CSRF-TOKEN': session.csrfToken,
        },
        data: { username: fixture.user, password: 'fixture-password' },
    });
    assert.equal(login.status(), 200, await login.text());
    await page.goto(`${origin}/client?game_id=${fixture.game_id}#/economy`);
    await page.getByRole('button', { name: 'Continue playing', exact: true }).click();
    const historyQuery = new URLSearchParams({
        game_id: String(workspace.game_id),
        turn_number: String(workspace.turn_number),
        turn_context_revision: workspace.turn_context_revision,
        window: '12',
        nation_id: '999999', // The reader resolves ownership; this cannot select another nation.
    });
    const historyResponse = await page.request.get(`${origin}/nation/economic-history?${historyQuery}`, {
        headers: { Accept: 'application/json' },
    });
    assert.equal(historyResponse.status(), 200, await historyResponse.text());
    const economicHistory = await historyResponse.json();
    assert.equal(economicHistory.nation_id, workspace.nation.nation_id);
    assert.ok(economicHistory.seasons.every((point) => point.season < workspace.turn_number));
    assert.match(historyResponse.headers()['cache-control'], /no-store/);
    historyQuery.set('turn_context_revision', 'obsolete-context');
    const staleHistory = await page.request.get(`${origin}/nation/economic-history?${historyQuery}`, {
        headers: { Accept: 'application/json' },
    });
    assert.equal(staleHistory.status(), 409);
    await page
        .locator('.economy-column')
        .first()
        .getByRole('tab', { name: 'Civilian economy', exact: true })
        .click();
    const civilian = page.locator('.economy-civilian');
    await expect(civilian).toBeVisible();
    await expect(civilian.locator('[data-metric="civilian:food"]')).toBeVisible();
    await expect(civilian.locator('[data-metric="civilian:household_goods"]')).toBeVisible();
    await civilian.locator('details > summary').click();
    await expect(civilian.locator('[data-metric="civilian:household_cash"]')).toBeVisible();
    await civilian.evaluate((node) => {
        window.civilianTable = node.querySelector('table');
        window.civilianDetails = node.querySelector('details');
    });
    const tax = page.getByRole('group', { name: 'Income tax', exact: true }).getByRole('spinbutton');
    // Editing a lower policy must retain the report DOM, focus and page scroll.
    const policyInput = tax;
    await policyInput.scrollIntoViewIfNeeded();
    await policyInput.focus();
    const policyPosition = await policyInput.evaluate((input) => {
        window.budgetTable = document.querySelector('.economy-column [data-budget-group="spending"] table');
        window.policyInput = input;
        const scroller = document.querySelector('.game-workspace');
        return {
            scroll: scroller.scrollTop,
            top: input.getBoundingClientRect().top,
        };
    });
    await policyInput.fill(await policyInput.inputValue());
    await expect(page.locator('.economy-workspace')).toHaveAttribute('aria-busy', 'false');
    const afterPolicy = await policyInput.evaluate((input) => ({
        retained:
            window.budgetTable ===
            document.querySelector('.economy-column [data-budget-group="spending"] table'),
        focused: document.activeElement === window.policyInput,
        scroll: document.querySelector('.game-workspace').scrollTop,
        top: input.getBoundingClientRect().top,
    }));
    assert.ok(
        afterPolicy.retained && afterPolicy.focused,
        'Policy preview replaced the report or lost focus',
    );
    assert.ok(
        await civilian.evaluate(
            (node) =>
                window.civilianTable === node.querySelector('table') &&
                window.civilianDetails === node.querySelector('details') &&
                window.civilianDetails.open,
        ),
        'Civilian preview replaced its table or reset the disclosure',
    );
    assert.ok(Math.abs(afterPolicy.scroll - policyPosition.scroll) < 3, 'Policy preview jumped the page');
    assert.ok(Math.abs(afterPolicy.top - policyPosition.top) < 3, 'Policy control moved during preview');
    await expect(page.locator('[data-metric="tax_receipts"] td').nth(1)).toHaveAttribute(
        'data-tone',
        'ready',
    );
    await expect(page.locator('[data-metric="treasury_outflows"] td').nth(1)).toHaveAttribute(
        'data-tone',
        'warning',
    );
    const taxRate = (await tax.inputValue()) === '31' ? '32' : '31';
    await tax.fill(taxRate);
    await expect(page.getByRole('button', { name: 'Review & save', exact: true })).toBeEnabled();
    await page.locator('.game-workspace').evaluate((node) => {
        node.scrollTop = 0;
    });
    await page.screenshot({ path: `${root}/budget-desktop.png` });
    await page.locator('.economy-resources > summary').click();
    await page.getByRole('button', { name: 'Open production planner', exact: true }).click();
    const dialog = page.getByRole('dialog', {
        name: 'Production & acquisitions',
        exact: true,
    });
    const row = dialog.locator('[data-production-resource="ore"]');
    const investment = row.getByLabel('Public capacity expansion (%)', {
        exact: true,
    });
    const oreTab = dialog.locator('[role="tab"][data-tab-key="ore"]');
    await expect(oreTab)
        .toBeVisible()
        .catch(async (error) => {
            console.error(await dialog.innerText());
            await page.screenshot({ path: `${root}/planner-failure.png` });
            throw error;
        });
    await oreTab.click();
    await expect(dialog.getByRole('tabpanel')).toHaveCount(1);
    const otherTab = dialog.locator('[role="tab"]:not([data-tab-key="ore"])').first();
    const quantity = row.getByLabel('Requested quantity', { exact: true });
    const spending = row.getByLabel('Spending limit', { exact: true });
    const previewSave = dialog.getByRole('button', {
        name: 'Save seasonal plan',
        exact: true,
    });
    await expect(previewSave).toBeEnabled();
    await quantity.scrollIntoViewIfNeeded();
    await quantity.focus();
    const plannerPosition = await quantity.evaluate((input) => {
        window.acquisitionTable = input.closest('.planner-row').querySelector('table');
        window.acquisitionInput = input;
        const scroller = input.closest('.surface-body');
        return {
            scroll: scroller.scrollTop,
            height: scroller.scrollHeight,
            top: input.getBoundingClientRect().top,
        };
    });
    // Invalid intermediate typing must not remove the old forecast or collapse the modal.
    await quantity.fill('');
    await expect(previewSave).toBeDisabled();
    await expect(oreTab).toHaveAccessibleName(/Check the values/);
    const checkPlannerPosition = async () => {
        const position = await quantity.evaluate((input) => ({
            retained: window.acquisitionTable === input.closest('.planner-row').querySelector('table'),
            focused: document.activeElement === window.acquisitionInput,
            scroll: input.closest('.surface-body').scrollTop,
            height: input.closest('.surface-body').scrollHeight,
            top: input.getBoundingClientRect().top,
        }));
        assert.ok(
            position.retained && position.focused,
            'Acquisition preview replaced the table or lost focus',
        );
        assert.ok(
            Math.abs(position.scroll - plannerPosition.scroll) < 3,
            'Acquisition preview jumped the modal',
        );
        assert.ok(
            Math.abs(position.height - plannerPosition.height) < 3,
            'Acquisition preview collapsed the modal content',
        );
        assert.ok(Math.abs(position.top - plannerPosition.top) < 3, 'Acquisition input moved during preview');
    };
    await checkPlannerPosition();
    await otherTab.click();
    await expect(oreTab).toHaveAccessibleName(/Check the values/);
    await expect(previewSave).toBeDisabled();
    await oreTab.click();
    await quantity.focus();
    await quantity.fill('4.123456');
    await checkPlannerPosition();
    await expect(previewSave).toBeEnabled();
    await checkPlannerPosition();
    await quantity.fill('4.123456');
    await spending.fill('20');
    await investment.fill('25');
    await row.getByLabel('Priority (lower first)', { exact: true }).fill('7');
    await expect(oreTab).toHaveAccessibleName(/Unsaved changes/);
    await otherTab.click();
    await expect(row).toBeHidden();
    await expect(dialog.getByRole('tabpanel')).toHaveCount(1);
    await oreTab.click();
    await expect(quantity).toHaveValue('4.123456');
    await expect(investment).toHaveValue('25');
    await row.locator('details.planner-details > summary').click();
    const save = dialog.getByRole('button', {
        name: 'Save seasonal plan',
        exact: true,
    });
    await expect(save).toBeEnabled();
    await expect(oreTab).toHaveAttribute('aria-selected', 'true');
    await expect(row.locator('details.planner-details')).toHaveAttribute('open', '');
    await row.locator('.planner-history > summary').click();
    await expect(row.locator('.planner-history .economic-history')).toBeVisible();
    await quantity.evaluate((n) => {
        n.dataset.identity = 'kept';
        n.focus();
    });
    await dialog.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(quantity).toHaveValue('4.123456');
    await expect(oreTab).toHaveAccessibleName(/Unsaved changes/);
    assert.equal(await quantity.getAttribute('data-identity'), 'kept');
    await expect(save).toBeEnabled();
    await expect(oreTab).toHaveAttribute('aria-selected', 'true');
    await expect(row.locator('details.planner-details')).toHaveAttribute('open', '');
    const saved = page.waitForResponse(
        (r) => r.url().endsWith('/nation/production-plan') && r.request().method() === 'POST',
    );
    await save.click();
    const response = await saved;
    assert.equal(response.status(), 200, await response.text());
    const body = response.request().postDataJSON();
    assert.equal(body.changes.income_tax.parameters.rate, String(Number(taxRate) / 100));
    assert.equal(body.changes.public_investment_ore.parameters.funding_ratio, '0.25');
    await expect(page.locator('[data-policy-key="public_investment_ore"] input[type="number"]')).toHaveValue(
        '25',
    );
    assert.equal(body.acquisitions.find((r) => r.resource_key === 'ore').quantity, '4.123456');
    assert.equal(body.acquisitions.find((r) => r.resource_key === 'ore').spending_limit, '20');
    assert.equal(body.acquisitions.find((r) => r.resource_key === 'ore').priority, 7);
    await expect(row.getByRole('columnheader', { name: 'Last season · actual' })).toBeVisible();
    await expect(
        row.getByRole('rowheader', {
            name: 'Private purchase expense · money',
        }),
    ).toBeVisible();
    await expect(quantity).toHaveValue('4.123456');
    await expect(oreTab).not.toHaveAccessibleName(/Unsaved changes/);
    const currentSession = await (await page.request.get(origin + '/client/session')).json();
    const stale = await page.request.post(origin + '/nation/production-plan', {
        headers: {
            Accept: 'application/json',
            'X-CSRF-TOKEN': currentSession.csrfToken,
        },
        data: {
            ...body,
            client_context: {
                ...body.client_context,
                resource_edit_counter: 999999,
            },
        },
    });
    assert.equal(stale.status(), 409);
    await quantity.fill('0.0000001');
    await expect(save).toBeDisabled();
    await quantity.fill('1');
    await expect(save).toBeEnabled();
    // A large valid order reports the server's delivery shortfall, including on an inactive tab.
    await quantity.fill('999999');
    await expect(save).toBeEnabled();
    await expect(oreTab).toHaveAccessibleName(/Expected delivery below/);
    await otherTab.click();
    await expect(oreTab.locator('.ui-tab-badge')).toHaveText('!');
    await oreTab.click();
    await quantity.fill('1');
    await expect(save).toBeEnabled();
    await row.locator('details.planner-details > summary').click();
    await page.screenshot({ path: `${root}/production-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(quantity).toBeVisible();
    const assertFooterVisible = async () => {
        const box = await save.boundingBox();
        assert.ok(box && box.y >= 0 && box.y + box.height <= 844, 'Save action escaped the viewport');
    };
    await assertFooterVisible();
    await page.screenshot({ path: `${root}/production-mobile.png` });
    await row.locator('details.planner-details > summary').click();
    await dialog.locator('.planner-scroll').evaluate((node) => {
        node.scrollTop = node.scrollHeight;
    });
    await assertFooterVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('.language-selector').selectOption('fr');
    await page.locator('.game-menu > summary').click();
    await expect(
        page.getByRole('heading', {
            name: 'Conditions de vie civiles',
            exact: true,
        }),
    ).toBeVisible();
    await civilian.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${root}/civilian-mobile-fr.png` });
    await page
        .getByRole('button', {
            name: 'Ouvrir le planificateur de production',
            exact: true,
        })
        .click();
    await expect(
        page
            .getByRole('dialog', { name: 'Production et acquisitions' })
            .getByRole('tabpanel')
            .getByLabel('Plafond de dépenses')
            .first(),
    ).toBeVisible();
    await expect(
        page.getByRole('dialog', { name: 'Production et acquisitions' }).getByRole('button', {
            name: 'Enregistrer le plan saisonnier',
            exact: true,
        }),
    ).toBeEnabled();
    await page.screenshot({ path: `${root}/production-mobile-fr.png` });
    assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'French page overflows',
    );
    await page
        .getByRole('dialog', { name: 'Production et acquisitions' })
        .getByRole('button', { name: 'Fermer', exact: true })
        .click();
    await page.setViewportSize({ width: 1440, height: 1100 });
    const territoryId = Object.keys(workspace.production_planning.territories)[0];
    await page.goto(`${origin}/client?game_id=${fixture.game_id}#/world?territory=${territoryId}`);
    await expect(page.locator('.territory-activity')).toBeVisible();
    await expect(
        page.locator('.hud-resource[data-resource-kind="stock"] .hud-resource-reserve').first(),
    ).toBeVisible();
    const capacityDetail = page
        .locator('.territory-activity > details')
        .filter({ hasText: 'Capacité installée actuelle' })
        .first();
    await capacityDetail.locator(':scope > summary').click();
    await expect(capacityDetail.getByText('Capacité installée actuelle').first()).toBeVisible();
    await page.screenshot({ path: `${root}/production-territory.png` });
    assert.deepEqual(errors, []);
    console.log(
        'PASS: production browser — retained resource tabs/drafts/disclosures, hidden-resource validation, warning/unsaved badges, fixed mobile footer, stable policy/acquisition scroll, combined preview/save, exact decimals, refresh identity, stale rejection, French and narrow layout.',
    );
} finally {
    await browser.close();
}

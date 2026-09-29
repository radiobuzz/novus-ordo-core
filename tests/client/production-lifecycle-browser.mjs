import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const root = process.env.NO7_ENTRY_TEST_ROOT;
assert.match(root ?? "", /^\/tmp\/no7-entry-db-[A-Za-z0-9]+$/);
const fixture = JSON.parse(readFileSync(`${root}/production-fixture.json`));
const origin = "http://127.0.0.1:8792";
const browser = await chromium.launch({
    executablePath: "/opt/google/chrome/chrome",
    headless: true,
    args: ["--no-sandbox"],
});
try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
    });
    page.setDefaultTimeout(30000);
    const errors = [];
    let workspace;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", async (r) => {
        if (new URL(r.url()).pathname === '/client/gameplay' && r.ok()) workspace = await r.json();
        if (r.url().includes(origin) && r.status() >= 500)
            console.error(r.url(), r.status(), (await r.text()).slice(0, 500));
    });
    const session = await (
        await page.request.get(origin + "/client/session")
    ).json();
    const login = await page.request.post(origin + "/login-user", {
        headers: {
            Accept: "application/json",
            "X-CSRF-TOKEN": session.csrfToken,
        },
        data: { username: fixture.user, password: "fixture-password" },
    });
    assert.equal(login.status(), 200, await login.text());
    await page.goto(`${origin}/client?game_id=${fixture.game_id}#/economy`);
    await page
        .getByRole("button", { name: "Continue playing", exact: true })
        .click();
    const tax = page
        .getByRole("group", { name: "Income tax", exact: true })
        .getByRole("spinbutton");
    // Editing a lower policy must retain the report DOM, focus and page scroll.
    const policyInput = page.locator('.economy-policy input').last();
    await policyInput.scrollIntoViewIfNeeded();
    await policyInput.focus();
    const policyPosition = await policyInput.evaluate((input) => {
        window.budgetTable = document.querySelector('.economy-budget table');
        window.policyInput = input;
        const scroller = document.querySelector('.game-workspace');
        return { scroll: scroller.scrollTop, top: input.getBoundingClientRect().top };
    });
    await policyInput.fill(await policyInput.inputValue());
    await expect(page.locator('.economy-budget')).toHaveAttribute('aria-busy', 'false');
    const afterPolicy = await policyInput.evaluate((input) => ({
        retained: window.budgetTable === document.querySelector('.economy-budget table'),
        focused: document.activeElement === window.policyInput,
        scroll: document.querySelector('.game-workspace').scrollTop,
        top: input.getBoundingClientRect().top,
    }));
    assert.ok(afterPolicy.retained && afterPolicy.focused, 'Policy preview replaced the report or lost focus');
    assert.ok(Math.abs(afterPolicy.scroll - policyPosition.scroll) < 3, 'Policy preview jumped the page');
    assert.ok(Math.abs(afterPolicy.top - policyPosition.top) < 3, 'Policy control moved during preview');
    await expect(page.locator('[data-metric="tax_receipts"] td').nth(1)).toHaveAttribute('data-tone', 'ready');
    await expect(page.locator('[data-metric="treasury_outflows"] td').nth(1)).toHaveAttribute('data-tone', 'warning');
    const taxRate = (await tax.inputValue()) === '31' ? '32' : '31';
    await tax.fill(taxRate);
    await expect(
        page.getByRole("button", { name: "Review changes", exact: true }),
    ).toBeEnabled();
    await page.locator('.game-workspace').evaluate((node) => { node.scrollTop = 0; });
    await page.screenshot({ path: `${root}/budget-desktop.png` });
    await page.locator(".economy-resources > summary").click();
    await page
        .getByRole("button", { name: "Open acquisition planner", exact: true })
        .click();
    const dialog = page.getByRole("dialog", {
        name: "Government acquisitions",
        exact: true,
    });
    const row = dialog.locator('[data-production-resource="ore"]');
    const quantity = row.getByLabel("Requested quantity", { exact: true });
    const spending = row.getByLabel("Spending limit", { exact: true });
    const previewSave = dialog.getByRole('button', { name: 'Save seasonal plan', exact: true });
    await expect(previewSave).toBeEnabled();
    await quantity.scrollIntoViewIfNeeded();
    await quantity.focus();
    const plannerPosition = await quantity.evaluate((input) => {
        window.acquisitionTable = input.closest('.planner-row').querySelector('table');
        window.acquisitionInput = input;
        const scroller = input.closest('.surface-body');
        return { scroll: scroller.scrollTop, height: scroller.scrollHeight, top: input.getBoundingClientRect().top };
    });
    // Invalid intermediate typing must not remove the old forecast or collapse the modal.
    await quantity.fill('');
    await expect(previewSave).toBeDisabled();
    const checkPlannerPosition = async () => {
        const position = await quantity.evaluate((input) => ({
            retained: window.acquisitionTable === input.closest('.planner-row').querySelector('table'),
            focused: document.activeElement === window.acquisitionInput,
            scroll: input.closest('.surface-body').scrollTop,
            height: input.closest('.surface-body').scrollHeight,
            top: input.getBoundingClientRect().top,
        }));
        assert.ok(position.retained && position.focused, 'Acquisition preview replaced the table or lost focus');
        assert.ok(Math.abs(position.scroll - plannerPosition.scroll) < 3, 'Acquisition preview jumped the modal');
        assert.ok(Math.abs(position.height - plannerPosition.height) < 3, 'Acquisition preview collapsed the modal content');
        assert.ok(Math.abs(position.top - plannerPosition.top) < 3, 'Acquisition input moved during preview');
    };
    await checkPlannerPosition();
    await quantity.fill('4.123456');
    await checkPlannerPosition();
    await expect(previewSave).toBeEnabled();
    await checkPlannerPosition();
    await quantity.fill("4.123456");
    await spending.fill("20");
    await row.getByLabel("Priority (lower first)", { exact: true }).fill("7");
    const save = dialog.getByRole("button", {
        name: "Save seasonal plan",
        exact: true,
    });
    await expect(save).toBeEnabled();
    await quantity.evaluate((n) => {
        n.dataset.identity = "kept";
        n.focus();
    });
    await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(quantity).toHaveValue("4.123456");
    assert.equal(await quantity.getAttribute("data-identity"), "kept");
    await expect(save).toBeEnabled();
    const saved = page.waitForResponse(
        (r) =>
            r.url().endsWith("/nation/production-plan") &&
            r.request().method() === "POST",
    );
    await save.click();
    const response = await saved;
    assert.equal(response.status(), 200, await response.text());
    const body = response.request().postDataJSON();
    assert.equal(body.changes.income_tax.parameters.rate, String(Number(taxRate) / 100));
    assert.equal(
        body.acquisitions.find((r) => r.resource_key === "ore").quantity,
        "4.123456",
    );
    assert.equal(
        body.acquisitions.find((r) => r.resource_key === "ore").spending_limit,
        "20",
    );
    assert.equal(
        body.acquisitions.find((r) => r.resource_key === "ore").priority,
        7,
    );
    await expect(
        row.getByRole("columnheader", { name: "Last season · actual" }),
    ).toBeVisible();
    await expect(
        row.getByRole("rowheader", {
            name: "Private purchase expense · money",
        }),
    ).toBeVisible();
    await expect(quantity).toHaveValue("4.123456");
    const currentSession = await (
        await page.request.get(origin + "/client/session")
    ).json();
    const stale = await page.request.post(origin + "/nation/production-plan", {
        headers: {
            Accept: "application/json",
            "X-CSRF-TOKEN": currentSession.csrfToken,
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
    await quantity.fill("0.0000001");
    await expect(save).toBeDisabled();
    await quantity.fill("1");
    await expect(save).toBeEnabled();
    await page.screenshot({ path: `${root}/production-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(quantity).toBeVisible();
    await page.screenshot({ path: `${root}/production-mobile.png` });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByLabel("Game menu", { exact: true }).click();
    await page.locator(".language-selector").selectOption("fr");
    await page.locator(".game-menu > summary").click();
    await page
        .getByRole("button", {
            name: "Ouvrir le planificateur d’acquisitions",
            exact: true,
        })
        .click();
    await expect(
        page
            .getByRole("dialog", { name: "Acquisitions publiques" })
            .getByLabel("Plafond de dépenses")
            .first(),
    ).toBeVisible();
    assert.ok(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "French page overflows",
    );
    await page
        .getByRole("dialog", { name: "Acquisitions publiques" })
        .getByRole("button", { name: "Fermer", exact: true })
        .click();
    await page.setViewportSize({ width: 1440, height: 1100 });
    const territoryId = Object.keys(
        workspace.production_planning.territories,
    )[0];
    await page.goto(
        `${origin}/client?game_id=${fixture.game_id}#/world?territory=${territoryId}`,
    );
    await expect(page.locator(".territory-activity")).toBeVisible();
    await expect(page.locator('.hud-resource[data-resource-kind="stock"] .hud-resource-reserve').first()).toBeVisible();
    await page
        .locator(".territory-activity > details > summary")
        .first()
        .click();
    await expect(
        page
            .locator(".territory-activity")
            .getByText("Capacité installée actuelle")
            .first(),
    ).toBeVisible();
    await page.screenshot({ path: `${root}/production-territory.png` });
    assert.deepEqual(errors, []);
    console.log(
        "PASS: production browser — stable policy/acquisition scroll, retained tables/focus, budget tones, combined preview/save, exact decimals, refresh identity, stale counter rejection, invalid inputs, French and narrow layout.",
    );
} finally {
    await browser.close();
}

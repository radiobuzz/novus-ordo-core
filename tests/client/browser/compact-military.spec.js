import { test, expect } from "@playwright/test";
import { fixtures } from "../fixtures.js";
import { prepareHud } from "./hud-helpers.js";

test.beforeEach(async ({ page }) => prepareHud(page));
async function start(page, data) {
    await page.route("**/client/gameplay", (route) =>
        route.fulfill({ json: data }),
    );
    await page.goto("/client?game_id=1");
    await page.locator('[data-mode="military"]').click();
}
async function refresh(page) {
    const response = page.waitForResponse("**/client/gameplay");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await response;
}
function orders() {
    const data = structuredClone(fixtures("/client/gameplay"));
    const infantry = data.divisions[0];
    data.divisions = [
        {
            ...infantry,
            order: { order_type: "Raid", target_territory_id: 157 },
        },
        {
            ...data.divisions[1],
            order: { order_type: "Raid", target_territory_id: 157 },
        },
        {
            ...infantry,
            division_id: 13,
            order: { order_type: "Raid", target_territory_id: 158 },
        },
        { ...infantry, division_id: 14, order: { order_type: "Disband" } },
    ];
    data.deployments = [90, 91].map((deployment_id) => ({
        deployment_id,
        division_type: "Infantry",
        territory_id: 156,
    }));
    return data;
}

test("compact artwork badges show remaining shared budget and draft counts; details stay on demand", async ({
    page,
}) => {
    const data = structuredClone(fixtures("/client/gameplay"));
    await start(page, data);
    await page.locator('[data-tool="deploy"]').click();
    const infantry = page.locator('[data-unit-type="Infantry"]');
    const armored = page.locator('[data-unit-type="Armored"]');
    await expect(
        infantry.locator(".ui-image-choice-badge").first(),
    ).toContainText("10");
    await expect(
        infantry.locator(".ui-image-choice-badge").last(),
    ).toContainText("◇ 0");
    await page
        .getByRole("button", {
            name: "Infantry: costs and details",
            exact: true,
        })
        .focus();
    await expect(page.getByRole("tooltip")).toContainText(
        "Deployment cost: 3 Capital",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.getByText("Place using a list", { exact: true }).click();
    await page
        .getByLabel("Destination territory", { exact: true })
        .selectOption("156");
    await page
        .getByLabel("Quantity (up to 100 per request)", { exact: true })
        .fill("8");
    await page
        .getByRole("button", { name: "Add to preview", exact: true })
        .click();
    await expect(
        infantry.locator(".ui-image-choice-badge").first(),
    ).toContainText("2");
    await expect(
        infantry.locator(".ui-image-choice-badge").last(),
    ).toContainText("◇ 8");
    await expect(
        armored.locator(".ui-image-choice-badge").first(),
    ).toContainText("1");
    await page.getByText("Place using a list", { exact: true }).click();
    await page.locator(".deployment-placements > summary").click();
    await infantry.focus();
    await page.evaluate(() => {
        window.compactCard = document.querySelector(
            '[data-unit-type="Infantry"]',
        );
    });
    await refresh(page);
    await expect(infantry).toBeFocused();
    await expect(page.locator(".deployment-placements")).toHaveAttribute(
        "open",
        "",
    );
    expect(
        await page.evaluate(
            () =>
                compactCard ===
                document.querySelector('[data-unit-type="Infantry"]'),
        ),
    ).toBe(true);
    await page.locator(".deployment-placements > summary").click();
    const dock = page.locator(".world-command-dock");
    const dimensions = await dock.evaluate((el) => ({
        content: el.scrollHeight,
        height: el.clientHeight,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.height + 1);
    await page.screenshot({
        path: "test-results/client/compact-deployment-desktop.png",
    });
    await page.locator('[data-unit-type="Bomber"]').click();
    await expect(page.locator(".deployment-draft-validation")).toContainText(
        "No more units",
    );
    await page
        .getByRole("button", { name: "Bomber: costs and details", exact: true })
        .click();
    await expect(page.getByRole("tooltip")).toContainText(
        "Capital: need 15; available after preview 6.",
    );
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: "test-results/client/compact-deployment-mobile.png",
    });
});

test("orders group by action and destination; latest group IDs and single IDs cancel independently", async ({
    page,
}) => {
    const data = orders(),
        writes = [];
    await start(page, data);
    await page.locator('[data-tool="orders"]').click();
    await expect(page.locator(".pending-order-group")).toHaveCount(4);
    const raid = page
        .locator(".pending-order-group")
        .filter({ hasText: "Raid → Boreal March" });
    await expect(raid.locator("summary")).toContainText("1 × Infantry");
    await expect(raid.locator("summary")).toContainText("1 × Armored");
    await expect(
        raid.getByRole("button", { name: "Cancel order #11", exact: true }),
    ).toBeHidden();
    await raid.locator("summary").click();
    await raid
        .getByRole("button", { name: "Cancel order #11", exact: true })
        .focus();
    await page.evaluate(() => {
        window.orderRow = document.querySelector(
            '[data-order-key="division-11"]',
        );
    });
    data.divisions.push({ ...data.divisions[0], division_id: 15 });
    await refresh(page);
    await expect(raid.locator("summary")).toContainText("2 × Infantry");
    await expect(raid.locator("details")).toHaveAttribute("open", "");
    await expect(
        raid.getByRole("button", { name: "Cancel order #11", exact: true }),
    ).toBeFocused();
    expect(
        await page.evaluate(
            () =>
                orderRow ===
                document.querySelector('[data-order-key="division-11"]'),
        ),
    ).toBe(true);
    await page.screenshot({
        path: "test-results/client/grouped-orders-desktop.png",
    });
    await page.route("**/nation/divisions:cancel-orders", (route) => {
        const body = route.request().postDataJSON();
        writes.push(body);
        data.divisions.forEach((d) => {
            if (body.division_ids.includes(d.division_id)) d.order = null;
        });
        return route.fulfill({ json: {} });
    });
    await raid
        .getByRole("button", { name: "Cancel order #11", exact: true })
        .click();
    await expect(
        raid.getByRole("button", { name: "Cancel order #11", exact: true }),
    ).toHaveCount(0);
    expect(writes[0].division_ids).toEqual([11]);
    await expect(raid.locator("details")).toHaveAttribute("open", "");
    await raid.getByRole("button", { name: /Cancel group:/ }).click();
    await expect(raid).toHaveCount(0);
    expect(writes[1].division_ids).toEqual([12, 15]);
    expect(writes[1].client_context.game_id).toBe(1);
    await expect(page.locator(".pending-order-group")).toHaveCount(3);
    await page.route(
        "**/nation/deployments/cancel-deployment-requests",
        (route) => {
            writes.push(route.request().postDataJSON());
            data.deployments = [];
            return route.fulfill({ json: {} });
        },
    );
    await page
        .getByRole("button", {
            name: "Cancel group: Deploy → Aster Reach (2 units)",
            exact: true,
        })
        .click();
    await expect(page.locator(".pending-order-group")).toHaveCount(2);
    expect(writes[2].deployment_ids).toEqual([90, 91]);
    expect(writes[2].division_ids).toBeUndefined();
});

test("failed grouped cancellation keeps orders and open disclosure without retries", async ({
    page,
}) => {
    const data = orders();
    let writes = 0;
    await start(page, data);
    await page.locator('[data-tool="orders"]').click();
    const group = page
        .locator(".pending-order-group")
        .filter({ hasText: "Raid → Boreal March" });
    await group.locator("summary").click();
    await page.route("**/nation/divisions:cancel-orders", (route) => {
        writes++;
        return route.fulfill({
            status: 422,
            json: { message: "Fixture rejection." },
        });
    });
    await group.getByRole("button", { name: /Cancel group:/ }).click();
    await expect(page.locator(".world-command-message")).toContainText(
        "Some values were rejected",
    );
    await expect(group.locator("details")).toHaveAttribute("open", "");
    await expect(group.locator(".pending-order-unit")).toHaveCount(2);
    await refresh(page);
    expect(writes).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: "test-results/client/grouped-orders-mobile.png",
    });
});

test("uncertain group cancellation requires review and does not retry on refresh", async ({
    page,
}) => {
    const data = orders();
    let writes = 0;
    await start(page, data);
    await page.locator('[data-tool="orders"]').click();
    const group = page
        .locator(".pending-order-group")
        .filter({ hasText: "Raid → Boreal March" });
    await group.locator("summary").click();
    await page.route("**/nation/divisions:cancel-orders", (route) => {
        writes++;
        return route.abort("failed");
    });
    await group.getByRole("button", { name: /Cancel group:/ }).click();
    await expect(
        page.getByRole("button", {
            name: "I have checked the orders and budget",
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        group.getByRole("button", { name: /Cancel group:/ }),
    ).toBeDisabled();
    await expect(group.locator("details")).toHaveAttribute("open", "");
    await refresh(page);
    await expect(
        group.getByRole("button", { name: /Cancel group:/ }),
    ).toBeDisabled();
    expect(writes).toBe(1);
});

test("group churn and reopening release view resources; French mobile labels remain usable", async ({
    page,
}) => {
    const data = orders();
    await start(page, data);
    const baseline = await page.evaluate(() => window.novusClientDiagnostics());
    for (let i = 0; i < 3; i++) {
        await page.locator('[data-tool="orders"]').click();
        const open = await page.evaluate(() => window.novusClientDiagnostics());
        data.divisions[0].order.target_territory_id = i % 2 ? 157 : 158;
        await refresh(page);
        await expect
            .poll(() => page.evaluate(() => window.novusClientDiagnostics()))
            .toEqual(open);
        await page
            .locator(".world-command-dock")
            .getByRole("button", { name: "Close", exact: true })
            .click();
        await expect
            .poll(() => page.evaluate(() => window.novusClientDiagnostics()))
            .toEqual(baseline);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".game-menu > summary").click();
    await page.locator(".language-selector").selectOption("fr");
    await page.keyboard.press("Escape");
    await page.locator(".ui-edge-handle").click();
    await page.locator('[data-tool="orders"]').click();
    await expect(page.locator(".pending-order-group").first()).toContainText(
        "Déployer",
    );
    await expect(
        page.locator(".pending-order-group").first().getByRole("button"),
    ).toContainText("Annuler le groupe");
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: "test-results/client/grouped-orders-fr-mobile.png",
    });
});

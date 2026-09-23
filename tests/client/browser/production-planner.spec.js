import { test, expect } from "@playwright/test";
import { fixtures } from "../fixtures.js";
import { prepareHud } from "./hud-helpers.js";

test.beforeEach(async ({ page }) => prepareHud(page));
const dialog = (page) =>
    page.getByRole("dialog", {
        name: "National production planner",
        exact: true,
    });
async function open(page) {
    await page.goto("/client?game_id=1");
    await expect(page.locator(".world-canvas")).toBeVisible();
    if (
        (await page.locator(".ui-edge-drawer").getAttribute("data-mobile")) ===
        "true"
    )
        await page.locator(".ui-edge-handle").click();
    await page.locator('button[data-mode="economic"]').click();
    await expect(
        dialog(page).getByRole("button", {
            name: "Apply production plan",
            exact: true,
        }),
    ).toBeEnabled();
}

test("centred compact planner keeps shared forecast, focus, canvas and drafts through refresh and reopening", async ({
    page,
}) => {
    const data = fixtures("/client/gameplay");
    let reads = 0;
    await page.route("**/client/gameplay", (route) => {
        reads++;
        return route.fulfill({ json: data });
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    const modal = dialog(page),
        input = modal.getByLabel("Oil extra / turn", { exact: true });
    await input.fill("2");
    await expect(modal.locator('[data-planner-metric="demand"] dd')).toHaveText(
        "4",
    );
    const rect = await modal.boundingBox();
    expect(rect.width).toBeGreaterThan(900);
    expect(rect.height).toBeLessThan(700);
    expect(Math.abs(rect.x + rect.width / 2 - 720)).toBeLessThan(2);
    await expect(page.locator(".world-command-dock")).toBeHidden();
    await expect(modal.locator(".planner-secondary")).not.toHaveAttribute(
        "open",
    );
    await expect(modal.locator(".planner-advanced")).not.toHaveAttribute(
        "open",
    );
    await input.focus();
    await page.evaluate(() => {
        window.plannerInput = document.querySelector(
            '[data-production-resource="Oil"] input[type=number]',
        );
        window.plannerCanvas = document.querySelector(".world-canvas");
    });
    data.budget.production.Oil = 8;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => reads).toBe(2);
    await expect(
        modal.locator('[data-production-resource="Oil"]'),
    ).toContainText("8 →");
    await expect(input).toHaveValue("2");
    await expect(input).toBeFocused();
    expect(
        await page.evaluate(
            () =>
                plannerInput ===
                    document.querySelector(
                        '[data-production-resource="Oil"] input[type=number]',
                    ) &&
                plannerCanvas === document.querySelector(".world-canvas"),
        ),
    ).toBe(true);
    await page.screenshot({
        path: "test-results/client/production-planner-desktop.png",
    });
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator('button[data-mode="economic"]')).toBeFocused();
    await page.locator('button[data-mode="economic"]').click();
    await expect(input).toHaveValue("2");
    expect(errors).toEqual([]);
});

test("single batch preserves materials, rejection detail and newer in-flight edits", async ({
    page,
}) => {
    const data = fixtures("/client/gameplay"),
        writes = [];
    data.bids.push({
        resource_type: "Material",
        max_quantity: 1250000,
        max_labor_allocation_per_unit: 2147483647,
    });
    let reject = true,
        release;
    await page.route("**/client/gameplay", (route) =>
        route.fulfill({ json: data }),
    );
    await page.route("**/nation/production-plan", async (route) => {
        const body = route.request().postDataJSON();
        writes.push(body);
        if (reject)
            return route.fulfill({
                status: 422,
                json: {
                    message: "Invalid",
                    errors: {
                        bids: [
                            "A complete detailed error <script>unsafe()</script> with territory information.",
                        ],
                    },
                },
            });
        await new Promise((resolve) => {
            release = resolve;
        });
        data.bids = body.bids;
        return route.fulfill({ status: 204 });
    });
    await open(page);
    const modal = dialog(page),
        input = modal.getByLabel("Oil extra / turn", { exact: true }),
        apply = modal.getByRole("button", {
            name: "Apply production plan",
            exact: true,
        });
    await input.fill("2");
    await apply.click();
    const status = modal.locator(".planner-footer .ui-message-text");
    await expect(status).toHaveText("Production plan rejected.");
    await status.hover();
    await expect(page.locator(".ui-tooltip:popover-open")).toContainText(
        "<script>unsafe()</script>",
    );
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible();
    await expect(input).toHaveValue("2");
    expect(writes).toHaveLength(1);
    expect(writes[0].bids).toHaveLength(4);
    expect(
        writes[0].bids.find((bid) => bid.resource_type === "Material")
            .max_quantity,
    ).toBe(1250000);
    expect(writes[0].client_context).toMatchObject({
        game_id: 1,
        nation_id: 7,
        turn_number: 1,
        user_id: 1,
    });
    reject = false;
    await apply.click();
    await expect.poll(() => writes.length).toBe(2);
    await expect(apply).toBeDisabled();
    await input.fill("3");
    release();
    await expect(status).toHaveText("Command accepted.");
    await expect(input).toHaveValue("3");
    await expect(apply).toBeEnabled();
    expect(writes).toHaveLength(2);
});

test("Economy launches the same planner, turn changes clear old drafts without replacing fields", async ({
    page,
}) => {
    let turn = 1;
    await page.route("**/game", (route) =>
        route.fulfill({ json: fixtures("/game", turn) }),
    );
    await page.route("**/client/gameplay", (route) =>
        route.fulfill({ json: fixtures("/client/gameplay", turn) }),
    );
    await page.route("**/game/ready-status", (route) =>
        route.fulfill({ json: fixtures("/game/ready-status", turn) }),
    );
    await page.route("**/territories/turn-infos?*", (route) =>
        route.fulfill({ json: fixtures("/territories/turn-infos", turn) }),
    );
    await page.goto("/client?game_id=1#/economy");
    await page
        .getByRole("button", { name: "Open production planner", exact: true })
        .click();
    const modal = dialog(page),
        input = modal.getByLabel("Oil extra / turn", { exact: true });
    await input.fill("9");
    await page.evaluate(
        () =>
            (window.plannerInput = document.querySelector(
                '[data-production-resource="Oil"] input[type=number]',
            )),
    );
    turn = 2;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(modal).toContainText("Turn changed.");
    await expect(input).toHaveValue("0");
    expect(
        await page.evaluate(
            () =>
                plannerInput ===
                document.querySelector(
                    '[data-production-resource="Oil"] input[type=number]',
                ),
        ),
    ).toBe(true);
});

test("French mobile layout, linked inputs and modal tooltip Escape ordering", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem("no7:locale", "fr"));
    await open(page);
    // Select the actual application language so this also exercises live localization.
    await dialog(page)
        .getByRole("button", { name: "Close", exact: true })
        .click();
    await page.getByLabel("Game menu", { exact: true }).click();
    await page.getByLabel("Language", { exact: true }).selectOption("fr");
    await page.keyboard.press("Escape");
    await page.locator(".ui-edge-handle").click();
    await page.locator('button[data-mode="economic"]').click();
    const modal = page.locator(".production-planner-dialog");
    await expect(modal).toContainText("Planificateur de production nationale");
    const slider = modal.locator(
        '[data-production-resource="Oil"] input[type=range]',
    );
    await slider.fill("2");
    await slider.dispatchEvent("input");
    await expect(
        modal.locator('[data-production-resource="Oil"] input[type=number]'),
    ).toHaveValue("2");
    const help = modal.locator(".planner-context .ui-help");
    await help.click();
    await expect(page.locator(".ui-tooltip:popover-open")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible();
    await expect(page.locator(".ui-tooltip:popover-open")).toHaveCount(0);
    expect(
        await modal.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
        ),
    ).toBe(true);
    await modal
        .getByRole("button", {
            name: "Appliquer le plan de production",
            exact: true,
        })
        .scrollIntoViewIfNeeded();
    await page.screenshot({
        path: "test-results/client/production-planner-mobile-fr.png",
    });
});

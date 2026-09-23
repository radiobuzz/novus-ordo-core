import { test, expect } from "@playwright/test";
import { fixtures } from "../fixtures.js";
import { prepareHud } from "./hud-helpers.js";

test.beforeEach(async ({ page }) => prepareHud(page));

test("mobile drawer opens by tap and swipe, closes with Escape, and compact header stays named", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/client?game_id=1");
    await expect(page.locator(".world-canvas")).toBeVisible();
    const drawer = page.locator(".ui-edge-drawer");
    const handle = page.locator(".ui-edge-handle");
    await expect(drawer).toHaveAttribute("data-open", "false");
    expect(
        await page.locator(".world-mode-rail").evaluate((e) => e.inert),
    ).toBe(true);
    await handle.click();
    await page.locator('[data-mode="military"]').click();
    await page.locator('[data-tool="deploy"]').click();
    await expect(drawer).toHaveAttribute("data-open", "false");
    await expect(page.locator(".world-command-dock")).toBeVisible();
    await page
        .locator(".world-command-dock")
        .getByRole("button", { name: "Close", exact: true })
        .click();
    await expect(page.locator(".world-command-dock")).toBeHidden();
    await handle.hover();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(drawer).toHaveAttribute("data-open", "true");
    await handle.focus();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveAttribute("data-open", "false");
    await expect(
        page.getByRole("button", { name: "News", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole("button", { name: "Ready", exact: true }),
    ).toBeVisible();
    await expect(
        page.getByLabel("Layers · Military", { exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/client/ui-polish-mobile.png" });
    expect(errors).toEqual([]);
});

test("move costs block shortages and rejected commands retain drafts with danger feedback", async ({
    page,
}) => {
    const data = fixtures("/client/gameplay");
    data.definitions.divisions.find(
        (d) => d.division_type === "Infantry",
    ).attack_costs = { Oil: 11 };
    await page.route("**/client/gameplay", (r) => r.fulfill({ json: data }));
    await page.route("**/divisions/move-orders", (r) =>
        r.fulfill({
            status: 422,
            json: { message: "Order rejected: destination changed." },
        }),
    );
    await page.goto("/client?game_id=1");
    await page.locator('[data-mode="military"]').click();
    await page.evaluate(() => (location.hash = "#/world?territory=156"));
    await page.getByLabel("Select division 11", { exact: true }).check();
    await page
        .getByRole("button", { name: "Move / attack", exact: true })
        .click();
    await page.getByText("Choose from a list", { exact: true }).click();
    const destination = page.getByLabel("Destination territory", {
        exact: true,
    });
    const send = page.getByRole("button", {
        name: "Send move / attack orders",
        exact: true,
    });
    await destination.selectOption("158");
    await expect(page.locator('[data-resource-cost="Oil"]')).toContainText(
        "11 required",
    );
    await expect(page.locator('[data-resource-cost="Oil"]')).toHaveAttribute(
        "data-tone",
        "danger",
    );
    await expect(send).toBeDisabled();
    await destination.selectOption("157");
    await expect(page.locator('[data-resource-cost="Oil"]')).toContainText(
        "0 required",
    );
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.locator(".world-command-message")).toHaveAttribute(
        "data-tone",
        "danger",
    );
    await expect(destination).toHaveValue("157");
});

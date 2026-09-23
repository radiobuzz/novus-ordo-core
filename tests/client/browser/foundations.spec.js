import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    await page.goto("/dev-panel/ui-foundations");
});

test("native labels, descriptions, safe values and distinct states", async ({
    page,
}) => {
    await expect(page.getByLabel("World name", { exact: true })).toHaveValue(
        "Archipelago",
    );
    const invalid = page.getByLabel("Validation example");
    await expect(invalid).toHaveAttribute("aria-invalid", "true");
    await expect(invalid).toHaveCSS("border-top-color", "rgb(229, 163, 153)");
    await expect(invalid).toHaveAttribute(
        "aria-describedby",
        "sample-invalid-help sample-invalid-error",
    );
    await expect(page.getByLabel("Read-only identity")).toHaveAttribute(
        "readonly",
        "",
    );
    await expect(page.getByLabel("Read-only identity")).toHaveCSS(
        "border-top-style",
        "dashed",
    );
    await expect(page.getByLabel("Disabled control")).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "Unavailable", exact: true }),
    ).toBeDisabled();
    await expect(
        page.getByRole("button", { name: "Pending sample" }),
    ).toHaveAttribute("aria-busy", "true");
    await expect(
        page.getByRole("link", { name: "Jump to fields" }),
    ).toHaveAttribute("href", "#fields");
    const toggle = page.getByRole("button", { name: "Toggle selected state" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).not.toHaveCSS("box-shadow", "none");
    await expect(page.locator(".ui-metric-value")).toHaveText([
        "24",
        "6 / 8",
        "0",
        "—",
    ]);
    const ids = await page
        .locator("[id]")
        .evaluateAll((nodes) => nodes.map((node) => node.id));
    expect(new Set(ids).size).toBe(ids.length);
    await page
        .getByLabel("Independent field A")
        .fill("<script>alert(1)</script>");
    await expect(page.getByLabel("Independent field B")).toHaveValue(
        "Second instance",
    );
});

test("native validity and pending guard prevent duplicate local submissions without requests", async ({
    page,
}) => {
    const requests = [];
    page.on("request", (request) => {
        // Bundled thumbnail loads are presentation assets, not form/API submissions.
        if (request.resourceType() !== "image") requests.push(request.url());
    });
    await page.clock.install();
    const save = page.getByRole("button", { name: "Simulate local save" });
    await page.getByLabel("Quantity", { exact: true }).fill("11");
    await save.click();
    await expect(save).toBeEnabled();
    await expect(page.getByRole("status")).toContainText(
        "Synthetic samples only",
    );
    await page.getByLabel("Quantity", { exact: true }).fill("5");
    await save.click();
    await expect(save).toBeDisabled();
    await expect(save).toHaveAttribute("aria-busy", "true");
    await page.locator("form").evaluate((form) => form.requestSubmit());
    await page.clock.runFor(701);
    await expect(save).toBeEnabled();
    await expect(page.getByRole("status")).toContainText("completed 1 time(s)");
    expect(requests).toEqual([]);
});

test("keyboard, theme propagation, long labels and mobile layout", async ({
    page,
}) => {
    await page.getByLabel("Sample language").focus();
    await expect(page.getByLabel("Sample language")).toBeFocused();
    await expect(page.getByLabel("Sample language")).toHaveCSS(
        "outline-style",
        "solid",
    );
    const accent = page.locator('.ui-panel[data-tone="accent"]').first();
    const original = await accent.evaluate(
        (node) => getComputedStyle(node).borderTopColor,
    );
    await page.getByRole("button", { name: "Try alternate accent" }).click();
    await expect(accent).not.toHaveCSS("border-top-color", original);
    await expect(
        page.getByRole("button", { name: "Primary command", exact: true }),
    ).toHaveCSS("border-top-color", "rgb(173, 221, 224)");
    await page
        .getByLabel("World name", { exact: true })
        .fill("Preserved value");
    await page.getByLabel("Sample language").focus();
    await page.getByLabel("Sample language").selectOption("fr");
    await expect(
        page.getByLabel("Nom complet du monde expérimental"),
    ).toHaveValue("Preserved value");
    await expect(page.getByLabel("Sample language")).toBeFocused();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: "/tmp/no7-foundations-mobile.png",
        fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
        path: "/tmp/no7-foundations-desktop.png",
        fullPage: true,
    });
});

test("repeated temporary controls release every scope and listener", async ({
    page,
}) => {
    const baseline = await page.evaluate(() =>
        window.novusFoundationDiagnostics(),
    );
    for (let i = 0; i < 20; i++) {
        await page
            .getByRole("button", {
                name: "Mount temporary control",
                exact: true,
            })
            .click();
        await page
            .getByRole("button", { name: "Temporary action", exact: true })
            .click();
        await page
            .getByRole("button", {
                name: "Unmount temporary control",
                exact: true,
            })
            .click();
    }
    expect(
        await page.evaluate(() => window.novusFoundationDiagnostics()),
    ).toEqual(baseline);
    await expect(
        page.getByRole("button", { name: "Temporary action", exact: true }),
    ).toHaveCount(0);
});

test("range exact values, keyboard, dialog cancellation and cleanup", async ({
    page,
}) => {
    const input = page.getByLabel("Sample range", { exact: true });
    const slider = page.getByLabel("Sample range slider", { exact: true });
    await input.fill("72");
    await expect(slider).toHaveValue("72");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(input).toHaveValue("73");
    await input.fill("101");
    expect(await input.evaluate((node) => node.validity.valid)).toBe(false);
    const baseline = await page.evaluate(() =>
        window.novusFoundationDiagnostics(),
    );
    const trigger = page.getByRole("button", {
        name: "Try confirmation dialog",
        exact: true,
    });
    for (let i = 0; i < 5; i++) {
        await trigger.click();
        await expect(
            page.getByRole("button", { name: "Cancel", exact: true }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
    }
    await trigger.click();
    await page
        .getByRole("button", { name: "Confirm sample", exact: true })
        .click();
    await expect(page.getByRole("status")).toContainText(
        "Local sample confirmed",
    );
    expect(
        await page.evaluate(() => window.novusFoundationDiagnostics()),
    ).toEqual(baseline);
});

test("image choices remain inspectable when unavailable and support keyboard selection", async ({
    page,
}) => {
    const badged = page
        .locator(".ui-image-choice")
        .filter({ hasText: "Sample Armored" });
    await expect(badged.locator(".ui-image-choice-badge")).toHaveCount(2);
    await expect(badged).toHaveAccessibleName(
        /4 available in this synthetic example.*2 selected in this synthetic example/,
    );
    const first = page.getByRole("button", {
        name: "Sample Infantry Synthetic choice",
        exact: true,
    });
    const unavailable = page.getByRole("button", {
        name: "Sample Fighter Unavailable sample — inspectable",
        exact: true,
    });
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(unavailable).toBeEnabled();
    await unavailable.focus();
    await page.keyboard.press("Enter");
    await expect(unavailable).toHaveAttribute("aria-pressed", "true");
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("status")).toContainText(
        "Local image selection only",
    );
});

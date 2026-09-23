// Existing gameplay journeys start after the welcome briefing; hud.spec tests the popup itself.
export async function prepareHud(page) {
    await page.addInitScript(() =>
        localStorage.setItem(
            'no7:v1:user-1:game-1:briefing',
            JSON.stringify({ version: 1, value: { lastKey: '1:7:1' } }),
        ),
    );
}

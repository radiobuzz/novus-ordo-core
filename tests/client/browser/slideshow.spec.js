import { test, expect } from '@playwright/test';

const image = (number) => ({
    id: `slide-${number}`,
    src: `res/bundled/entry/2026-09-26-0${number}-0a.png`,
    url: `/res/bundled/entry/2026-09-26-01-0a.png`,
    name: `Image ${number}`,
    duration_ms: 5000,
    transition: 'fade',
    transition_ms: 1800,
    effect: 'none',
    focus_x: 50,
    focus_y: 50,
});

test('administration edits, previews, saves and publishes the global homepage presentation', async ({
    page,
}) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let revision = 0;
    let draft = {
        version: 1,
        fallback: 'res/bundled/entry/2026-09-26-static.png',
        fallback_url: '/res/bundled/entry/2026-09-26-static.png',
        audio: {
            src: 'res/bundled/entry/intro.mp3',
            url: '/res/bundled/entry/intro.mp3',
            name: 'intro.mp3',
            loop: true,
        },
        slides: [1, 2, 3].map(image),
    };
    let published = structuredClone(draft);
    let publishedAt = null;
    const response = () => ({
        revision,
        draft,
        published,
        published_at: publishedAt,
        effects: ['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'drift-up', 'drift-down'],
        transitions: ['fade', 'cut'],
        limits: { slides: 40, image_mb: 15, audio_mb: 50 },
    });
    await page.route('**/client/admin/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path.endsWith('/games'))
            return route.fulfill({
                json: { active_game_ids: [1], games: [{ game_id: 1, turn_number: 2, active: true }] },
            });
        if (path.endsWith('/slideshow/assets/image'))
            return route.fulfill({
                status: 201,
                json: {
                    src: 'var/entry-slideshow-11111111-1111-1111-1111-111111111111.png',
                    url: '/res/bundled/entry/2026-09-26-02-0b.png',
                    name: 'Uploaded scene',
                },
            });
        if (path.endsWith('/slideshow/assets/audio'))
            return route.fulfill({
                status: 201,
                json: {
                    src: 'var/entry-slideshow-22222222-2222-2222-2222-222222222222.mp3',
                    url: '/res/bundled/entry/intro.mp3',
                    name: 'New score',
                },
            });
        if (path.endsWith('/slideshow/publish')) {
            published = structuredClone(draft);
            publishedAt = new Date().toISOString();
            revision++;
            return route.fulfill({ json: response() });
        }
        if (path.endsWith('/slideshow') && request.method() === 'POST') {
            draft = { ...request.postDataJSON().configuration };
            draft.fallback_url = '/res/bundled/entry/2026-09-26-static.png';
            draft.audio.url = '/res/bundled/entry/intro.mp3';
            draft.slides = draft.slides.map((slide) => ({ ...slide, url: image(1).url }));
            revision++;
            return route.fulfill({ json: response() });
        }
        if (path.endsWith('/slideshow')) return route.fulfill({ json: response() });
        return route.fulfill({ status: 404, json: {} });
    });

    await page.goto('/client/admin#/slideshow?game=1');
    await expect(page.getByRole('heading', { name: 'Homepage slideshow' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Slides · 3' })).toBeVisible();
    await page.getByLabel('Camera movement').selectOption('zoom-in');
    await page.getByLabel('Hold time (seconds)').fill('6.5');
    await expect(page.getByText('Unsaved draft changes')).toBeVisible();

    await page.getByLabel('Add slideshow images').setInputFiles({
        name: 'scene.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fixture'),
    });
    await expect(page.getByRole('heading', { name: 'Slides · 4' })).toBeVisible();
    await page.getByLabel('Replace music').setInputFiles({
        name: 'score.mp3',
        mimeType: 'audio/mpeg',
        buffer: Buffer.from('fixture'),
    });
    await expect(page.getByText('New score')).toBeVisible();

    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('draft saved');
    expect(draft.slides[0].effect).toBe('zoom-in');
    expect(draft.slides[0].duration_ms).toBe(6500);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('button', { name: 'Publish slideshow', exact: true }).click();
    await expect(page.locator('.admin-notice')).toContainText('published');
    expect(published.slides).toHaveLength(4);
    await page.screenshot({ path: '/tmp/no7-slideshow-editor.png', fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});

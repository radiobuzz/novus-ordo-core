import test from 'node:test';
import assert from 'node:assert/strict';
import en from '../../resources/js/client/strings/en.js';
import fr from '../../resources/js/client/strings/fr.js';
import { NationCreationProcess } from '../../resources/js/client/features/nation-creation/NationCreationProcess.js';
import { AudioService } from '../../resources/js/client/services/AudioService.js';
import { createTransport } from '../../resources/js/client/api/createTransport.js';
const options = {
    user_id: 1,
    game_id: 1,
    required_territories: 2,
    suitable_ids: [1, 2, 3],
    territories: [
        { territory_id: 1, connected_land_territory_ids: [2] },
        { territory_id: 2, connected_land_territory_ids: [1] },
        { territory_id: 3, connected_land_territory_ids: [] },
    ],
};
test('English/French tables have identical keys and placeholders', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
    for (const key of Object.keys(en))
        assert.deepEqual(
            [...en[key].matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
            [...fr[key].matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
            key,
        );
});
test('wizard guards deep links, preserves files and drafts, validates adjacency, isolates instances', async () => {
    const a = new NationCreationProcess(options, {}),
        b = new NationCreationProcess(options, {});
    assert.equal(a.goTo('review'), false);
    assert.equal(a.stepId, 'identity');
    const file = new File(['x'], 'flag.png', { type: 'image/png' });
    a.updateDraft('identity', { nation_name: 'Aurelia', nation_flag: file });
    a.next();
    a.updateDraft('leader', { leader_name: 'Aster' });
    a.next();
    a.updateDraft('homeland', [1, 3]);
    assert.equal(a.next(), false);
    a.updateDraft('homeland', [1, 2]);
    assert.equal(a.next(), true);
    a.back();
    a.goTo('identity');
    assert.equal(a.draft.identity.nation_flag, file);
    assert.equal(b.draft.identity.nation_name, '');
    await a.dispose();
    await b.dispose();
});
test('uncertain submission reconciles rather than repeats and duplicate clicks are ignored', async () => {
    let calls = 0,
        resolve;
    const p = new NationCreationProcess(options, {
        submit: () => {
            calls++;
            return new Promise((r) => (resolve = r));
        },
    });
    p.updateDraft('identity', { nation_name: 'Aurelia' });
    p.updateDraft('leader', { leader_name: 'Aster' });
    p.updateDraft('homeland', [1, 2]);
    const pending = p.submit();
    await p.submit();
    assert.equal(calls, 1);
    resolve();
    await pending;
    assert.equal(p.status, 'complete');
    await p.dispose();
    const q = new NationCreationProcess(options, {
        submit: async () => {
            throw { uncertain: true };
        },
        load: async () => ({ ...options, status: 'FinishedSetup' }),
    });
    q.updateDraft('identity', { nation_name: 'Aurelia' });
    q.updateDraft('leader', { leader_name: 'Aster' });
    q.updateDraft('homeland', [1, 2]);
    await q.submit();
    assert.equal(q.status, 'complete');
    await q.dispose();
});
test('multipart preserves browser boundary, current CSRF and chosen locale', async () => {
    const body = new FormData();
    body.append('nation_name', 'Aurelia');
    let token = 'a';
    const request = createTransport({
        baseUrl: 'https://example.test',
        getCsrfToken: () => token,
        getLocale: () => 'fr',
        fetchImpl: async (url, init) => {
            assert.equal(init.body, body);
            assert.equal(init.headers['Content-Type'], undefined);
            assert.equal(init.headers['X-CSRF-TOKEN'], 'b');
            assert.equal(init.headers['X-Client-Locale'], 'fr');
            return new Response(null, { status: 204 });
        },
    });
    token = 'b';
    await request({ path: '/create-nation', method: 'POST', body });
});
test('late audio play cannot restart music after leaving login; eligibility never changes mute preference', async () => {
    let resolve,
        paused = 0,
        stored = { muted: false, volume: 0.3 };
    const player = {
        paused: true,
        play: () => new Promise((r) => (resolve = r)),
        pause: () => paused++,
        removeAttribute() {},
        load() {},
    };
    const audio = new AudioService('intro.mp3', { read: () => stored, write: (v) => (stored = v) }, player);
    audio.setEligible(true);
    const playing = audio.play();
    audio.setEligible(false);
    resolve();
    await playing;
    assert.ok(paused > 0);
    assert.notEqual(audio.status, 'playing');
    assert.equal(stored.muted, false);
    await audio.dispose();
});

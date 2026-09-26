import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { TEMPLATES, createTemplate } from '../../resources/js/identity-lab/templates.js';
import { upgradeRecipe, validateRecipe } from '../../resources/js/identity-lab/recipe.js';
import { SYMBOLS } from '../../resources/js/identity-lab/catalog.js';
import { addSymbol } from '../../resources/js/identity-lab/generator.js';
import { NationSetupService } from '../../resources/js/client/services/NationSetupService.js';
import { NationCreationProcess } from '../../resources/js/client/features/nation-creation/NationCreationProcess.js';

function serverAccepts(sources) {
    const result = spawnSync(
        'php8.3',
        [
            '-r',
            `
        require 'app/Services/FlagDesign.php';
        $results = [];
        foreach (json_decode(stream_get_contents(STDIN), true) as $json) {
            try { App\\Services\\FlagDesign::parse($json); $results[] = true; }
            catch (InvalidArgumentException) { $results[] = false; }
        }
        echo json_encode($results);
    `,
        ],
        { input: JSON.stringify(sources), encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('server accepts all editor templates, both versions and all bundled/imported symbols', () => {
    const recipes = TEMPLATES.map((id) => createTemplate(id));
    recipes.push(
        ...recipes.map((recipe) => {
            const legacy = structuredClone(recipe);
            legacy.schemaVersion = 1;
            legacy.rendererVersion = 'flag-canvas-v1';
            delete legacy.customAssets;
            for (const layer of legacy.flag.layers) delete layer.role;
            return legacy;
        }),
    );
    recipes.push(...SYMBOLS.map(({ id }) => addSymbol(upgradeRecipe(createTemplate('nordic')), id)));
    const custom = upgradeRecipe(createTemplate('nordic'));
    custom.customAssets.push({
        id: 'custom-fixture',
        name: 'Fixture',
        viewBox: [0, 0, 100, 100],
        paths: [
            {
                d: 'M0 0L100 0L50 100Z',
                matrix: [1, 0, 0, 1, 0, 0],
                fill: true,
                stroke: false,
                strokeWidth: 0,
                fillRule: 'nonzero',
                opacity: 1,
            },
        ],
    });
    recipes.push(addSymbol(custom, 'custom-fixture'));
    recipes.forEach(validateRecipe);
    assert.deepEqual(
        serverAccepts(recipes.map((r) => JSON.stringify(r))),
        recipes.map(() => true),
    );
});

test('server rejects unsupported, oversized, malformed and executable recipe content', () => {
    const altered = (change) => {
        const r = upgradeRecipe(createTemplate('nordic'));
        change(r);
        return JSON.stringify(r);
    };
    const invalid = [
        '{',
        'null',
        '[]',
        '"x"',
        ' '.repeat(500001),
        altered((r) => (r.schemaVersion = 3)),
        altered((r) => (r.flag.width = 300)),
        altered((r) => (r.flag.layers[0].scale = 99)),
        altered((r) => r.flag.layers.push(r.flag.layers[0])),
        altered((r) => (r.flag.layers = Array(65).fill(r.flag.layers[0]))),
        altered((r) => (r.flag.background = 'url(https://example.test/x)')),
        altered((r) => (r.palette.primary = '#abc')),
        altered((r) => (r.flag.layers[0].geometry.href = 'https://example.test/x')),
        altered((r) => (r.customAssets = {})),
        altered((r) => (r.name = '😀'.repeat(41))),
        altered(
            (r) =>
                (r.customAssets = [
                    {
                        id: 'custom-bad',
                        name: 'Bad',
                        viewBox: [0, 0, 100, 100],
                        paths: [
                            {
                                d: '<script/>',
                                matrix: [1, 0, 0, 1, 0, 0],
                                fill: true,
                                stroke: false,
                                strokeWidth: 0,
                                fillRule: 'nonzero',
                                opacity: 1,
                            },
                        ],
                    },
                ]),
        ),
    ];
    assert.deepEqual(
        serverAccepts(invalid),
        invalid.map(() => false),
    );
});

test('recipe and PNG stay together through a rejected submission and multipart transport', async () => {
    const options = {
        required_territories: 1,
        suitable_ids: [1],
        territories: [{ territory_id: 1, connected_land_territory_ids: [] }],
    };
    const recipe = createTemplate('nordic');
    const file = new File(['png fixture'], 'flag.png', { type: 'image/png' });
    let submitted;
    const service = new NationSetupService({
        storeNation: async ({ body }) => {
            submitted = body;
            throw { category: 'validation', fields: { flag_design: ['Invalid recipe fixture'] } };
        },
    });
    const process = new NationCreationProcess(options, service);
    process.updateDraft('identity', { nation_name: 'Fixture', nation_flag: file, flag_design: recipe });
    process.updateDraft('leader', { leader_name: 'Leader' });
    process.updateDraft('homeland', [1]);
    await process.submit();
    assert.equal(process.stepId, 'identity');
    assert.equal(process.draft.identity.nation_flag, file);
    assert.equal(process.draft.identity.flag_design, recipe);
    assert.deepEqual(JSON.parse(submitted.get('flag_design')), recipe);
    assert.equal(await submitted.get('nation_flag').text(), 'png fixture');
    await process.dispose();
    assert.equal(process.draft.identity.flag_design, null);
});

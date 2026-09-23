import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { productionPlanPreview } from '../../resources/js/client/services/production.js';

const result = JSON.parse(
    execFileSync('php8.3', ['tests/client/production-plan-engine.php'], {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
    }),
);
for (const { name, input, bids, output } of result.cases) {
    const plan = productionPlanPreview(input, bids);
    for (const resource of Object.keys(plan.rows)) {
        if (!input.production_planning.resources[resource].produced_by_labor) continue;
        assert.ok(
            Math.abs(
                plan.rows[resource].production / input.definitions.labor_per_unit -
                    output.production[resource],
            ) <= 0.000002,
            `${name} ${resource}: preview ${plan.rows[resource].production / input.definitions.labor_per_unit} != engine ${output.production[resource]}`,
        );
    }
    for (const facility of plan.facilities) {
        const actual = output.labor_facility_allocations.find(
            (f) => f.territory_id === facility.territory_id && f.resource_type === facility.resource_type,
        );
        assert.equal(
            facility.allocation,
            actual.allocation,
            `${name}: ${facility.territory_id} ${facility.resource_type} allocation`,
        );
    }
}
console.log(
    `PASS: ${result.checks.join(', ')}; ${result.cases.length} raw territorial forecast/engine comparisons. Isolated database only.`,
);

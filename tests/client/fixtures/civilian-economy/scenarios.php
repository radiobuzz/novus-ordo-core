<?php

declare(strict_types=1);

/** Illustrative game quantities, explicit founding stocks, no connection to live game defaults. */
$resource = static fn ($price, $wage, $workers, $need, $priority, $inputs = []) => [
    'kind' => 'stock', 'price' => $price, 'wage' => $wage, 'workers' => $workers,
    'capital_cost' => '10', 'construction_workers' => '1',
    'need_per_person' => $need, 'priority' => $priority, 'inputs' => $inputs,
];
$stock = static fn ($quantity, $cost) => ['quantity' => $quantity, 'cost' => $cost];
$site = static fn ($owner, $resource, $capacity, $maintenance) => [
    'owner' => $owner, 'resource' => $resource, 'capacity' => $capacity,
    'condition' => '1', 'maintenance_per_capacity' => $maintenance,
];
$base = [
    'description' => 'Supplied peaceful region: civilian consumption, equipment replacement and fixed public budgets.',
    'resources' => [
        'food' => $resource('2', '1', '0.2', '1', 0),
        'copper' => $resource('4', '1', '0.5', '0', 3),
        'equipment' => $resource('10', '3', '0.5', '0', 2, ['copper' => '0.5']),
        'household_goods' => $resource('10', '4', '0.5', '0.1', 1, ['copper' => '0.5']),
    ],
    'state' => [
        'season' => 0,
        'accounts' => [
            'government' => ['kind' => 'government', 'cash' => '400', 'tax_rate' => '0.1'],
            'households' => ['kind' => 'household', 'cash' => '400', 'treasury' => 'government'],
            'farm' => ['kind' => 'producer', 'cash' => '300', 'treasury' => 'government'],
            'mine' => ['kind' => 'producer', 'cash' => '100', 'treasury' => 'government'],
            'machine_shop' => ['kind' => 'producer', 'cash' => '100', 'treasury' => 'government'],
            'goods_factory' => ['kind' => 'producer', 'cash' => '200', 'treasury' => 'government'],
        ],
        'inventories' => [
            'farm' => ['food' => $stock('80', '80'), 'equipment' => $stock('1', '10')],
            'mine' => ['copper' => $stock('10', '10'), 'equipment' => $stock('0.4', '4')],
            'machine_shop' => ['equipment' => $stock('3.2', '16'), 'copper' => $stock('1', '4')],
            'goods_factory' => ['household_goods' => $stock('10', '60'), 'copper' => $stock('5', '20'), 'equipment' => $stock('0.4', '4')],
        ],
        'territories' => [
            'region' => ['government' => 'government', 'household' => 'households', 'population' => 100, 'workforce' => '80',
                'potential' => ['food' => '100', 'copper' => '20', 'equipment' => '10', 'household_goods' => '20'],
                'public_service_capacity' => '10', 'subsistence' => ['food' => ['capacity' => '20', 'workers' => '0.2']]],
        ],
        'sites' => [
            'farm' => $site('farm', 'food', '100', '0.01'),
            'mine' => $site('mine', 'copper', '20', '0.02'),
            'machine_shop' => $site('machine_shop', 'equipment', '10', '0.02'),
            'goods_factory' => $site('goods_factory', 'household_goods', '20', '0.02'),
        ],
    ],
    'policy' => ['tax_rate' => '0.1', 'support_per_person' => '0.08', 'public_service_budget' => '20'],
    'rules' => ['nutrition' => 'food', 'maintenance_resource' => 'equipment', 'maintenance_workers' => '1', 'maintenance_wage' => '2',
        'public_service_per_person' => '0.1', 'public_service_wage' => '2', 'condition_decay' => '0.08', 'condition_recovery' => '0.04',
        'distribution_ratio' => '1', 'reserve_seasons' => '1'],
    'shocks' => [],
];
$poor = $base;
$poor['description'] = 'Subsistence-heavy tundra hypothesis: local food activities plus a small paid economy; no imports or subsidy from another region.';
$poor['state']['territories']['region']['subsistence']['food'] = ['capacity' => '70', 'workers' => '0.5'];
$poor['state']['sites']['farm']['capacity'] = '35';
$poor['state']['territories']['region']['potential']['food'] = '35';
$poor['state']['inventories']['farm']['food'] = $stock('30', '30');
$poor['state']['inventories']['farm']['equipment'] = $stock('0.35', '3.5');
$poor['policy'] = ['tax_rate' => '0.15', 'support_per_person' => '0.07', 'public_service_budget' => '20'];
$shock = $base;
$shock['description'] = 'Copper production unavailable during seasons 8–13; installed assets and money are not removed or reseeded.';
$shock['shocks'] = [8 => ['site' => 'mine', 'availability' => '0'], 14 => ['site' => 'mine', 'availability' => '1']];
$tax = $base;
$tax['description'] = 'Punitive 65% income/profit tax with unchanged public spending: treasury accumulation can starve civilian purchasing power.';
$tax['policy']['tax_rate'] = '0.65';
$budget = $base;
$budget['description'] = 'Unaffordable support and services: support has explicit funding priority; no loans or cash top-ups cover unmet promises.';
$budget['policy']['support_per_person'] = '5';
$budget['policy']['public_service_budget'] = '1000';

return ['supplied' => $base, 'subsistence' => $poor, 'supply-shock' => $shock, 'high-tax' => $tax, 'overbudget' => $budget];

<?php

/** Explicit fixture seeds, not balanced game defaults or a competing resource catalogue. */
return [
    'resources' => [
        'ore' => ['kind' => 'stock', 'price' => '10', 'wage' => '6', 'workers' => '1', 'capital_cost' => '10', 'construction_workers' => '1'],
        'food' => ['kind' => 'stock', 'price' => '10', 'wage' => '6', 'workers' => '1', 'capital_cost' => '10', 'construction_workers' => '1'],
    ],
    'state' => [
        'accounts' => [
            'government' => ['kind' => 'government', 'cash' => '200', 'tax_rate' => '0.2'],
            'producers' => ['kind' => 'producer', 'cash' => '84', 'treasury' => 'government'],
            'households' => ['kind' => 'household', 'cash' => '0', 'treasury' => 'government'],
            'lender' => ['kind' => 'lender', 'cash' => '1000'],
        ],
        'territories' => [
            'core' => [
                'government' => 'government', 'workforce' => '30',
                'potential' => ['ore' => '30', 'food' => '30'],
                'capacity' => ['producers' => ['ore' => '14', 'food' => '14']],
                'background_capacity' => ['producers' => '2'],
            ],
        ],
    ],
];

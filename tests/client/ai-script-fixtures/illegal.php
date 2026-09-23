<?php
return new class {
    public function decide(array $view, array $memory, array $settings, callable $tools): array {
        $plan = $tools->emptyPlan('Illegal fixture.');
        $plan['bids'] = array_map(fn ($r) => ['resource_type' => $r, 'max_quantity' => 123000000,
            'max_labor_allocation_per_unit' => 2147483647], ['Food', 'Material', 'Ore', 'Oil']);
        $plan['orders'] = [['division_id' => 2147483647, 'destination_territory_id' => 2147483647, 'path_territory_ids' => []]];
        $plan['memory'] = ['should_never_commit' => true];
        return $plan;
    }
};

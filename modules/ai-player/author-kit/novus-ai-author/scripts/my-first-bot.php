<?php
/** @ai-name My first bot */
// Rename this file to your own stable lowercase-hyphenated identifier.
return new class {
    public function decide(array $view, array $memory, array $settings, callable $tools): array {
        $plan = $tools->emptyPlan('Holding position while saving resources.');
        $plan['memory'] = $memory;
        $plan['memory']['turns_seen'] = ($memory['turns_seen'] ?? 0) + 1;
        // This example intentionally makes no military/economic changes.
        // Fill bids/deployments/orders using references/api.md and the snapshot.
        // You may use $tools->forecast(...) to evaluate candidate production bids.
        return $plan;
    }
};

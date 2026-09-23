<?php
/** @ai-name Fixture holding */
return new class {
    public function decide(array $view, array $memory, array $settings, callable $tools): array {
        $plan = $tools->emptyPlan('Fixture holds.');
        $plan['memory'] = ['count' => ($memory['count'] ?? 0) + 1];
        return $plan;
    }
};

<?php
return new class {
    public function decide(array $view, array $memory, array $settings, callable $tools): array {
        sleep(10);
        return $tools->emptyPlan();
    }
};

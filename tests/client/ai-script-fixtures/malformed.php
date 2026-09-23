<?php
return new class {
    public function decide(array $view, array $memory, array $settings, callable $tools): array {
        return ['invented_orders' => ['conquer_everything' => true]];
    }
};

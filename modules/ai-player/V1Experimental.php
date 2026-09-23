<?php

namespace ExperimentalAI;

/** Compatibility for existing policy checks; the selectable script owns all strategy. */
final class V1Experimental
{
    public function decide(array $view, array $memory, array $settings, callable $forecast): array {
        return (require __DIR__ . '/scripts/experimental-v1.php')->decide($view, $memory, $settings, $forecast);
    }
}

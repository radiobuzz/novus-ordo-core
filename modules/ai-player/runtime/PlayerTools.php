<?php

namespace ExperimentalAI;

use App\Domain\ProductionForecast;

/** Pure helpers over the supplied observation; no framework, database or HTTP dependency. */
final class PlayerTools
{
    public function __construct(private array $view) {}

    public function __invoke(array $planning, array $pools, array $bids, array $production = []): array {
        return $this->forecast($planning, $pools, $bids, $production);
    }
    public function forecast(array $planning, array $pools, array $bids, array $production = []): array {
        return ProductionForecast::calculate($planning, $pools, $bids, $production);
    }
    public function battleLogs(?int $turn = null): array {
        return $turn === null ? ($this->view['battle_logs'] ?? [])
            : array_values(array_filter($this->view['battle_logs'] ?? [], fn ($log) => $log['turn_number'] === $turn));
    }
    public function emptyPlan(string $explanation = 'No changes this turn.'): array {
        return ['bids' => [], 'deployments' => [], 'orders' => [], 'disband' => [],
            'cancel_orders' => [], 'cancel_deployments' => [], 'memory' => [], 'explanation' => $explanation];
    }
}

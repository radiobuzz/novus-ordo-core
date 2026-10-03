<?php

namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;

/** Explain a verified annexation/workforce blocker without changing settlement. */
final class MaintenanceWarnings {
    public static function explain(array $result, array $newlyAnnexed): array {
        $report = $result['report'];
        $infrastructure = $report['infrastructure'];
        $requested = '0';
        $failed = ['maintenance_shortfall' => [], 'infrastructure_shortfall' => [], 'productive_maintenance_shortfall' => []];
        foreach ($infrastructure as $id => $row) {
            $requested = Q::add($requested, $row['requested']);
            if (Q::cmp($row['maintenance_paid'], $row['maintenance']) < 0) $failed['maintenance_shortfall'][] = (string) $id;
            if (Q::cmp($row['paid'], $row['requested']) < 0) $failed['infrastructure_shortfall'][] = (string) $id;
        }
        foreach ($report['civilian']['maintenance'] ?? [] as $row)
            if (Q::cmp($row['delivered'], $row['required']) < 0) $failed['productive_maintenance_shortfall'][] = (string) $row['territory'];
        // Never claim sufficient funding from a positive closing treasury alone.
        if (Q::cmp($report['infrastructure_budget'], $requested) < 0) return $result['warnings'];
        $explained = [];
        foreach ($newlyAnnexed as $id) {
            $id = (string) $id;
            $territory = $result['opening_territories'][$id] ?? null;
            $row = $infrastructure[$id] ?? null;
            if (!$territory || !$row || $territory['population'] <= 0 || Q::cmp($territory['workforce'], '0') !== 0) continue;
            if (Q::cmp($row['requested'], Q::add($row['maintenance'], $row['improvement'])) < 0) continue;
            if (!array_filter($failed, fn ($ids) => in_array($id, $ids, true))) continue;
            $explained[] = $id;
        }
        if (!$explained) return $result['warnings'];
        $warnings = array_map(fn ($id) => ['type' => 'annexed_maintenance_no_workforce', 'territory_id' => (int) $id], $explained);
        foreach ($result['warnings'] as $warning) {
            $affected = $failed[$warning['type']] ?? [];
            // Retain a general warning if other territories have an unexplained shortfall.
            if (!$affected || array_diff($affected, $explained)) $warnings[] = $warning;
        }
        return $warnings;
    }
}

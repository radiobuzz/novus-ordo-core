<?php
namespace App\Domain\Economy;
use App\Domain\Resources\Quantity as Q;

/** Explain a verified annexation/workforce blocker without changing settlement or hiding other causes. */
final class MaintenanceWarnings {
    public static function explain(array $result, array $newlyAnnexed): array {
        $annexed = array_fill_keys(array_map('strval',$newlyAnnexed),true);
        return array_map(function ($warning) use ($result,$annexed) {
            if ($warning['type'] !== 'infrastructure_maintenance_shortfall') return $warning;
            $id = (string)$warning['territory_id'];
            $t = $result['opening_territories'][$id] ?? null;
            $r = $result['report']['infrastructure'][$id] ?? null;
            if (!isset($annexed[$id]) || !$t || !$r || $t['population'] <= 0 || Q::cmp($t['workforce'],'0') !== 0
                || Q::cmp($r['maintenance_allocation'],$r['maintenance']) < 0) return $warning;
            return ['type'=>'annexed_maintenance_no_workforce','territory_id'=>(int)$id];
        }, $result['warnings']);
    }
}

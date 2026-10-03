<?php
namespace App\Services;

use App\Models\{Nation, Turn};
use App\ReadModels\EconomicHistoryInfo;
use Illuminate\Support\Facades\DB;

final class EconomicHistoryService
{
    private function economy(array $report): array {
        $keys = ['treasury_inflows','treasury_outflows','opening_treasury','closing_treasury','command_costs','response_costs','military_costs_paid','programs','government_purchases','public_development','private_development','support_paid','tax_receipts','earned_income','disposable_income_estimate','indicators','fiscal','industries'];
        $out = array_intersect_key($report, array_flip($keys));
        $out['infrastructure'] = array_map(fn ($row) => ['paid' => $row['paid']], $report['infrastructure'] ?? []);
        return $out;
    }
    private function resources(array $rows): array {
        return array_map(fn ($row) => array_intersect_key($row, array_flip(['production','civilian_requested','industrial_requested','development','development_spending'])), $rows);
    }
    public function export(Nation $nation, Turn $through, int $window): EconomicHistoryInfo
    {
        $game = $nation->getGame();
        return DB::transaction(function () use ($nation, $through, $window, $game) {
            $rows = DB::table('nation_details as d')->join('turns as t', 't.id', '=', 'd.turn_id')
                ->where('d.game_id', $game->id)->where('t.game_id', $game->id)->where('d.nation_id', $nation->id)
                ->where('t.number', '>', max(1, $through->number - $window))->where('t.number', '<=', $through->number)
                ->orderBy('t.number')->get(['t.id', 't.number', 'd.economy_report', 'd.resource_report', 'd.policy_report']);
            $seasons = $rows->map(function ($row) {
                return ['season' => $row->number - 1, 'closing_turn_id' => $row->id,
                    'economy' => $row->economy_report ? $this->economy(json_decode($row->economy_report, true, flags: JSON_THROW_ON_ERROR)) : null,
                    'resources' => $row->resource_report ? $this->resources(json_decode($row->resource_report, true, flags: JSON_THROW_ON_ERROR)) : null,
                    'policy_changes' => $row->policy_report ? (json_decode($row->policy_report, true, flags: JSON_THROW_ON_ERROR)['changed'] ?? []) : []];
            })->all();
            return new EconomicHistoryInfo($game->id, $nation->id, $through->number, $game->turn_context_revision, $seasons);
        });
    }
}

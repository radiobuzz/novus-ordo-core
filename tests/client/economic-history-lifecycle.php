<?php
use App\Domain\Resources\Quantity;
require __DIR__ . '/civilian-lifecycle.php';

$historyService = app(\App\Services\EconomicHistoryService::class);
$historyTurn = $civilianGame->fresh()->getCurrentTurn();
$historyNation = $civilianGame->nations()->first();
$history = $historyService->export($historyNation, $historyTurn, 12);
$check(count($history->seasons) === 12, 'History is not bounded to requested seasons.');
$check($history->seasons[0]['season'] === $historyTurn->number - 12, 'History season shifted.');
$check($history->seasons[11]['season'] === $historyTurn->number - 1, 'History labels an unresolved season.');
$check($history->nation_id === $historyNation->id && $history->game_id === $civilianGame->id, 'Private history scope mismatch.');
$check(!isset($history->seasons[0]['economy']['territories']), 'History exports unnecessary territory snapshots.');
foreach ($history->seasons as $point) {
    foreach ($point['economy']['industries'] as $key => $industry) foreach ($industry['owners'] as $owner => $numbers) {
        $check(Quantity::sub($numbers['sales'], $numbers['recognized_cost']) === $numbers['operating_result'], 'Industry result does not reconcile.');
        $check(Quantity::add($numbers['sold_cost'], $numbers['maintenance_cost']) === $numbers['recognized_cost'], 'Industry cost counted twice.');
    }
}
$detail = $historyNation->getDetail($historyTurn);
$check($detail->policy_report['settings']['finance.treasury_reserve']['treasury'] === '20', 'Fresh reserve policy missing.');
$originalReport = $detail->economy_report;
$state = $detail->economy_state; $state['debt'] = '10.000000';
$state['lender_cash'] = Quantity::sub($state['lender_cash'], '10');
$detail->economy_state = $state; $detail->save();
$stock = $detail->stockpiles()->where('resource_id', $detail->resources()->get($detail->resources()->role('treasury'))['id'])->firstOrFail();
$stock->available_quantity = Quantity::add($stock->available_quantity, '10'); $stock->save();
$beforeCash = $stock->available_quantity; $beforeLender = $state['lender_cash'];
$paid = app(\App\Services\FinanceService::class)->repay($detail, '2');
$check($paid['debt'] === '8.000000' && $paid['treasury'] === Quantity::sub($beforeCash, '2'), 'Manual repayment did not debit current cash and principal.');
$check($detail->fresh()->economy_state['lender_cash'] === Quantity::add($beforeLender, '2'), 'Lender counterparty missing.');
$check($detail->fresh()->economy_report === $originalReport, 'Manual action rewrote completed seasonal observations.');
try { app(\App\Services\FinanceService::class)->repay($detail, '100000'); throw new RuntimeException('Invalid repayment accepted.'); }
catch (\Illuminate\Validation\ValidationException) { $check($detail->fresh()->economy_state['debt'] === '8.000000', 'Rejected repayment mutated principal.'); }
$revision = $civilianGame->fresh()->turn_context_revision;
$civilianGame->fresh()->rollbackLastTurn($historyTurn->id);
$restoredTurn = $civilianGame->fresh()->getCurrentTurn();
$after = $historyService->export($historyNation->fresh(), $restoredTurn, 12);
$check($after->turn_context_revision !== $revision, 'Rollback failed to rotate history context.');
$check($after->seasons[11]['season'] === $restoredTurn->number - 1, 'History retained rolled-back observation.');
$check(!isset($historyNation->getDetail($restoredTurn)->economy_state['cash_actions']), 'Rollback retained manual repayment action.');
echo "PASS: bounded private economic history, industry reconciliation, reserve policy, manual repayment and rollback.\n";

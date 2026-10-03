<?php
namespace App\Services;

use App\Domain\Resources\Quantity as Q;
use App\Models\NationDetail;
use App\Services\Resources\ResourceLedger;
use Illuminate\Validation\ValidationException;

final class FinanceService
{
    public function repay(NationDetail $detail, string $requested): array
    {
        return app(GameMutation::class)->run($detail->getGame(), function () use ($detail, $requested) {
            $detail->refresh();
            $amount = Q::parse($requested); $state = $detail->economy_state;
            if (!$state || Q::cmp($amount, '0') <= 0) throw ValidationException::withMessages(['amount' => 'Enter a positive repayment amount.']);
            $key = $detail->resources()->role('treasury');
            $stock = $detail->stockpiles()->where('resource_id', $detail->resources()->get($key)['id'])->firstOrFail();
            $committed = app(ResourceLedger::class)->costs($detail)['commands'][$key];
            $available = Q::max('0', Q::sub($stock->available_quantity, $committed));
            if (Q::cmp($amount, $state['debt']) > 0 || Q::cmp($amount, $available) > 0) throw ValidationException::withMessages(['amount' => 'Repayment exceeds outstanding debt or uncommitted treasury.']);
            $stock->available_quantity = Q::sub($stock->available_quantity, $amount); $stock->save();
            $state['debt'] = Q::sub($state['debt'], $amount);
            $state['lender_cash'] = Q::add($state['lender_cash'], $amount);
            $state['cash_actions'][] = ['type' => 'principal_repayment', 'amount' => $amount, 'closing_cash' => $stock->available_quantity, 'closing_debt' => $state['debt']];
            $detail->economy_state = $state; $detail->save();
            // Completed seasonal reports remain observations of that season. This action is current-turn state.
            return ['amount' => $amount, 'treasury' => $stock->available_quantity, 'debt' => $state['debt']];
        });
    }
}

<?php
namespace App\Http\Controllers;

use App\Services\{NationContext, FinanceService};
use Illuminate\Http\{JsonResponse, Request};

final class FinanceController extends Controller
{
    public function repay(Request $request, NationContext $context, FinanceService $finance): JsonResponse
    {
        $data = $request->validate(['amount' => ['required', 'string', 'regex:/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/D']]);
        return response()->json($finance->repay($context->getNation()->getDetail($context->getCurrentTurn()), $data['amount']));
    }
}

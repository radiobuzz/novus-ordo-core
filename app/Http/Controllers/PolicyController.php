<?php

namespace App\Http\Controllers;

use App\Models\Turn;
use App\Services\NationContext;
use App\Services\Policies\PolicyService;
use Illuminate\Http\{JsonResponse, Request};

final class PolicyController extends Controller {
    public function show(NationContext $context, PolicyService $service): JsonResponse {
        return response()->json($service->state($context->getNation(), $context->getCurrentTurn()));
    }

    public function preview(Request $request, NationContext $context, PolicyService $service): JsonResponse {
        [$turn, $data] = $this->proposal($request, $context);
        return response()->json($service->preview($context->getNation(), $turn, $data['edit_counter'], $data['changes'], array_column($data['acquisitions'], null, 'resource_key')));
    }

    public function submit(Request $request, NationContext $context, PolicyService $service): JsonResponse {
        [$turn, $data] = $this->proposal($request, $context);
        return response()->json($service->submit($context->getNation(), $turn, $data['edit_counter'], $data['changes'], array_column($data['acquisitions'], null, 'resource_key')));
    }

    private function proposal(Request $request, NationContext $context): array {
        $data = $request->validate(\App\Http\Requests\ProductionPlanRequest::planRules());
        if ($request->input('client_context.turn_context_revision') !== $context->getGame()->turn_context_revision) abort(409, 'The turn was reset. Refresh first.');
        return [Turn::where('game_id', $context->getGame()->id)->findOrFail($data['turn_id']), $data];
    }
}

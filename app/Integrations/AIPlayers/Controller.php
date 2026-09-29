<?php

namespace App\Integrations\AIPlayers;

use App\Models\Game;
use App\Services\NationContext;
use ExperimentalAI\Runner;
use Illuminate\Http\{JsonResponse, Request};

final class Controller
{
    private function context(Request $request): array {
        return $request->validate(['game_id' => 'required|integer|min:1', 'turn_id' => 'required|integer|min:1',
            'generation' => 'required|uuid', 'nation_id' => 'nullable|integer|min:1']);
    }
    public function step(Request $request, NationContext $context, Runner $runner): JsonResponse {
        // Owning an automated nation still permits driving the normal sequential AI loop.
        $result = $runner->step($context->getGame(), $this->context($request));
        $context->getGame()->fresh()->tryNextTurnIfNationsReady($context->getCurrentTurn());
        return response()->json($result);
    }
    public function report(Game $game, GameAdapter $adapter): JsonResponse { return response()->json($adapter->report($game)); }
    public function adminStep(Request $request, Game $game, Runner $runner): JsonResponse {
        return response()->json($runner->step($game, $this->context($request)));
    }
    public function control(Request $request, Game $game, GameAdapter $adapter): JsonResponse {
        $data = $request->validate([
            'action' => 'required|in:pause,resume,takeover,assign',
            'nation_id' => 'required_if:action,takeover,assign|nullable|integer|min:1',
        ]);
        $adapter->control(
            $game,
            $this->context($request),
            $data['action'],
            $data['nation_id'] ?? null,
        );
        return response()->json($adapter->report($game));
    }
}

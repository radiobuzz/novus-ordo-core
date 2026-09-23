<?php

namespace App\Integrations\AIPlayers;

use App\Models\{Game, Turn};
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
    public function kit() {
        $path = tempnam(sys_get_temp_dir(), 'novus-ai-kit-');
        try {
            \ExperimentalAI\AuthorKit::build($path);
            return response()->download($path, 'novus-ai-author.zip', ['Cache-Control' => 'private, no-store'])->deleteFileAfterSend(true);
        } catch (\Throwable $error) {
            if (is_file($path)) unlink($path);
            throw $error;
        }
    }
    public function adminStep(Request $request, Game $game, Runner $runner): JsonResponse {
        $request->validate(['preview' => 'sometimes|boolean']);
        return response()->json($runner->step($game, $this->context($request), $request->boolean('preview')));
    }
    public function control(Request $request, Game $game, GameAdapter $adapter): JsonResponse {
        $data = $request->validate([
            'action' => 'required|in:pause,resume,takeover,assign,script',
            'nation_id' => 'required_if:action,takeover,assign,script|nullable|integer|min:1',
            'aggression' => 'required_if:action,assign|nullable|integer|between:0,100',
            'script' => ['required_if:action,script', 'string',
                \Illuminate\Validation\Rule::in(array_column(app(\ExperimentalAI\ScriptCatalog::class)->all(), 'id'))],
        ]);
        $adapter->control(
            $game,
            $this->context($request),
            $data['action'],
            $data['nation_id'] ?? null,
            $data['aggression'] ?? null,
            $data['script'] ?? \ExperimentalAI\ScriptCatalog::DEFAULT,
        );
        return response()->json($adapter->report($game));
    }

    public function snapshot(Request $request, Game $game, GameAdapter $adapter): JsonResponse {
        $data = $request->validate(['nation_id' => 'required|integer|min:1']);
        return $adapter->locked($game, function () use ($game, $adapter, $data) {
            $game->nations()->findOrFail($data['nation_id']);
            $player = \Illuminate\Support\Facades\DB::table('ai_players')->where('nation_id', $data['nation_id'])->first();
            $status = $adapter->status($game);
            $script = $player->script ?? \ExperimentalAI\ScriptCatalog::DEFAULT;
            return response()->json([
                'view' => $adapter->observe($game, $data['nation_id']),
                'memory' => \ExperimentalAI\Memory::forScript(json_decode($player->memory ?? '[]', true), $script),
                'settings' => ['aggression' => $player->aggression ?? 50, 'seed' => $player->seed ?? 'snapshot',
                    'protect_humans' => $status['protect_humans'] ?? false],
            ])->header('Cache-Control', 'private, no-store');
        });
    }
}

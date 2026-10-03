<?php
namespace App\Http\Controllers;

use App\Models\Game;
use App\Services\{NationContext, EconomicHistoryService};
use App\ReadModels\EconomicHistoryInfo;
use App\Utils\Annotations\Response;
use Illuminate\Http\{JsonResponse, Request};

final class EconomicHistoryController extends Controller
{
    #[Response(EconomicHistoryInfo::class)]
    public function show(Request $request, NationContext $context, EconomicHistoryService $history): JsonResponse
    {
        $data = $request->validate(['game_id' => 'required|integer|min:1', 'turn_number' => 'required|integer|min:1', 'turn_context_revision' => 'required|string', 'window' => 'required|integer|in:12,24,96']);
        $game = $context->getGame(); $turn = $context->getCurrentTurn();
        if ($data['game_id'] != $game->id || $data['turn_number'] != $turn->number || $data['turn_context_revision'] !== $game->turn_context_revision) abort(409, 'The history context changed. Refresh first.');
        $result = $history->export($context->getNation(), $turn, $data['window']);
        $fresh = Game::findOrFail($game->id);
        if ($fresh->turn_context_revision !== $game->turn_context_revision || $fresh->getCurrentTurn()->id !== $turn->id) abort(409, 'The history context changed while loading.');
        return response()->json($result)->header('Cache-Control', 'no-store');
    }
}

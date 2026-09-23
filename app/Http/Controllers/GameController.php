<?php

namespace App\Http\Controllers;

use App\ReadModels\GameInfo;
use App\ReadModels\GameMapInfo;
use App\ReadModels\GameReadyStatusInfo;
use App\ReadModels\RankingInfo;
use App\ReadModels\RankingHistoryInfo;
use App\Models\Turn;
use App\Services\RankingHistoryService;
use App\ReadModels\VictoryGoalInfo;
use App\Services\PublicGameContext;
use App\Utils\Annotations\Response;
use App\Utils\Annotations\QueryParameter;
use App\Utils\Annotations\Summary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GameController extends Controller
{
    /** Lightweight selector contract; open access policy, participation belongs to this account/game. */
    public function games(Request $request, \App\Services\GameAccess $access): JsonResponse {
        $games = $access->availableGames($request->user())->with('currentTurn')->orderBy('id')->get();
        $nations = \App\Models\Nation::withoutGlobalScopes()->where('user_id', $request->user()->getId())
            ->whereIn('game_id', $games->modelKeys())->get()->keyBy('game_id');
        return response()->json(['games' => $games->map(function ($game) use ($nations) {
            $nation = $nations->get($game->getId());
            return ['game_id' => $game->getId(), 'turn_number' => $game->getCurrentTurn()->getNumber(),
                'nation_id' => $nation?->getId(),
                'setup_status' => $nation ? \App\Domain\NationSetupStatus::from((int) $nation->getRawOriginal('nation_setup_status'))->name : 'NotCreated',
                'can_spectate' => true, 'can_join' => $nation === null && $game->freeSuitableTerritoriesInTurn()->count() >= \App\Models\Game::NUMBER_OF_STARTING_TERRITORIES];
        })->all()])->header('Cache-Control', 'private, no-store');
    }

    #[Summary('Returns the immutable experimental geography, or null for a classic map.')]
    #[Response(GameMapInfo::class)]
    #[QueryParameter('game_id', 'int', 'Required. The game whose geography is being loaded.')]
    public function map(Request $request, PublicGameContext $context): JsonResponse {
        $query = $request->validate(['game_id' => 'required|integer|min:1']);
        $game = $context->getGame();
        if ((int) $query['game_id'] !== $game->getId()) abort(409, 'The selected game changed. Reload the world.');
        $map = $game->map()->first();
        return response()->json(new GameMapInfo(
            game_id: $game->getId(),
            fingerprint: $map?->getFingerprint(),
            map: $map?->getSnapshot(),
        ));
    }

    #[Summary('Returns information about current game.')]
    #[Response(GameInfo::class)]
    public function info(PublicGameContext $context): JsonResponse {
        $game = $context->getGame();
        return response()->json(new GameInfo(
            $game->getId(), $game->getCurrentTurn()->getNumber(),
            \App\Models\NationColorAssignment::exportForGame($game),
        ))->header('Cache-Control', 'no-store');
    }

    #[Summary('Returns useful when checking if the current turn has ended and if turn upkeep is done and the next turn is ready.')]
    #[Response(GameReadyStatusInfo::class)]
    public function readyStatus(PublicGameContext $context): JsonResponse {
        return response()->json($context->getGame()->exportReadyStatus());
    }

    #[Summary('Returns the nation rankings.')]
    #[Response(RankingInfo::class)]
    public function rankings(PublicGameContext $context): JsonResponse {
        return response()->json($context->getGame()->exportRankings($context->getGame()->getCurrentTurn()));
    }

    #[Summary('Returns public nation ranking observations through the confirmed current turn.')]
    #[Response(RankingHistoryInfo::class)]
    #[QueryParameter('game_id', 'int', 'Required. The game for which history is being loaded.')]
    #[QueryParameter('turn_number', 'int', 'Required. The confirmed current turn through which to load history.')]
    public function rankingHistory(Request $request, PublicGameContext $context, RankingHistoryService $history): JsonResponse {
        $query = $request->validate([
            'game_id' => 'required|integer|min:1',
            'turn_number' => 'required|integer|min:1',
        ]);
        $game = $context->getGame();
        $currentTurn = $game->getCurrentTurn();
        if ((int) $query['game_id'] !== $game->getId() || (int) $query['turn_number'] !== $currentTurn->getNumber()) {
            abort(409, 'The selected game or turn changed. Refresh before loading ranking history.');
        }

        $result = $history->export($game, $currentTurn);
        if (Turn::getCurrentForGame($game)->getId() !== $currentTurn->getId()) {
            abort(409, 'The turn changed while ranking history was loading. Refresh and try again.');
        }

        return response()->json($result)->header('Cache-Control', 'no-store');
    }

    #[Summary('Returns the game victory status and nations\' progression.')]
    #[Response(VictoryGoalInfo::class)]
    public function victoryStatus(PublicGameContext $context): JsonResponse {
        return response()->json($context->getGame()->exportVictoryStatus($context->getGame()));
    }
}

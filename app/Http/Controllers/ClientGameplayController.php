<?php

namespace App\Http\Controllers;

use App\Domain\DivisionType;
use App\Domain\LaborPoolConstants;
use App\Domain\ProductionBidConstants;
use App\Domain\ResourceType;
use App\Models\Deployment;
use App\Models\Division;
use App\Models\LeaderDetail;
use App\Models\Nation;
use App\Models\ProductionBid;
use App\Services\NationContext;
use App\Services\PublicGameContext;
use App\Utils\Annotations\Summary;
use Illuminate\Http\JsonResponse;

class ClientGameplayController extends Controller
{
    #[Summary('Returns public nation and leader identities used by current-game reports.')]
    public function identities(PublicGameContext $context): JsonResponse {
        $game = $context->getGame();
        return response()->json([
            'game_id' => $game->getId(),
            'turn_number' => $game->getCurrentTurn()->getNumber(),
            'nations' => $game->nations()->get()->map(fn (Nation $nation) => $nation->getDetail()->export()),
            'leaders' => LeaderDetail::getAll($game->getCurrentTurn())->map(fn (LeaderDetail $leader) => $leader->export()),
        ])->header('Cache-Control', 'no-store');
    }

    #[Summary('Returns the current nation workspace and the existing engine definitions for the experimental client.')]
    public function info(NationContext $context): JsonResponse {
        return response()->json([
            ...app(\App\Services\PlayerWorkspace::class)->export($context->getNation()),
            'automation' => app(\App\Integrations\AIPlayers\GameAdapter::class)->status($context->getGame()),
            'automated_nation' => !app(\App\Services\GameParticipants::class)->canCommand($context->getNation()),
        ])->header('Cache-Control', 'private, no-store');
    }
}

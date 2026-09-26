<?php

namespace App\Http\Controllers;

use App\Domain\NationSetupStatus;
use App\Http\Requests\NewNationRequest;
use App\Http\Requests\SelectTerritoriesRequest;
use App\Models\Battle;
use App\Models\Nation;
use App\Models\NewNation;
use App\Models\Turn;
use App\ReadModels\BudgetInfo;
use App\ReadModels\DefenseCoverageInfo;
use App\ReadModels\NationTurnOwnerInfo;
use App\ReadModels\NationTurnPublicInfo;
use App\ReadModels\ParticipantBattleLog;
use App\Services\DefenseCoverageService;
use App\Services\LoggedInGameContext;
use App\Services\NationContext;
use App\Services\NationSetupContext;
use App\Services\PublicGameContext;
use App\Utils\Annotations\Payload;
use App\Utils\Annotations\QueryParameter;
use App\Utils\Annotations\Response;
use App\Utils\Annotations\ResponseElement;
use App\Utils\Annotations\Summary;
use App\Utils\HttpStatusCode;
use App\Utils\MapsArrayToInstance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

readonly class BattleLogForTurnParams {
    use MapsArrayToInstance;
    public function __construct(
        public int $turn_number,
    ) {}
}

class NationController extends Controller
{
    #[Summary('Create a nation for the current user in the current game.')]
    #[Payload(NewNationRequest::class)]
    #[ResponseElement('nation_id', 'int', 'Nation ID of the new nation.')]
    public function createNation(NewNationRequest $request, LoggedInGameContext $context): JsonResponse {
        $game = $context->getGame();
        $user = $context->getUser();
        $createResult = NewNation::create($game, $user, $request->usual_name);

        return response()->json(["nation_id" => $createResult->getId()], HttpStatusCode::Created);
    }

    #[Summary('Completes nation setup by submitting home territories selection.')]
    #[Payload(SelectTerritoriesRequest::class)]
    #[Response('HTTP status code 204 NoContent on success.')]
    public function selectHomeTerritories(SelectTerritoriesRequest $request, NationSetupContext $context): JsonResponse {
        if ($context->getUser()->getNationSetupStatus($context->getGame()) != NationSetupStatus::HomeTerritoriesSelection) {
            abort(HttpStatusCode::BadRequest, "User's nation setup status is not " . NationSetupStatus::HomeTerritoriesSelection->name);
        }
        $newNation = $context->getNewNation();

        $newNation->finishSetup($request->territory_ids);

        return response()->json(null, HttpStatusCode::NoContent);
    }

    #[Summary('Returns privileged information destined to the nation\'s owner.')]
    #[Response(NationTurnOwnerInfo::class)]
    public function ownNationInfo(NationContext $context): JsonResponse {
        $nation = $context->getNation();

        return response()->json($nation->getDetail()->exportForOwner());
    }

    #[Summary('Returns budget information destined to the nation\'s owner.')]
    #[Response(BudgetInfo::class)]
    public function budgetInfo(NationContext $context): JsonResponse {
        $nation = $context->getNation();

        return response()->json($nation->getDetail()->exportBudget());
    }

    #[Summary('Returns single-attack Guard coverage for each territory owned by the current nation.')]
    #[Response(DefenseCoverageInfo::class)]
    public function defenseCoverage(NationContext $context): JsonResponse
    {
        $nation = $context->getNation();

        return response()->json(app(DefenseCoverageService::class)->export($nation, $context->getCurrentTurn()));
    }

    #[Summary('Returns all of last turn\'s battle logs where the current nation was a participant.')]
    #[QueryParameter('turn_number', 'int', 'Optional. Turn number for which to return information.')]
    #[Response(ParticipantBattleLog::class)]
    public function nationBattleLogs(Request $request, NationContext $context): JsonResponse {
        $nation = $context->getNation();
        $validated = $request->validate([
            'turn_number' => 'nullable|integer',
        ]);

        if (isset($validated['turn_number'])) {
            $params = BattleLogForTurnParams::fromArray($validated);
            $turn = Turn::asOrNotFound(Turn::getForGameByNumberOrNull($context->getGame(), $params->turn_number), "Invalid turn number for the current game: {$params->turn_number}");
        }
        else {
            $turn = $context->getCurrentTurn();
        }

        return response()->json($nation->getDetail($turn)
            ->getAllBattlesWhereParticipant()
            ->map(fn (Battle $b) => $b->exportForParticipant())
        );
    }

    #[Summary('Return public information on a nation.')]
    #[Response(NationTurnPublicInfo::class)]
    public function info(PublicGameContext $context, int $nationId): JsonResponse {
        $nationOrNull = $context->getGame()->getNationWithIdOrNull($nationId);
        if ($nationOrNull === null) {
            return response()->json(['errors' => ['nationId' => "No nation with that ID in the current game."]], HttpStatusCode::UnprocessableContent);
        }
        $nation = Nation::notNull($nationOrNull);

        return response()->json($nation->getDetail()->export());
    }
}

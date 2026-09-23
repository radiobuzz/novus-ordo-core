<?php

namespace App\Http\Controllers;

use App\Domain\DeploymentCommand;
use App\Domain\DivisionType;
use App\Http\Requests\CancelDeploymentsRequest;
use App\Http\Requests\DeployRequest;
use App\Http\Requests\SentDeploymentOrder;
use App\Models\Deployment;
use App\Models\NationTerritoryLoyalty;
use App\Models\Territory;
use App\ReadModels\DeploymentInfo;
use App\Services\NationContext;
use App\Utils\Annotations\Payload;
use App\Utils\Annotations\ResponseCollection;
use App\Utils\Annotations\Summary;
use App\Utils\HttpStatusCode;
use Illuminate\Http\JsonResponse;

class DeploymentController extends Controller
{
    #[Summary('Cancels deployments.')]
    #[Payload(CancelDeploymentsRequest::class)]
    public function cancelDeployments(CancelDeploymentsRequest $cancelRequest, NationContext $context): JsonResponse {
        $nation = $context->getNation();

        app(\App\Services\NationCommands::class)->cancelDeployments($nation, $cancelRequest->deployment_ids);
        
        return response()->json(null, HttpStatusCode::NoContent);
    }
    
    #[Summary('Returns all deployments for the current nation.')]
    #[ResponseCollection('data', DeploymentInfo::class, 'A list of all the current nation\'s deployments.')]
    public function allDeployments(NationContext $context): JsonResponse {
        return response()->json(['data' => $context->getNation()->getDetail()->deployments()->get()->map(fn (Deployment $d) => $d->export())]);
    }

    #[Summary('Returns all deployments for the current nation in the specified territory.')]
    #[ResponseCollection('data', DeploymentInfo::class, 'A list of all the current nation\'s deployments in the territory.')]
    public function allDeploymentsInOwnedTerritory(NationContext $context, int $territoryId): JsonResponse {
        $nation = $context->getNation();
        $territory = Territory::asOrNotFound($nation->getDetail()->territories()->find($territoryId), "Current nation doesn't own territory: $territoryId");

        return response()->json(['data' => $nation->getDetail()->deploymentsInTerritory($territory)->get()->map(fn (Deployment $d) => $d->export())]);
    }

    #[Summary('Deploys divisions and returns the deployments.')]
    #[Payload(DeployRequest::class)]
    #[ResponseCollection('data', DeploymentInfo::class, 'A list of all the new deployments.')]
    public function deploy(DeployRequest $request, NationContext $context): JsonResponse {
        $nation = $context->getNation();
        $turn = $context->getCurrentTurn();
        $nationDetail = $nation->getDetail($turn);

        $deploymentCommands = collect($request->getDeployments())->map(fn (SentDeploymentOrder $do) => new DeploymentCommand($do->territory_id, DivisionType::fromName($do->division_type)));

        $deploymentCommands->map(fn (DeploymentCommand $dc) => $dc->territoryId)
            ->unique()
            ->each(function (int $territoryId) use ($nation, $nationDetail, $turn) {
                $territory = Territory::notNull($nationDetail->territories()->find($territoryId));
                if (!Deployment::isLoyaltyHighEnoughToDeployOnTerritory(NationTerritoryLoyalty::getLoyaltyRatioForNation($nation, $territory, $turn))) {
                    abort(HttpStatusCode::UnprocessableContent, "Nation can't deploy on Territory ID {$territory->getId()}.");
                }
            });

        $deployedTypes = $deploymentCommands->map(fn (DeploymentCommand $dc) => $dc->divisionType);

        if (!$nation->getDetail()->canAffordCosts(DivisionType::calculateTotalDeploymentCostsByResourceType(...$deployedTypes))) {
            abort(HttpStatusCode::UnprocessableContent, "Nation doesn't have enough resources to afford deployment costs.");
        }

        $deployments = array_map(
            fn (Deployment $d) => $d->export(),
            app(\App\Services\NationCommands::class)->deploy($nation, $deploymentCommands->all())
        );
        return response()->json(['data' => $deployments], HttpStatusCode::Created);
    }
}

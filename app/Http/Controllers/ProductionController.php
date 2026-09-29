<?php
namespace App\Http\Controllers;
use App\Http\Requests\ProductionPlanRequest;
use App\Services\NationContext;
use App\Services\Policies\PolicyService;
use App\Utils\Annotations\{Payload, Summary};
use Illuminate\Http\JsonResponse;
class ProductionController extends Controller {
    #[Summary('Saves the complete seasonal policy and acquisition package atomically.')]
    #[Payload(ProductionPlanRequest::class)]
    public function applyProductionPlan(NationContext $context, ProductionPlanRequest $request): JsonResponse {
        return app(PolicyController::class)->submit($request, $context, app(PolicyService::class));
    }
    #[Summary('Previews the complete seasonal policy and acquisition package without writes.')]
    #[Payload(ProductionPlanRequest::class)]
    public function previewProductionPlan(NationContext $context, ProductionPlanRequest $request): JsonResponse {
        return app(PolicyController::class)->preview($request, $context, app(PolicyService::class));
    }
}

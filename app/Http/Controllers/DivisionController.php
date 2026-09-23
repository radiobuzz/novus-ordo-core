<?php

namespace App\Http\Controllers;

use App\Domain\DivisionType;
use App\Domain\OrderType;
use App\Http\Requests\CancelOrdersRequest;
use App\Http\Requests\SendDisbandOrdersRequest;
use App\Http\Requests\SendMoveOrdersRequest;
use App\Http\Requests\SentDisbandOrder;
use App\Http\Requests\SentMoveOrder;
use App\Models\Division;
use App\Models\Order;
use App\ReadModels\DisbandOrderInfo;
use App\ReadModels\OwnedDivisionInfo;
use App\Services\NationContext;
use App\Utils\Annotations\Payload;
use App\Utils\Annotations\Response;
use App\Utils\Annotations\Summary;
use App\Utils\HttpStatusCode;
use Illuminate\Http\JsonResponse;
use App\Utils\Annotations\ResponseCollection;

class DivisionController extends Controller
{
    #[Summary('Send disband orders.')]
    #[Payload(SendDisbandOrdersRequest::class)]
    #[ResponseCollection('data', DisbandOrderInfo::class, 'List of disband orders sent.')]
    public function sendDisbandOrders(SendDisbandOrdersRequest $request, NationContext $context): JsonResponse {
        $nation = $context->getNation();

        $sentOrders = app(\App\Services\NationCommands::class)->disband($nation,
            array_map(fn (SentDisbandOrder $order) => $order->division_id, $request->getDisbandOrders()));

        return response()->json(['data' => array_map(fn (Order $o) => $o->exportForOwner(), $sentOrders)], HttpStatusCode::Created);
    }

    #[Summary('Send move/attack orders.')]
    #[Payload(SendMoveOrdersRequest::class)]
    #[ResponseCollection('data', DisbandOrderInfo::class, 'List of move/attack orders sent.')]
    public function sendMoveOrders(SendMoveOrdersRequest $request, NationContext $context): JsonResponse {
        $sentOrders = app(\App\Services\NationCommands::class)->move($context->getNation(),
            array_map(fn (SentMoveOrder $order) => [
                'division_id' => $order->division_id, 'destination_territory_id' => $order->destination_territory_id,
                'path_territory_ids' => $order->path_territory_ids,
            ], $request->getMoveOrders()));
        
        return response()->json(['data' => array_map(fn (Order $o) => $o->exportForOwner(), $sentOrders)], HttpStatusCode::Created);
    }

    #[Summary('Cancel orders.')]
    #[Payload(CancelOrdersRequest::class)]
    #[Response('HTTP status code 204 NoContent on success.')]
    public function cancelOrders(CancelOrdersRequest $request, NationContext $context): JsonResponse {
        $nation = $context->getNation();

        app(\App\Services\NationCommands::class)->cancelOrders($nation, $request->division_ids);
        
        return response()->json(null, HttpStatusCode::NoContent);
    }
    
    #[Summary('Get all the current nation\'s divisions.')]
    #[ResponseCollection("data", OwnedDivisionInfo::class, "Base information on all territories.")]
    public function allOwnedDivisions(NationContext $context): JsonResponse {
        $nation = $context->getNation();

        $divisions = $nation->getDetail()->activeDivisions()->get()->map(fn (Division $d) => $d->getDetail()->exportForOwner())->all();

        return response()->json(['data' => $divisions]);
    }

    #[Summary('Get one of the current nation\'s divisions.')]
    #[Response(OwnedDivisionInfo::class)]
    public function ownedDivision(NationContext $context, int $divisionId): JsonResponse {
        $nation = $context->getNation();

        $division = Division::asOrNotFound($nation->getDetail()->activeDivisions()->find($divisionId), "Current nation doesn't own an active division with that ID: $divisionId");

        return response()->json($division->getDetail()->exportForOwner());
    }
}

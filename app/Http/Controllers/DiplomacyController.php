<?php
namespace App\Http\Controllers;

use App\Domain\NationOfferKind;
use App\Services\{DiplomacyService, NationCommunicationService, NationContext};
use App\Utils\Annotations\Summary;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DiplomacyController extends Controller {
    #[Summary('Returns the current nation’s private conversation summaries and unread counts.')]
    public function inbox(NationContext $context, NationCommunicationService $messages): JsonResponse {
        return $this->read(fn () => $messages->inbox($context->getNation()));
    }

    #[Summary('Returns a bounded page of private messages and current offer states between two nations.')]
    public function conversation(Request $request, NationContext $context, NationCommunicationService $messages, int $nationId): JsonResponse {
        $values = $request->validate(['before' => 'sometimes|integer|min:1']);
        return $this->read(fn () => $messages->conversation($context->getNation(), $nationId, $values['before'] ?? null));
    }

    #[Summary('Sends plain text to another nation; the acting nation comes from the authenticated context.')]
    public function send(Request $request, NationContext $context, NationCommunicationService $messages): JsonResponse {
        $values = $request->validate(['nation_id' => 'required|integer|min:1', 'body' => 'required|string|max:2000', 'request_key' => 'required|uuid']);
        return response()->json($messages->send($context->getNation(), $values['nation_id'], $values['body'], $values['request_key']), 201);
    }

    #[Summary('Proposes a peace treaty, alliance or one-resource grant without changing ownership yet.')]
    public function propose(Request $request, NationContext $context, NationCommunicationService $messages): JsonResponse {
        $values = $request->validate(['nation_id' => 'required|integer|min:1', 'kind' => ['required', Rule::in(['Peace', 'Alliance', 'ResourceGrant'])],
            'request_key' => 'required|uuid', 'basis_revision' => 'nullable|uuid',
            'resource_key' => ['nullable', 'string'],
            'quantity' => 'nullable']);
        $kind = constant(NationOfferKind::class . '::' . $values['kind']);
        $resource = $values['resource_key'] ?? null;
        return response()->json($messages->propose($context->getNation(), $values['nation_id'], $kind,
            $values['request_key'], $resource, $values['quantity'] ?? null, $values['basis_revision'] ?? null), 201);
    }

    #[Summary('Accepts, declines or cancels an offer, applying an accepted grant or treaty atomically.')]
    public function respond(Request $request, NationContext $context, NationCommunicationService $messages): JsonResponse {
        $values = $request->validate(['offer_id' => 'required|integer|min:1', 'action' => ['required', Rule::in(['accept', 'decline', 'cancel'])]]);
        return response()->json($messages->respond($context->getNation(), $values['offer_id'], $values['action']));
    }

    #[Summary('Gives five turns of notice before a protective treaty ends.')]
    public function cancel(Request $request, NationContext $context, DiplomacyService $diplomacy): JsonResponse {
        $values = $request->validate(['nation_id' => 'required|integer|min:1', 'revision' => 'required|uuid']);
        if (!$diplomacy->enabled($context->getGame())) abort(409, 'Diplomacy is unavailable in this game.');
        $diplomacy->cancelTreaty($context->getNation(), $values['nation_id'], $values['revision']);
        return response()->json(null, 204);
    }

    #[Summary('Advances only the authenticated nation’s private unread position.')]
    public function readMessages(Request $request, NationContext $context, NationCommunicationService $messages): JsonResponse {
        $values = $request->validate(['nation_id' => 'required|integer|min:1', 'message_id' => 'required|integer|min:1']);
        $messages->markRead($context->getNation(), $values['nation_id'], $values['message_id']);
        return response()->json(null, 204);
    }

    private function read(callable $work): JsonResponse {
        return response()->json(DB::transaction($work))->header('Cache-Control', 'private, no-store');
    }
}

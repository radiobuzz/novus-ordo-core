<?php
namespace App\Services;

use App\Domain\{NationOfferKind, NationOfferStatus, RelationState};
use App\Models\{Nation, NationMessage, NationOffer, NationOfferDetail, NationRelation, Turn};
use Illuminate\Support\Facades\DB;

/** Private pair conversations and immutable offers; both human and AI callers use this service. */
final class NationCommunicationService {
    public function __construct(private DiplomacyService $diplomacy, private NationGrantService $grants) {}

    private function assertAvailable(Nation $nation): void {
        if (!$nation->getGame()->fresh()->isActive() || !$this->diplomacy->enabled($nation->getGame())) abort(409, 'Diplomacy is unavailable in this game.');
    }

    private function mutate(Nation $nation, callable $work): mixed {
        return app(GameMutation::class)->run($nation->getGame(), function () use ($nation, $work) {
            $this->assertAvailable($nation);
            return $work(Turn::getCurrentForGame($nation->getGame()));
        });
    }

    public function send(Nation $nation, int $otherId, string $body, string $key): array {
        return $this->mutate($nation, function ($turn) use ($nation, $otherId, $body, $key) {
            $body = trim($body);
            if ($body === '' || mb_strlen($body) > 2000) abort(422, 'Messages must contain 1–2000 characters.');
            $pair = $this->diplomacy->pair($nation, $otherId, true);
            $existing = NationMessage::where('relation_id', $pair->id)->where('sender_nation_id', $nation->getId())->where('request_key', $key)->first();
            if ($existing) {
                if ($existing->kind !== 'Text' || $existing->body !== $body) abort(409, 'This request key was already used.');
                return ['message_id' => $existing->id];
            }
            $message = NationMessage::create(['relation_id' => $pair->id, 'sender_nation_id' => $nation->getId(),
                'kind' => 'Text', 'body' => $body, 'request_key' => $key,
                'created_turn_id' => $turn->getId(), 'original_turn_number' => $turn->getNumber()]);
            return ['message_id' => $message->id];
        });
    }

    public function propose(Nation $nation, int $otherId, NationOfferKind $kind, string $key,
        ?string $resource = null, mixed $quantity = null, ?string $basisRevision = null): array {
        return $this->mutate($nation, function ($turn) use ($nation, $otherId, $kind, $key, $resource, $quantity, $basisRevision) {
            $pair = $this->diplomacy->pair($nation, $otherId, true);
            $other = $nation->getGame()->nations()->findOrFail($otherId);
            if (!app(GameParticipants::class)->canCommand($nation) || !app(GameParticipants::class)->canCommand($other)) {
                abort(422, 'Passive nations cannot process diplomatic offers.');
            }
            if ($kind === NationOfferKind::ResourceGrant && (!$resource || !$nation->getDetail()->resources()->get($resource)['grantable'])) abort(422, 'Choose a stockpiled resource.');
            if ($kind !== NationOfferKind::ResourceGrant && ($resource !== null || $quantity !== null)) abort(422, 'Treaties cannot contain grants.');
            $amount = $kind === NationOfferKind::ResourceGrant ? NationGrantService::quantity($quantity) : null;
            $requestHash = hash('sha256', json_encode([$kind->value, $resource, $amount, $basisRevision], JSON_THROW_ON_ERROR));
            $existing = NationOffer::where('relation_id', $pair->id)->where('sender_nation_id', $nation->getId())->where('request_key', $key)->first();
            if ($existing) {
                if ($existing->request_hash !== $requestHash) abort(409, 'This request key was already used.');
                return ['offer_id' => $existing->id];
            }
            $detail = $this->diplomacy->detail($pair, $turn);
            if ($kind !== NationOfferKind::ResourceGrant) {
                if ($basisRevision !== $detail?->revision) abort(409, 'The relationship changed. Refresh first.');
                $state = $detail?->state ?? RelationState::NoRelations;
                if ($state === RelationState::Allied || ($kind === NationOfferKind::Peace && $state === RelationState::Peace)) abort(409, 'That protection already exists.');
                if ($detail?->ends_on_turn_number !== null) abort(409, 'Wait until treaty cancellation completes.');
                $pending = NationOfferDetail::where('turn_id', $turn->getId())->where('status', NationOfferStatus::Pending->value)
                    ->whereIn('offer_id', NationOffer::where('relation_id', $pair->id)->where('kind', '!=', NationOfferKind::ResourceGrant->value)->select('id'))->exists();
                if ($pending) abort(409, 'A diplomatic offer is already pending between these nations.');
            }
            $pendingCount = NationOfferDetail::where('turn_id', $turn->getId())->where('status', NationOfferStatus::Pending->value)
                ->whereIn('offer_id', NationOffer::where('relation_id', $pair->id)->select('id'))->count();
            if ($pendingCount >= 20) abort(422, 'Resolve existing offers before sending more.');
            // A newly materialized neutral pair gets its first revision at proposal time.
            $detail ??= $this->diplomacy->detail($pair, $turn, true);
            $offer = NationOffer::create(['relation_id' => $pair->id, 'sender_nation_id' => $nation->getId(),
                'created_turn_id' => $turn->getId(), 'kind' => $kind, 'request_key' => $key, 'request_hash' => $requestHash,
                'basis_relation_revision' => $kind === NationOfferKind::ResourceGrant ? null : $detail->revision,
                'resource_id' => $resource ? $nation->getDetail()->resources()->get($resource)['id'] : null, 'quantity' => $amount]);
            NationOfferDetail::create(['offer_id' => $offer->id, 'game_id' => $nation->game_id,
                'turn_id' => $turn->getId(), 'status' => NationOfferStatus::Pending]);
            NationMessage::create(['relation_id' => $pair->id, 'sender_nation_id' => $nation->getId(), 'kind' => 'Offer',
                'offer_id' => $offer->id, 'created_turn_id' => $turn->getId(), 'original_turn_number' => $turn->getNumber()]);
            return ['offer_id' => $offer->id];
        });
    }

    public function respond(Nation $nation, int $offerId, string $action): array {
        return $this->mutate($nation, function ($turn) use ($nation, $offerId, $action) {
            if (!in_array($action, ['accept', 'decline', 'cancel'], true)) abort(422, 'Invalid offer action.');
            $offer = NationOffer::findOrFail($offerId);
            $pair = NationRelation::where('game_id', $nation->game_id)->findOrFail($offer->relation_id);
            $pair->otherId($nation->getId());
            $isSender = (int) $offer->sender_nation_id === $nation->getId();
            if (($action === 'cancel') !== $isSender) abort(403, 'Only the recipient may accept/decline; only the sender may cancel.');
            $detail = NationOfferDetail::where('offer_id', $offer->id)->where('turn_id', $turn->getId())->lockForUpdate()->firstOrFail();
            $target = match ($action) { 'accept' => NationOfferStatus::Accepted, 'decline' => NationOfferStatus::Declined, 'cancel' => NationOfferStatus::Cancelled };
            if ($detail->status === $target) return ['offer_id' => $offer->id, 'status' => $detail->status->name];
            if ($detail->status !== NationOfferStatus::Pending) abort(409, 'This offer is no longer pending.');
            $reason = null;
            if ($action === 'accept') {
                if ($offer->kind === NationOfferKind::ResourceGrant) {
                    $sender = $nation->getGame()->nations()->findOrFail($offer->sender_nation_id);
                    if (!app(GameParticipants::class)->canCommand($sender) || !app(GameParticipants::class)->canCommand($nation)) {
                        $target = NationOfferStatus::Invalid; $reason = 'ai_unsupported';
                    } elseif (!$this->grants->transfer($sender, $nation, $nation->getDetail()->resources()->key($offer->resource_id), $offer->quantity)) {
                        $target = NationOfferStatus::Invalid; $reason = 'insufficient_stock';
                    }
                } else {
                    $relation = $this->diplomacy->detail($pair, $turn);
                    $sender = $nation->getGame()->nations()->findOrFail($offer->sender_nation_id);
                    if ($offer->kind === NationOfferKind::Alliance && (!app(GameParticipants::class)->canCommand($sender) || !app(GameParticipants::class)->canCommand($nation))) {
                        $target = NationOfferStatus::Invalid; $reason = 'ai_unsupported';
                    } elseif (!$relation || $relation->revision !== $offer->basis_relation_revision) {
                        $target = NationOfferStatus::Invalid; $reason = 'relationship_changed';
                    } else {
                        $state = $offer->kind === NationOfferKind::Alliance ? RelationState::Allied : RelationState::Peace;
                        $this->diplomacy->change($pair, $turn, $state, $nation->getId(), $offer->id);
                        $this->diplomacy->cancelProtectedOrders($pair, $turn);
                    }
                }
            }
            $detail->update(['status' => $target, 'resolved_by_nation_id' => $nation->getId(), 'resolved_at' => now(), 'reason' => $reason]);
            $this->diplomacy->notice($pair, $turn, 'offer_result', ['offer_id' => $offer->id, 'kind' => $offer->kind->name,
                'status' => $target->name, 'resource_key' => $offer->resource_id ? \App\Services\Resources\ResourceCatalogue::forGame($nation->getGame())->key($offer->resource_id) : null, 'quantity' => $offer->quantity, 'reason' => $reason], $nation->getId());
            return ['offer_id' => $offer->id, 'status' => $target->name];
        });
    }

    private function context(Nation $nation): array {
        $game = $nation->getGame()->fresh();
        return ['game_id' => $game->getId(), 'nation_id' => $nation->getId(), 'turn_number' => Turn::getCurrentForGame($game)->getNumber(),
            'turn_context_revision' => $game->turn_context_revision];
    }

    public function inbox(Nation $nation): array {
        $this->assertAvailable($nation);
        $pairs = NationRelation::where('game_id', $nation->game_id)
            ->where(fn ($q) => $q->where('nation_a_id', $nation->getId())->orWhere('nation_b_id', $nation->getId()))->get();
        return $this->context($nation) + ['conversations' => $pairs->map(function ($pair) use ($nation) {
            $messages = NationMessage::where('relation_id', $pair->id)->whereNull('reverted_at');
            return ['other_nation_id' => $pair->otherId($nation->getId()), 'last_message_id' => (clone $messages)->max('id'),
                'last_action_message_id' => (clone $messages)->where('kind', '!=', 'Text')->max('id'),
                'unread' => (clone $messages)->where('id', '>', $pair->{$pair->readColumn($nation->getId())})
                    ->where(fn ($q) => $q->whereNull('sender_nation_id')->orWhere('sender_nation_id', '!=', $nation->getId()))->count()];
        })->all()];
    }

    public function conversation(Nation $nation, int $otherId, ?int $before = null): array {
        $this->assertAvailable($nation);
        $pair = $this->diplomacy->pair($nation, $otherId);
        $turn = Turn::getCurrentForGame($nation->getGame());
        $messages = $pair ? NationMessage::where('relation_id', $pair->id)->when($before, fn ($q) => $q->where('id', '<', $before))
            ->orderByDesc('id')->limit(51)->get() : collect();
        $hasMore = $messages->count() > 50; $messages = $messages->take(50)->reverse()->values();
        $offers = $pair ? NationOffer::where('relation_id', $pair->id)->whereIn('id', $messages->pluck('offer_id')->filter())
            ->get()->keyBy('id') : collect();
        $details = NationOfferDetail::where('turn_id', $turn->getId())->whereIn('offer_id', $offers->keys())->get()->keyBy('offer_id');
        return $this->context($nation) + ['other_nation_id' => $otherId, 'has_more' => $hasMore,
            'messages' => $messages->map(function ($message) use ($offers, $details, $nation) {
                $offer = $offers->get($message->offer_id); $detail = $details->get($message->offer_id);
                return ['id' => $message->id, 'sender_nation_id' => $message->sender_nation_id, 'kind' => $message->kind,
                    'body' => $message->body, 'turn_number' => $message->original_turn_number, 'created_at' => $message->created_at->toIso8601String(),
                    'reverted' => $message->reverted_at !== null, 'event_type' => $message->event_type, 'event_data' => $message->event_data,
                    'offer' => $offer ? ['id' => $offer->id, 'kind' => $offer->kind->name, 'sender_nation_id' => (int) $offer->sender_nation_id,
                        'resource_key' => $offer->resource_id ? \App\Services\Resources\ResourceCatalogue::forGame($nation->getGame())->key($offer->resource_id) : null, 'quantity' => $offer->quantity,
                        'status' => $detail?->status->name ?? 'Invalid', 'reason' => $detail?->reason] : null];
            })->all()];
    }

    public function markRead(Nation $nation, int $otherId, int $messageId): void {
        $this->assertAvailable($nation);
        $pair = $this->diplomacy->pair($nation, $otherId) ?? abort(404);
        NationMessage::where('relation_id', $pair->id)->findOrFail($messageId);
        $column = $pair->readColumn($nation->getId());
        NationRelation::whereKey($pair->id)->where($column, '<', $messageId)->update([$column => $messageId]);
    }
}

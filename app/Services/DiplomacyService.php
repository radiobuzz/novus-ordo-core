<?php
namespace App\Services;

use App\Domain\{NationOfferKind, NationOfferStatus, OrderType, RelationState};
use App\Models\{Game, Nation, NationMessage, NationOfferDetail, NationRelation, NationRelationDetail, Order, Turn};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Bilateral game rules. Call mutations under GameMutation; reads never create a relationship. */
final class DiplomacyService {
    private const int AI_MESSAGE_LIMIT = 50;

    public function enabled(Game $game): bool { return (bool) $game->diplomacy_enabled; }

    public function pair(Nation $nation, int $otherId, bool $create = false): ?NationRelation {
        if ($nation->getId() === $otherId) abort(422, 'Choose another nation.');
        $nation->getGame()->nations()->findOrFail($otherId);
        $ids = [$nation->getId(), $otherId]; sort($ids);
        $attributes = ['game_id' => $nation->game_id, 'nation_a_id' => $ids[0], 'nation_b_id' => $ids[1]];
        return $create ? NationRelation::firstOrCreate($attributes) : NationRelation::where($attributes)->first();
    }

    public function detail(NationRelation $pair, Turn $turn, bool $create = false): ?NationRelationDetail {
        if ((int) $pair->game_id !== $turn->getGameId()) abort(404);
        $key = ['relation_id' => $pair->id, 'turn_id' => $turn->getId()];
        return $create ? NationRelationDetail::firstOrCreate($key, [
            'game_id' => $pair->game_id, 'state' => RelationState::NoRelations, 'revision' => (string) Str::uuid(),
        ]) : NationRelationDetail::where($key)->first();
    }

    public function state(Nation $nation, ?Nation $other, ?Turn $turn = null): RelationState {
        if (!$other || !$this->enabled($nation->getGame())) return RelationState::NoRelations;
        if ($nation->equals($other)) return RelationState::Allied;
        $pair = $this->pair($nation, $other->getId());
        return $pair ? ($this->detail($pair, $turn ?? Turn::getCurrentForGame($nation->getGame()))?->state ?? RelationState::NoRelations) : RelationState::NoRelations;
    }

    public function export(Game $game, Turn $turn): array {
        if (!$this->enabled($game)) return [];
        return NationRelationDetail::where('nation_relation_details.game_id', $game->getId())->where('turn_id', $turn->getId())
            ->join('nation_relations', 'nation_relations.id', '=', 'relation_id')
            ->select('nation_relation_details.*', 'nation_a_id', 'nation_b_id')->get()
            ->map(fn ($row) => ['nation_a_id' => (int) $row->nation_a_id, 'nation_b_id' => (int) $row->nation_b_id,
                'state' => $row->state->name, 'revision' => $row->revision,
                'ends_on_turn_number' => $row->ends_on_turn_number, 'cancellation_by_nation_id' => $row->cancellation_by_nation_id])->all();
    }

    public function notice(NationRelation $pair, Turn $turn, string $event, array $data = [], ?int $actor = null): NationMessage {
        return NationMessage::create(['relation_id' => $pair->id, 'sender_nation_id' => $actor, 'kind' => 'Notice',
            'event_type' => $event, 'event_data' => $data, 'created_turn_id' => $turn->getId(), 'original_turn_number' => $turn->getNumber()]);
    }

    public function change(NationRelation $pair, Turn $turn, RelationState $state, ?int $actor = null, ?int $offer = null): void {
        $detail = $this->detail($pair, $turn, true);
        $detail->update(['state' => $state, 'revision' => (string) Str::uuid(), 'agreement_offer_id' => $offer,
            'ends_on_turn_number' => null, 'cancellation_by_nation_id' => null]);
        $this->invalidateOffers($pair, $turn, $offer);
        $this->notice($pair, $turn, 'relationship', ['state' => $state->name], $actor);
    }

    public function invalidateOffers(NationRelation $pair, Turn $turn, ?int $except = null): void {
        $ids = DB::table('nation_offers')->where('relation_id', $pair->id)->where('kind', '!=', NationOfferKind::ResourceGrant->value)
            ->when($except, fn ($query) => $query->where('id', '!=', $except))->pluck('id');
        NationOfferDetail::whereIn('offer_id', $ids)->where('turn_id', $turn->getId())->where('status', NationOfferStatus::Pending->value)
            ->update(['status' => NationOfferStatus::Invalid->value, 'reason' => 'relationship_changed', 'resolved_at' => now()]);
    }

    public function cancelTreaty(Nation $nation, int $otherId, string $revision): void {
        $turn = Turn::getCurrentForGame($nation->getGame());
        $pair = $this->pair($nation, $otherId) ?? abort(409, 'No treaty exists.');
        $detail = $this->detail($pair, $turn) ?? abort(409, 'No treaty exists.');
        if ($detail->revision !== $revision) abort(409, 'The relationship changed. Refresh first.');
        if (!$detail->state->protects()) abort(409, 'There is no treaty to cancel.');
        if ($detail->ends_on_turn_number !== null) return;
        $detail->update(['cancellation_by_nation_id' => $nation->getId(), 'ends_on_turn_number' => $turn->getNumber() + 5,
            'revision' => (string) Str::uuid()]);
        $this->invalidateOffers($pair, $turn);
        $this->notice($pair, $turn, 'cancellation', ['state' => $detail->state->name, 'ends_on_turn_number' => $detail->ends_on_turn_number], $nation->getId());
    }

    public function cancelProtectedOrders(NationRelation $pair, Turn $turn): void {
        foreach ([[$pair->nation_a_id, $pair->nation_b_id], [$pair->nation_b_id, $pair->nation_a_id]] as [$actor, $target]) {
            $territories = DB::table('territory_details')->where('turn_id', $turn->getId())->where('owner_nation_id', $target)->pluck('territory_id');
            Order::where('nation_id', $actor)->where('turn_id', $turn->getId())->whereIn('type', OrderType::getEngagingTypes())
                ->whereIn('target_territory_id', $territories)->delete();
        }
    }

    public function war(Nation $attacker, ?Nation $defender, Turn $turn): void {
        if (!$defender || $attacker->equals($defender) || !$this->enabled($attacker->getGame())) return;
        if ($this->state($attacker, $defender, $turn) !== RelationState::NoRelations) return;
        $this->change($this->pair($attacker, $defender->getId(), true), $turn, RelationState::War, $attacker->getId());
    }

    public function canPass(Nation $nation, \App\Models\Territory $territory, Turn $turn): bool {
        $owner = $territory->getDetail($turn)->getOwnerOrNull();
        return $owner && ($nation->equals($owner) || $this->state($nation, $owner, $turn) === RelationState::Allied);
    }

    /** Protected visitors sit out; an alliance with the owner never shields the territory. */
    public function defenders(\App\Models\Territory $territory, Nation $attacker, Turn $turn): \Illuminate\Support\Collection {
        $owner = $territory->getDetail($turn)->getOwnerOrNull();
        if (!$owner) return collect();
        if (!$this->enabled($territory->getGame())) return $territory->getDetail($turn)->getOwnerDivisions();
        return $territory->getGame()->activeDivisionsInTurn($turn)
            ->whereHas('details', fn ($q) => $q->where('turn_id', $turn->id)->where('territory_id', $territory->id))
            ->get()->filter(function ($division) use ($territory, $owner, $attacker, $turn) {
            if ($division->getDetail($turn)->territory_id !== $territory->getId()) return false;
            $nation = $division->getNation();
            if ($nation->equals($owner)) return true;
            return !$nation->equals($attacker) && $this->state($nation, $owner, $turn) === RelationState::Allied
                && !$this->state($nation, $attacker, $turn)->protects();
        });
    }

    public function resolveAttack(\App\Models\Territory $territory, Turn $current, Turn $next,
        \Illuminate\Support\Collection $divisions, ?\Illuminate\Support\Collection $guardResponders = null): ?\App\Models\Battle {
        if (!$this->enabled($territory->getGame())) return \App\Models\Battle::resolveBattle($territory, $current, $next, $divisions, $guardResponders);
        $active = $divisions->filter(fn ($d) => $d->getDetail($next)->isActive());
        if ($active->isEmpty()) return null;
        $attacker = $active->first()->getNation();
        $owner = $territory->getDetail($next)->getOwnerOrNull();
        if ($this->canPass($attacker, $territory, $next)) {
            foreach ($active as $division) {
                $meta = \App\Domain\DivisionType::getMeta($division->getDivisionType());
                if (!$meta->canFly) $division->getDetail($next)->moveTo($territory);
            }
            return null;
        }
        if ($this->state($attacker, $owner, $next)->protects()) return null;
        // Compare the owner at command time, including an explicitly captured neutral owner.
        $deliberate = $active->contains(function ($division) use ($current, $owner) {
            $order = $division->getDetail($current)->getOrder();
            return $order->intent_captured && $order->intended_owner_nation_id === $owner?->getId();
        });
        $defenders = $this->defenders($territory, $attacker, $next);
        if ($deliberate) {
            $this->war($attacker, $owner, $next);
            foreach ($defenders->map(fn ($d) => $d->getNation())->unique('id') as $defender) $this->war($attacker, $defender, $next);
        }
        $battle = \App\Models\Battle::resolveBattle($territory, $current, $next, $active, $guardResponders);
        $participants = [$attacker->getId() => 'attacker'];
        if ($owner) $participants[$owner->getId()] = 'defender';
        foreach ($defenders as $division) $participants[$division->getNationId()] = 'defender';
        foreach ($participants as $nationId => $side) DB::table('battle_participants')->insert([
            'battle_id' => $battle->getId(), 'nation_id' => $nationId, 'side' => $side,
        ]);
        return $battle;
    }

    /** Resolve the last protected orders before expiring treaties in the new planning turn. */
    public function finishTurn(Game $game, Turn $next): void {
        if (!$this->enabled($game)) return;
        foreach (NationRelationDetail::where('game_id', $game->getId())->where('turn_id', $next->getId())
            ->whereNotNull('ends_on_turn_number')->where('ends_on_turn_number', '<=', $next->getNumber())->get() as $detail) {
            $this->change(NationRelation::findOrFail($detail->relation_id), $next, RelationState::NoRelations);
        }
        // Also return protected bystanders after conquest changes their host.
        $connections = \App\Models\Territory::getTerritoryConnections($game);
        $territories = $game->territories()->get()->keyBy('id');
        $owners = DB::table('territory_details')->where('turn_id', $next->id)->pluck('owner_nation_id', 'territory_id');
        $homes = $territories->filter(fn ($t) => $t->getTerrainType() !== \App\Domain\TerrainType::Water)->groupBy(fn ($t) => $owners[$t->id] ?? 0);
        $notices = [];
        foreach ($game->activeDivisionsInTurn($next)->get() as $division) {
            $detail = $division->getDetail($next); $origin = $detail->getTerritory(); $nation = $division->getNation();
            if ($this->canPass($nation, $origin, $next)) continue;
            $owner = $origin->getDetail($next)->getOwnerOrNull();
            $owned = $homes->get($nation->id, collect())->keyBy('id');
            $frontier = [$origin->getId()]; $seen = []; $destination = null;
            while ($frontier && !$destination) {
                sort($frontier); $nextFrontier = [];
                foreach ($frontier as $id) {
                    if (isset($seen[$id])) continue;
                    $seen[$id] = true;
                    if ($owned->has($id)) { $destination = $owned[$id]; break; }
                    foreach ($connections[$id] ?? [] as $edge) {
                        if (!isset($seen[$edge->connectedTerritoryId])) $nextFrontier[] = $edge->connectedTerritoryId;
                    }
                }
                $frontier = array_values(array_unique($nextFrontier));
            }
            // Disconnected map components have equal infinite graph distance; use the same ID tie-break.
            $destination ??= $owned->sortKeys()->first();
            if ($destination) $detail->moveTo($destination); else $detail->disband();
            if ($owner && !$nation->equals($owner)) {
                $pair = $this->pair($nation, $owner->getId(), true);
                $event = $destination ? 'troops_returned' : 'troops_disbanded';
                $key = $pair->id . ':' . $nation->getId() . ':' . $event;
                $notices[$key] ??= [$pair, $event, $nation->getId(), 0];
                $notices[$key][3]++;
            }
        }
        foreach ($notices as [$pair, $event, $nationId, $count]) $this->notice($pair, $next, $event, ['nation_id' => $nationId, 'count' => $count]);
    }

    public function aiView(Nation $nation, Turn $turn): array {
        if (!$this->enabled($nation->getGame())) return ['relations' => [], 'offers' => [], 'messages' => []];
        $relations = array_values(array_filter($this->export($nation->getGame(), $turn),
            fn ($r) => in_array($nation->getId(), [$r['nation_a_id'], $r['nation_b_id']], true)));
        $pairs = NationRelation::where('game_id', $nation->game_id)
            ->where(fn ($q) => $q->where('nation_a_id', $nation->id)->orWhere('nation_b_id', $nation->id))->get()->keyBy('id');
        $offers = DB::table('nation_offers')->join('nation_offer_details', 'offer_id', '=', 'nation_offers.id')
            ->whereIn('relation_id', $pairs->keys())->where('turn_id', $turn->id)->where('status', NationOfferStatus::Pending->value)
            ->where('kind', NationOfferKind::Peace->value)->get(['nation_offers.id', 'sender_nation_id', 'relation_id'])
            ->map(fn ($o) => ['id' => (int) $o->id, 'sender_nation_id' => (int) $o->sender_nation_id,
                'other_nation_id' => $pairs[$o->relation_id]->otherId($nation->id)])->all();
        $messages = NationMessage::whereIn('relation_id', $pairs->keys())->where('kind', 'Text')->whereNull('reverted_at')
            ->orderByDesc('id')->limit(self::AI_MESSAGE_LIMIT)->get()->reverse()->values()
            ->map(function (NationMessage $message) use ($pairs, $nation) {
                return ['id' => (int) $message->id,
                    'other_nation_id' => $pairs[$message->relation_id]->otherId($nation->id),
                    'sender_nation_id' => (int) $message->sender_nation_id,
                    'body' => $message->body,
                    'turn_number' => (int) $message->original_turn_number];
            })->all();
        return compact('relations', 'offers', 'messages');
    }

    public function applyAi(Nation $nation, array $actions): void {
        if (!$actions) return;
        if (!$this->enabled($nation->getGame())) abort(409, 'Diplomacy is unavailable.');
        $messages = app(NationCommunicationService::class);
        foreach ($actions as $action) {
            if ($action['action'] === 'send_message') {
                $messages->send($nation, $action['nation_id'], $action['body'], (string) Str::uuid());
            } elseif ($action['action'] === 'propose_peace') {
                $pair = $this->pair($nation, $action['nation_id']);
                $basis = $pair ? $this->detail($pair, Turn::getCurrentForGame($nation->getGame()))?->revision : null;
                $messages->propose($nation, $action['nation_id'], NationOfferKind::Peace, (string) Str::uuid(), basisRevision: $basis);
            } elseif (in_array($action['action'], ['accept_peace', 'decline_peace'], true)) {
                $offer = \App\Models\NationOffer::findOrFail($action['offer_id']);
                if ($offer->kind !== NationOfferKind::Peace) abort(422, 'Automated nations only handle peace offers.');
                $messages->respond($nation, $offer->id, $action['action'] === 'accept_peace' ? 'accept' : 'decline');
            } else abort(422, 'Unsupported automated diplomacy action.');
        }
    }

    public function copyTurn(Game $game, Turn $current, Turn $next): void {
        if (!$this->enabled($game)) return;
        foreach ([NationRelationDetail::class, NationOfferDetail::class] as $model) {
            foreach ($model::where('game_id', $game->getId())->where('turn_id', $current->getId())->get() as $detail) {
                $detail->replicateForTurn($next)->save();
            }
        }
    }

    public function beforeRollback(Game $game, Turn $turn): void {
        if (!$this->enabled($game)) return;
        NationMessage::whereIn('relation_id', NationRelation::where('game_id', $game->getId())->select('id'))
            ->where('created_turn_id', $turn->getId())->where('kind', '!=', 'Text')->update(['reverted_at' => now()]);
    }
}

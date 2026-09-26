<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Domain\{NationOfferKind, RelationState, ResourceType};
use App\Models\{Game, Nation, NationMessage, NationOfferDetail};
use App\Services\{DiplomacyService, NationCommunicationService};
use App\Integrations\AIPlayers\GameAdapter;
use ExperimentalAI\{Plan, Runner, Setup};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
$check = function ($condition, $message) { if (!$condition) throw new RuntimeException($message); };
$game = Game::createNew(null, fn ($g) => app(Setup::class)->populate($g, ['count' => 3, 'seed' => 'diplomacy-peace']));
$adapter = app(GameAdapter::class); $status = $adapter->status($game);
$recipient = Nation::findOrFail($status['next_nation_id']);
$others = $game->nations()->where('id', '!=', $recipient->id)->orderBy('id')->get();
$sender = $others->first(); $outsider = $others->last();
DB::table('ai_players')->where('nation_id', $recipient->id)->update(['aggression' => 20]);
$messages = app(NationCommunicationService::class); $rules = app(DiplomacyService::class);
$incoming = $messages->send($sender, $recipient->id, 'Can we keep the northern border peaceful?', (string) Str::uuid());
$offer = $messages->propose($sender, $recipient->id, NationOfferKind::Peace, (string) Str::uuid());
$check(NationOfferDetail::where('offer_id', $offer['offer_id'])->first()->status->name === 'Pending', 'AI answered outside its normal decision');
foreach ([NationOfferKind::Alliance, NationOfferKind::ResourceGrant] as $kind) {
    try {
        $messages->propose($sender, $recipient->id, $kind, (string) Str::uuid(), $kind === NationOfferKind::ResourceGrant ? ResourceType::Capital : null, $kind === NationOfferKind::ResourceGrant ? '1' : null);
        throw new RuntimeException('Unsupported AI offer accepted');
    } catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $error) { $check($error->getStatusCode() === 422, 'Unexpected AI rejection'); }
}
$observation = $adapter->observe($game, $recipient->id);
$check($observation['diplomacy']['offers'][0]['id'] === $offer['offer_id'], 'Own peace offer absent from observation');
$observed = $observation['diplomacy']['messages'][0] ?? null;
$check($observed && $observed['id'] === $incoming['message_id'] && $observed['sender_nation_id'] === $sender->id
    && $observed['other_nation_id'] === $sender->id && $observed['body'] === 'Can we keep the northern border peaceful?',
    'Private incoming text absent from AI observation');
$check(collect($adapter->observe($game, $outsider->id)['diplomacy']['messages'])->doesntContain('id', $incoming['message_id']),
    'Private text leaked to an unrelated AI nation');
$messagePlan = Plan::normalize(['bids' => [], 'deployments' => [], 'orders' => [], 'disband' => [], 'memory' => [],
    'explanation' => 'Replying.', 'diplomacy' => [['action' => 'send_message', 'nation_id' => $sender->id,
        'body' => 'Yes. I will consider your proposal.']]]);
$rules->applyAi($recipient, $messagePlan['diplomacy']);
$reply = NationMessage::where('sender_nation_id', $recipient->id)->where('kind', 'Text')->latest('id')->first();
$check($reply?->body === 'Yes. I will consider your proposal.', 'AI text reply was not stored');
$check(count($adapter->observe($game, $recipient->id)['diplomacy']['messages']) === 2, 'AI conversation did not include outgoing text');
$pair = $rules->pair($sender, $recipient->id);
for ($i = 0; $i < 55; $i++) NationMessage::create(['relation_id' => $pair->id, 'sender_nation_id' => $sender->id,
    'kind' => 'Text', 'body' => "Bounded message $i", 'created_turn_id' => $game->getCurrentTurn()->id,
    'original_turn_number' => $game->getCurrentTurn()->getNumber()]);
$bounded = $adapter->observe($game, $recipient->id)['diplomacy']['messages'];
$check(count($bounded) === 50 && $bounded[0]['body'] === 'Bounded message 5' && $bounded[49]['body'] === 'Bounded message 54',
    'AI message history is not the latest 50 in chronological order');
$context = $adapter->status($game) + ['nation_id' => $recipient->id];
$result = app(Runner::class)->step($game, $context);
$check($result['status'] === 'played', 'AI turn failed');
$check($rules->state($sender, $recipient) === RelationState::Peace, 'Normal AI turn did not establish peace');
$count = NationMessage::count();
$check(app(Runner::class)->step($game, $context)['status'] === 'already_processed', 'AI step replayed');
$check(NationMessage::count() === $count, 'AI retry duplicated diplomatic notice');
$old = ['bids' => [], 'deployments' => [], 'orders' => [], 'disband' => [], 'memory' => [], 'explanation' => 'Original script'];
$check(Plan::normalize($old)['diplomacy'] === [], 'Original scripts require a new field');
try { Plan::normalize($old + ['diplomacy' => [['action' => 'accept_grant', 'offer_id' => 1]]]); throw new RuntimeException('Unsupported script action accepted'); }
catch (InvalidArgumentException) {}
foreach (['', str_repeat('x', 2001)] as $body) {
    try { Plan::normalize($old + ['diplomacy' => [['action' => 'send_message', 'nation_id' => $sender->id, 'body' => $body]]]); throw new RuntimeException('Invalid AI message accepted'); }
    catch (InvalidArgumentException) {}
}
$duplicates = array_fill(0, 2, ['action' => 'send_message', 'nation_id' => $sender->id, 'body' => 'Repeated recipient']);
try { Plan::normalize($old + ['diplomacy' => $duplicates]); throw new RuntimeException('Duplicate AI recipient accepted'); }
catch (InvalidArgumentException) {}
$tooMany = array_map(fn ($id) => ['action' => 'send_message', 'nation_id' => $id, 'body' => 'Bounded message'], range(100, 105));
try { Plan::normalize($old + ['diplomacy' => $tooMany]); throw new RuntimeException('AI message limit exceeded'); }
catch (InvalidArgumentException) {}
echo "PASS: AI reads and sends private text, accepts peace once, rejects unsupported offers, and keeps old script compatibility.\n";

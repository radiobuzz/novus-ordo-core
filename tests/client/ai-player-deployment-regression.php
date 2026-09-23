<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Integrations\AIPlayers\GameAdapter;
use App\Models\Game;
use ExperimentalAI\V1Experimental;
use Illuminate\Support\Facades\DB;

$game = Game::getCurrent(); $adapter = app(GameAdapter::class); $status = $adapter->status($game);
$id = $status['next_nation_id']; $assignment = DB::table('ai_players')->where('nation_id', $id)->first();
$view = $adapter->observe($game, $id);
$plan = (new V1Experimental)->decide($view, json_decode($assignment->memory ?? '[]', true), [
    'aggression' => $assignment->aggression, 'seed' => $assignment->seed, 'protect_humans' => $status['protect_humans'],
], $adapter->forecast(...));
$base = $adapter->forecast($view['planning'], $view['pools'], $plan['bids'], $view['production_raw']);
$cost = [];
foreach ($plan['deployments'] as $deployment) foreach ($view['definitions'][$deployment['division_type']]['deployment_costs'] as $resource => $amount) $cost[$resource] = ($cost[$resource] ?? 0) + $amount * 1000000;
foreach ($cost as $resource => $amount) if ($amount > $base[$resource]['closing']) throw new RuntimeException('Plan spends post-deployment reallocation: ' . $resource);
DB::beginTransaction();
try { $adapter->apply($game, $id, $plan); } finally { DB::rollBack(); }
if ($status['paused']) $adapter->control($game, $status, 'resume');
echo "PASS deployment batch fits pre-command resources and normal engine validation; isolated failed game resumed\n";

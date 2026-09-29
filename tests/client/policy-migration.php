<?php
$app = require __DIR__ . '/isolated-app.php';
use App\Models\Game;
use App\Services\AdminGameService;
use App\Services\Policies\PolicyCatalogue;
use Illuminate\Support\Facades\{DB, Schema};

$fixture = json_decode(file_get_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/policy-fixture.json'), true, flags: JSON_THROW_ON_ERROR);
$check = function ($value, $message) { if (!$value) throw new RuntimeException($message); };
$game = Game::findOrFail($fixture['game_id']);
$survivor = app(PolicyCatalogue::class)->cloneSet($fixture['set_id']);
$foreignBefore = DB::table('nation_policy_choices')->where('game_id', $fixture['other_game_id'])->get()->toJson();
app(AdminGameService::class)->lifecycle($game, 'delete', $game->turn_context_revision);
$check(!Game::find($game->id), 'Populated game deletion failed');
$check(DB::table('nation_policy_choices')->where('game_id', $game->id)->count() === 0, 'Deleted game choices remain');
$check(app(PolicyCatalogue::class)->load($survivor['set']['id'])['set']['source_policy_set_id'] === null, 'Game clone provenance not cleared');
$check(DB::table('nation_policy_choices')->where('game_id', $fixture['other_game_id'])->get()->toJson() === $foreignBefore, 'Deletion affected another game');

// Rehearse only the new migration; check all retained economic/gameplay records exactly.
$signature = function () {
    $result = [];
    foreach (['games', 'nation_details', 'territory_details', 'nation_resource_stockpiles', 'turns'] as $table) {
        $rows = DB::table($table)->orderBy('id')->get()->map(function ($row) {
            unset($row->policy_testing_enabled, $row->policy_report);
            return $row;
        });
        $result[$table] = hash('sha256', $rows->toJson());
    }
    return $result;
};
$before = $signature();
$migration = require __DIR__ . '/../../database/migrations/2026_09_27_000000_create_policy_foundation.php';
$migration->down();
$check(!Schema::hasTable('policy_sets') && !Schema::hasColumn('nation_details', 'policy_report'), 'Migration down incomplete');
$migration->up();
$check($signature() === $before, 'Migration rehearsal changed existing economy/gameplay state');
$check(DB::table('policy_sets')->count() === 0 && DB::table('games')->where('policy_testing_enabled', true)->count() === 0, 'Migration opted existing games into policies');
try {
    DB::table('policy_sets')->insert(['kind' => 'game', 'game_id' => null, 'name' => 'Invalid owner']);
    throw new RuntimeException('Invalid policy ownership accepted by database');
} catch (Illuminate\Database\QueryException) {}
$other = Game::findOrFail($fixture['other_game_id']);
$turn = $other->getCurrentTurn();
$next = $other->fresh()->tryNextTurn($turn);
$check($next->getNumber() === $turn->getNumber() + 1, 'Populated existing game could not advance without policies');
$other->fresh()->rollbackLastTurn($next->id);
$check($other->fresh()->getCurrentTurn()->id === $turn->id, 'Populated existing game could not roll back');
echo "PASS: populated game cleanup, surviving clones, cross-game isolation, migration down/up preserving gameplay state, database ownership constraint, existing-game opt-out and populated legacy turn/rollback.\n";

<?php
$app = require __DIR__ . '/isolated-app.php';
require_once __DIR__ . '/generated-map-fixture.php';
use App\Models\Game;
use Illuminate\Support\Facades\{DB, Schema};
use Symfony\Component\Process\Process;
$root = getenv('NO7_ENTRY_TEST_ROOT');
$check = function ($condition, $message) { if (!$condition) throw new RuntimeException($message); };
$tables = ['games', 'nation_relations', 'nation_relation_details', 'nation_messages', 'nation_offers', 'nation_offer_details', 'nation_resource_stockpiles'];
$signature = fn () => array_map(fn ($table) => hash('sha256', DB::table($table)->orderBy('id')->get()->toJson()), $tables);
$before = $signature();
$dump = new Process(['mariadb-dump', '--socket=' . $root . '/mysql.sock', '-u', 'root', '--single-transaction', '--skip-comments', 'no7_entry_test']);
$dump->setTimeout(120); $dump->mustRun();
$backup = $root . '/diplomacy-rehearsal.sql'; file_put_contents($backup, $dump->getOutput()); chmod($backup, 0600);
try {
    $migration = require __DIR__ . '/../../database/migrations/2026_09_25_000000_create_primitive_diplomacy.php';
    $migration->down();
    $check(!Schema::hasTable('nation_messages') && !Schema::hasColumn('orders', 'intent_captured'), 'Migration down incomplete');
    $migration->up();
    $check(DB::table('games')->where('diplomacy_enabled', true)->count() === 0, 'Migration unexpectedly enabled existing games');
    $check(DB::table('games')->whereNull('turn_context_revision')->count() === 0, 'Existing games missing revision');
    $check(Game::createNew(generatedMapFixture())->diplomacy_enabled, 'New game did not opt into diplomacy');
} finally {
    // Test-only rehearsal restores this temporary database even if a migration assertion fails.
    DB::disconnect();
    $restore = new Process(['mariadb', '--socket=' . $root . '/mysql.sock', '-u', 'root', 'no7_entry_test']);
    $restore->setInput(fopen($backup, 'r')); $restore->setTimeout(120); $restore->mustRun();
    DB::reconnect();
}
$check($signature() === $before, 'Backup restore changed authoritative fixture data');
echo "PASS: migration down/up, existing-game opt-out, new-game opt-in and exact restoration of backed-up game/diplomacy/resource data.\n";

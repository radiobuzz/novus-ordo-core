<?php
// All mutations are confined to the explicitly configured disposable database.
$app = require __DIR__ . '/isolated-app.php';
use App\Models\NationColorAssignment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Validation\ValidationException;

Artisan::call('migrate', ['--force' => true]);
$check = function (bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); };
$check(DB::table('nation_colors')->count() === 28, 'Expected 28 colours');
$check(DB::table('nation_colors')->where('primary_allowed', true)->count() === 24, 'Expected 24 primary colours');
$check(DB::table('nation_color_assignments')->count() === DB::table('nations')->count(), 'Backfill missed nations');
DB::beginTransaction();
try {
    $nation = App\Models\Nation::firstOrFail();
    $game = $nation->getGame();
    $original = NationColorAssignment::findOrFail($nation->getId());
    $user = $nation->user_id;
    $primary = $original->primary_color_id;
    $secondary = $original->secondary_color_id;
    $beforeBudget = $nation->getDetail()->exportBudget();
    $unused = DB::table('nation_colors')->where('primary_allowed', true)->whereNotIn('id', NationColorAssignment::where('game_id', $game->getId())->pluck('primary_color_id'))->value('id');
    NationColorAssignment::choose($nation, $unused, $primary);
    $check(NationColorAssignment::find($nation->getId())->primary_color_id === $unused, 'Choice not persisted');
    $check($nation->getDetail()->exportBudget() == $beforeBudget, 'Colours changed the economy');
    $otherId = DB::table('nations')->insertGetId([
        'game_id' => $game->getId(), 'user_id' => $user, 'name' => 'Colour fixture', 'nation_setup_status' => 0,
    ]);
    NationColorAssignment::assignAvailable($game->getId(), $otherId);
    $other = NationColorAssignment::findOrFail($otherId);
    try { NationColorAssignment::choose($nation, $other->primary_color_id, $secondary); throw new RuntimeException('Allowed duplicate primary'); }
    catch (ValidationException) {}
    NationColorAssignment::choose($nation, $unused, $other->primary_color_id);
    $check(NationColorAssignment::find($nation->getId())->secondary_color_id === $other->primary_color_id, 'Secondary reuse rejected');
    try {
        DB::table('nation_color_assignments')->where('nation_id', $otherId)->update(['primary_color_id' => $unused]);
        throw new RuntimeException('Missing database uniqueness constraint');
    } catch (Illuminate\Database\QueryException $error) { $check($error->getCode() === '23000', 'Unexpected uniqueness error'); }
    try { NationColorAssignment::choose($nation, 999, $secondary); throw new RuntimeException('Allowed invalid catalogue ID'); }
    catch (ValidationException) {}
    $otherGame = App\Models\Game::where('id', '!=', $game->getId())->firstOrFail();
    $check(count(NationColorAssignment::exportForGame($otherGame)['colors']) === 28, 'Catalogue not shared between games');
    foreach ([25, 26, 27, 28] as $neutral) {
        try { NationColorAssignment::choose($nation, $neutral, $secondary); throw new RuntimeException('Allowed neutral primary'); }
        catch (ValidationException) {}
        NationColorAssignment::choose($nation, $unused, $neutral);
        $check(NationColorAssignment::find($nation->getId())->secondary_color_id === $neutral, 'Neutral secondary rejected');
    }
    // Fill every primary slot, then prove nation creation rolls back cleanly.
    while (NationColorAssignment::where('game_id', $game->getId())->count() < 24) {
        $id = DB::table('nations')->insertGetId(['game_id' => $game->getId(), 'user_id' => $user, 'name' => 'Palette capacity fixture', 'nation_setup_status' => 0]);
        NationColorAssignment::assignAvailable($game->getId(), $id);
    }
    $freshUser = new App\Models\User;
    $freshUser->name = 'palette-capacity-fixture'; $freshUser->email = 'palette-capacity@example.test';
    $freshUser->password = 'not-a-login-fixture'; $freshUser->save();
    $count = DB::table('nations')->count();
    try { App\Models\NewNation::create($game, $freshUser, 'No free colour'); throw new RuntimeException('Capacity silently exceeded'); }
    catch (ValidationException) {}
    $check(DB::table('nations')->count() === $count, 'Failed creation leaked an unfinished nation');
    echo "PASS: 24-colour backfill, ownership, primary uniqueness at application/database layers, secondary reuse, invalid IDs, unchanged economy and capacity rollback.\n";
} finally { DB::rollBack(); }

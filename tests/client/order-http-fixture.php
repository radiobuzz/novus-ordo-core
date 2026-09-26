<?php
require __DIR__ . '/isolated-app.php';
use App\Models\{Division, DivisionDetail, Game, Nation};
use App\Domain\DivisionType;
use Illuminate\Support\Facades\DB;
$file = getenv('NO7_ENTRY_TEST_ROOT') . '/order-http-fixture.json';
if (($argv[1] ?? '') === 'cleanup') {
    $fixture = json_decode(file_get_contents($file), true);
    Division::where('game_id', $fixture['game_id'])->whereIn('id', $fixture['created_ids'])->delete();
    unlink($file); echo "Removed isolated HTTP units.\n"; exit;
}
if (file_exists($file)) throw new RuntimeException('Clean up the previous fixture first.');
$seed = json_decode(file_get_contents(getenv('NO7_ENTRY_TEST_ROOT') . '/diplomacy-fixture.json'), true);
$fixture = DB::transaction(function () use ($seed) {
    $game = Game::findOrFail($seed['game_id']); $nation = Nation::findOrFail($seed['nations'][0]);
    $other = Nation::findOrFail($seed['nations'][1]); $turn = $game->getCurrentTurn();
    $home = $nation->getDetail()->territories()->get(); $origin = $home->first();
    $target = $home->first(fn ($t) => $origin->connectedTerritories()->whereKey($t->id)->exists());
    if (!$target) throw new RuntimeException('No owned adjacent target');
    $ids = [];
    foreach (range(0,50) as $i) {
        $d = new Division(); $d->game_id = $game->id; $d->nation_id = $i === 50 ? $other->id : $nation->id;
        $d->division_type = DivisionType::Infantry->value; $d->save(); DivisionDetail::create($d, $origin); $ids[] = $d->id;
    }
    return ['created_ids' => $ids, 'unit_ids' => array_slice($ids,0,50), 'foreign_unit_id' => $ids[50],
        'game_id'=>$game->id,'nation_id'=>$nation->id,'user_id'=>$nation->user_id,'username'=>App\Models\User::findOrFail($nation->user_id)->name,'turn_number'=>$turn->getNumber(),
        'turn_context_revision'=>$game->turn_context_revision,'destination'=>$target->id];
});
file_put_contents($file, json_encode($fixture)); echo "Created isolated HTTP units.\n";

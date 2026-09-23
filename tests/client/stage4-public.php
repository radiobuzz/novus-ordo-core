<?php
// Read-only checks against the explicitly isolated classic/generated fixtures.
$app = require __DIR__ . '/isolated-app.php';
use App\Models\{Game, TerritoryDetail, LeaderDetail};
use App\Domain\{ResourceType, TerrainType};
$checked = 0;
foreach (Game::where('is_active', true)->get() as $game) {
    $turn = $game->getCurrentTurn();
    $all = TerritoryDetail::exportAllTurnPublicInfo($turn);
    foreach ($all as $row) {
        $territory = $game->territories()->findOrFail($row->territory_id);
        $expected = collect(TerrainType::getResourceProductionByResource($territory->getTerrainType()))
            ->mapWithKeys(fn ($rate, $type) => [ResourceType::from($type)->name => $rate])->all();
        if ($expected != $row->base_productivity) throw new RuntimeException('Terrain rates differ: ' . json_encode([$expected, $row->base_productivity]));
        if ($row->production_population_unit !== TerritoryDetail::UNIT_OF_POPULATION_SIZE) throw new RuntimeException('Wrong population unit');
        if ($row->owner_nation_id !== null) {
            $single = $territory->getDetail($turn)->export();
            if ($single->base_productivity != $row->base_productivity) throw new RuntimeException('Single/bulk rates differ');
            $population = $row->stats[0]->value;
            $loyalty = collect($row->loyalties)->firstWhere('nation_id', $row->owner_nation_id)['loyalty_ratio'] ?? 0;
            foreach ($row->owner_production as $resource => $amount) {
                $potential = $expected[$resource] * $population / $row->production_population_unit * $loyalty;
                if (abs($amount - $potential) > 0.000001) throw new RuntimeException('Public production breakdown differs');
            }
            $checked++;
            break;
        }
    }
    foreach (LeaderDetail::getAll($turn) as $leader) {
        $public = $leader->export();
        if ($leader->game_id !== $game->getId() || !property_exists($public, 'picture_src')) throw new RuntimeException('Public leader scope/portrait missing');
    }
}
if ($checked < 2) throw new RuntimeException('Expected independent classic/generated fixtures');
echo "PASS: public single/bulk terrain rates, loyal-population calculation, population units and existing public leader portraits across multiple games.\n";

<?php

namespace ExperimentalAI;

use App\Domain\Password;
use App\Models\{Game, NewNation, User};
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Support\Str;

/** Provisions passive test nations while preserving a connected human homeland. */
final class Setup
{
    public static function options(array $input): array
    {
        return Validator::make($input, ['count' => 'sometimes|required|integer|between:0,10'])->validate() + ['count' => 0];
    }

    public function populate(Game $game, array $settings): void
    {
        $count = (int) self::options($settings)['count'];
        if (!$count) return;
        if (!app(\App\Integrations\AIPlayers\GameAdapter::class)->available()) abort(422, 'Passive players are disabled or their tables are unavailable.');
        $available = $game->freeSuitableTerritoriesInTurn()->get()->keyBy('id')->all();
        if (count($available) < ($count + 1) * Game::NUMBER_OF_STARTING_TERRITORIES + $count) {
            abort(422, 'This map lacks starting land and neutral expansion space for the requested passive players and a human.');
        }
        $links = DB::table('territory_connections')->where('game_id', $game->getId())->where('is_connected_by_land', true)->get()->groupBy('territory_id');
        $clusters = [];
        for ($slot = 0; $slot <= $count; $slot++) {
            $best = null; $bestScore = -INF;
            foreach ($available as $id => $origin) {
                $cluster = [$id]; $seen = [$id => true];
                for ($cursor = 0; $cursor < count($cluster) && count($cluster) < 5; $cursor++) {
                    $neighbors = $links->get($cluster[$cursor], collect())->pluck('connected_territory_id')->all();
                    usort($neighbors, fn ($a, $b) => (($available[$b] ?? null)?->getMaxPopulationSize() ?? 0) <=> (($available[$a] ?? null)?->getMaxPopulationSize() ?? 0));
                    foreach ($neighbors as $next) if (isset($available[$next]) && !isset($seen[$next])) {
                        $cluster[] = (int) $next; $seen[$next] = true; if (count($cluster) === 5) break;
                    }
                }
                if (count($cluster) !== 5) continue;
                $score = 0;
                foreach ($cluster as $territoryId) {
                    $territory = $available[$territoryId];
                    $score += min(1000000, $territory->getMaxPopulationSize()) / 1000000;
                    $score += in_array($territory->getTerrainType()->name, ['Plain', 'River'], true) ? 1 : 0;
                }
                $score += hexdec(substr(hash('sha256', "passive:{$game->getId()}:$slot:$id"), 0, 4)) / 655360;
                if ($score > $bestScore) { $bestScore = $score; $best = $cluster; }
            }
            if (!$best) abort(422, 'Could not place the requested passive players while preserving a connected human homeland.');
            $clusters[] = $best;
            foreach ($best as $territoryId) unset($available[$territoryId]);
        }
        DB::table('ai_player_games')->insert(['game_id' => $game->getId(), 'generation' => (string) Str::uuid(), 'paused' => false]);
        $names = ['Aster', 'Bracken', 'Cobalt', 'Dawn', 'Ember', 'Flint', 'Garnet', 'Harbor', 'Ivory', 'Juniper'];
        for ($index = 0; $index < $count; $index++) {
            $user = User::create('passive-' . $game->getId() . '-' . ($index + 1) . '-' . Str::lower(Str::random(6)), Password::randomize());
            $nation = NewNation::create($game, $user, $names[$index])->finishSetup($clusters[$index + 1], $names[$index] . ' Council');
            DB::table('ai_players')->insert(['nation_id' => $nation->getId(), 'game_id' => $game->getId()]);
        }
    }
}

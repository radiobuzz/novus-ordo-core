<?php

namespace ExperimentalAI;

use App\Domain\Password;
use App\Models\{Game, NewNation, Territory, User};
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Support\Str;

/** Experiment-only provisioning; invoked inside normal game creation's transaction. */
final class Setup
{
    public static function options(array $input): array {
        return Validator::make($input, [
            'count' => 'sometimes|required|integer|between:0,10',
            'behavior' => 'sometimes|required|in:mixed,cautious,balanced,aggressive',
            'protect_humans' => 'sometimes|required|boolean', 'seed' => 'sometimes|nullable|string|max:64',
        ])->validate() + ['count' => 0, 'behavior' => 'mixed', 'protect_humans' => false, 'seed' => 'experimental'];
    }
    public function populate(Game $game, array $settings): void {
        $settings = self::options($settings); $count = (int) $settings['count'];
        if (!$count) return;
        if (!app(\App\Integrations\AIPlayers\GameAdapter::class)->available()) abort(422, 'Experimental AI is disabled or its migration has not been installed.');
        $territories = $game->freeSuitableTerritoriesInTurn()->get();
        $available = $territories->keyBy('id')->all();
        if (count($available) < ($count + 1) * Game::NUMBER_OF_STARTING_TERRITORIES + $count) abort(422, 'This map lacks starting land and neutral expansion space for the requested bots and a human.');
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
                        $cluster[] = (int) $next; $seen[$next] = true;
                        if (count($cluster) === 5) break;
                    }
                }
                if (count($cluster) !== 5) continue;
                $score = 0;
                foreach ($cluster as $tid) {
                    $t = $available[$tid];
                    $score += min(1000000, $t->getMaxPopulationSize()) / 1000000;
                    $score += in_array($t->getTerrainType()->name, ['Plain', 'River'], true) ? 1 : 0;
                }
                $score += hexdec(substr(hash('sha256', ($settings['seed'] ?? 'experimental') . ":$slot:$id"), 0, 4)) / 655360;
                if ($score > $bestScore) { $bestScore = $score; $best = $cluster; }
            }
            if (!$best) abort(422, 'Could not place the requested bots while preserving a connected human homeland. Try fewer bots or a larger land area.');
            $clusters[] = $best;
            foreach ($best as $id) unset($available[$id]);
        }
        // The first, strongest legal cluster is left unclaimed for a human.
        DB::table('ai_player_games')->insert(['game_id' => $game->getId(), 'generation' => (string) Str::uuid(),
            'seed' => $settings['seed'] ?? 'experimental', 'protect_humans' => $settings['protect_humans'], 'paused' => false]);
        $names = ['Aster', 'Bracken', 'Cobalt', 'Dawn', 'Ember', 'Flint', 'Garnet', 'Harbor', 'Ivory', 'Juniper'];
        for ($i = 0; $i < $count; $i++) {
            $user = User::create('ai-' . $game->getId() . '-' . ($i + 1) . '-' . Str::lower(Str::random(6)), Password::randomize());
            $pending = NewNation::create($game, $user, $names[$i]);
            $nation = $pending->finishSetup(homeTerritoryIds: $clusters[$i + 1], leaderName: $names[$i] . ' Council');
            $aggression = match ($settings['behavior']) { 'cautious' => 20, 'aggressive' => 85, 'balanced' => 50, default => [50, 85, 20, 50, 85, 50, 20, 50, 85, 50][$i] };
            DB::table('ai_players')->insert(['nation_id' => $nation->getId(), 'game_id' => $game->getId(), 'enabled' => true,
                'aggression' => $aggression, 'seed' => substr(($settings['seed'] ?? 'experimental') . ':' . $i, 0, 64), 'memory' => '[]']);
        }
    }
}

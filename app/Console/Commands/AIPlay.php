<?php

namespace App\Console\Commands;

use App\Integrations\AIPlayers\GameAdapter;
use App\Models\{Game, Turn};
use ExperimentalAI\Runner;
use Illuminate\Console\Command;

/** Bounded local test driver; removable with the experiment. */
class AIPlay extends Command
{
    protected $signature = 'app:ai-play {game : Explicit active game ID} {--turns=1 : Maximum turns, 1–100} {--preview : Preview the next AI without sending orders}';
    protected $description = 'Run experimental AI through normal commands; never ready a human player.';

    public function handle(GameAdapter $adapter, Runner $runner): int {
        $limit = filter_var($this->option('turns'), FILTER_VALIDATE_INT);
        if (!$limit || $limit < 1 || $limit > 100) { $this->error('Use 1–100 turns.'); return self::FAILURE; }
        $game = Game::findOrFail((int) $this->argument('game'));
        for ($i = 0; $i < $limit; $i++) {
            $game = $game->fresh(); $turn = Turn::getCurrentForGame($game);
            if (!$game->isActive()) {
                $this->error('The requested game is no longer active.'); return self::FAILURE;
            }
            $status = $adapter->status($game);
            if (!$status) { $this->error('This game has no experimental AI.'); return self::FAILURE; }
            if ($status['finished']) { $this->info('Game finished.'); break; }
            while (($status = $adapter->status($game))['next_nation_id']) {
                $result = $runner->step($game, $status + ['nation_id' => $status['next_nation_id']], (bool) $this->option('preview'));
                $this->line(json_encode($result));
                if ($this->option('preview')) return self::SUCCESS;
            }
            if ($this->option('preview')) { $this->info('All AI players are ready.'); return self::SUCCESS; }
            $game->fresh()->tryNextTurnIfNationsReady($turn);
            $next = Turn::getCurrentForGame($game->fresh());
            if ($next->getId() === $turn->getId()) { $this->info('Waiting for human readiness.'); break; }
            $this->info("Turn {$next->getNumber()} opened.");
        }
        return self::SUCCESS;
    }
}

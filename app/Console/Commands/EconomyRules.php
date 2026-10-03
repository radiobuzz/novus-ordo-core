<?php
namespace App\Console\Commands;

use App\Domain\Economy\IndicatorRules;
use App\Models\Game;
use App\Services\GameMutation;
use Illuminate\Console\Command;

/** Small authoring tool; importing test rules changes future calculations, not recorded seasons. */
final class EconomyRules extends Command
{
    protected $signature = 'app:economy-rules {action : example|export|import} {game?} {--file= : JSON rules document}';
    protected $description = 'Export or edit game-owned indicator economy coefficients in explicitly enabled test games.';
    public function handle(): int
    {
        try {
            $action = $this->argument('action');
            if ($action === 'example') $result = IndicatorRules::defaults();
            else {
                $game = Game::findOrFail((int)$this->argument('game'));
                if ($action === 'export') $result = $game->economy_rules['indicator'];
                elseif ($action === 'import') {
                    $file = $this->option('file');
                    if (!$file || !is_file($file)) throw new \InvalidArgumentException('Provide --file with a rules document.');
                    $result = IndicatorRules::validate(json_decode(file_get_contents($file), true, flags: JSON_THROW_ON_ERROR));
                    app(GameMutation::class)->run($game, function () use ($game,$result) {
                        $game->refresh();
                        if (!$game->policy_testing_enabled) throw new \DomainException('Enable test definition editing before changing game rules.');
                        $rules = $game->economy_rules; $rules['indicator'] = $result;
                        $game->economy_rules = $rules; $game->save();
                    });
                } else throw new \InvalidArgumentException('Unknown action.');
            }
            $this->line(json_encode($result, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
            return self::SUCCESS;
        } catch (\DomainException|\InvalidArgumentException|\JsonException|\Illuminate\Validation\ValidationException $e) {
            $this->error($e->getMessage()); return self::FAILURE;
        }
    }
}

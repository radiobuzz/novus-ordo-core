<?php

namespace App\Console\Commands;

use App\Models\Game;
use App\Services\GameMutation;
use App\Services\Policies\PolicyCatalogue;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Initial authoring tooling; the same catalogue services back the future editor. */
final class Policies extends Command {
    protected $signature = 'app:policies {action : list|example|create|export|import|clone|attach|testing}
        {id? : Policy set ID, or game ID for testing}
        {--file= : JSON document to create/import}
        {--counter= : Required current edit counter for import}
        {--game= : Existing test game for attach}
        {--name= : Name for a cloned template}
        {--enabled= : 0 or 1 for testing}';
    protected $description = 'Create, clone and edit policy catalogues; no definition copies per season.';

    public function handle(PolicyCatalogue $catalogues): int {
        $action = $this->argument('action'); $id = (int) $this->argument('id');
        try {
            $result = match ($action) {
                'list' => DB::table('policy_sets')->orderBy('id')->get(),
                'example' => json_decode(file_get_contents(database_path('policy-templates/economy.json')), true, flags: JSON_THROW_ON_ERROR),
                'create' => $catalogues->createTemplate($this->document()),
                'export' => $catalogues->load($id)['document'],
                'import' => $catalogues->edit($id, $this->counter(), $this->document()),
                'clone' => $catalogues->cloneSet($id, name: $this->option('name')),
                'attach' => $this->attach($catalogues, $id),
                'testing' => $this->testing($id),
                default => throw new \InvalidArgumentException('Unknown action.'),
            };
            $this->line(json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
            return self::SUCCESS;
        } catch (\Illuminate\Validation\ValidationException $error) {
            $this->error(json_encode($error->errors(), JSON_PRETTY_PRINT)); return self::FAILURE;
        } catch (\InvalidArgumentException|\JsonException $error) {
            $this->error($error->getMessage()); return self::FAILURE;
        }
    }

    private function document(): array {
        $path = $this->option('file');
        if (!$path || !is_file($path)) throw new \InvalidArgumentException('Provide --file with a policy catalogue JSON document.');
        $document = json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        if (!is_array($document)) throw new \InvalidArgumentException('Catalogue must be an object.');
        return $document;
    }

    private function counter(): int {
        $counter = filter_var($this->option('counter'), FILTER_VALIDATE_INT);
        if (!$counter || $counter < 1) throw new \InvalidArgumentException('This operation requires --counter from the current policy set.');
        return $counter;
    }

    private function attach(PolicyCatalogue $catalogues, int $id): array {
        $game = Game::findOrFail((int) $this->option('game'));
        return app(GameMutation::class)->run($game, function () use ($game, $catalogues, $id) {
            if (!$game->fresh()->policy_testing_enabled || !$game->fresh()->isActive()) abort(403, 'Attach requires an active game with policy testing enabled.');
            return $catalogues->cloneSet($id, $game);
        });
    }

    private function testing(int $id): array {
        if (!in_array($this->option('enabled'), ['0', '1'], true)) throw new \InvalidArgumentException('Use --enabled=0 or --enabled=1.');
        $game = Game::findOrFail($id);
        return app(GameMutation::class)->run($game, function () use ($game) {
            $game->policy_testing_enabled = $this->option('enabled') === '1'; $game->save();
            return ['game_id' => $game->id, 'policy_testing_enabled' => (bool) $game->policy_testing_enabled];
        });
    }
}

<?php

namespace App\Console\Commands;

use App\Services\Resources\ResourceCatalogue;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
final class Resources extends Command
{
    protected $signature = 'app:resources {action : list|example|create|export|import|clone} {id? : Resource set ID} {--file= : JSON document} {--counter= : Current edit counter} {--name= : Clone name}';
    protected $description = 'Author game resource catalogues; definitions are copied at game creation, never each turn.';
    public function handle(): int
    {
        try {
            $id = (int) $this->argument('id');
            $result = match ($this->argument('action')) {
                'list' => DB::table('resource_sets')->orderBy('id')->get(),
                'example' => json_decode(file_get_contents(database_path('resource-templates/foundation.json')), true, flags: JSON_THROW_ON_ERROR),
                'create' => ResourceCatalogue::createTemplate($this->document())->export(),
                'export' => ResourceCatalogue::load($id)->document(),
                'clone' => ResourceCatalogue::createTemplate(array_replace(ResourceCatalogue::load($id)->document(), ['name' => $this->option('name') ?? 'Resource copy']))->export(),
                'import' => ResourceCatalogue::edit($id, $this->counter(), $this->document())->export(),
                default => throw new \InvalidArgumentException('Unknown action.'),
            };
            $this->line(json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
            return self::SUCCESS;
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->error(json_encode($e->errors()));
            return self::FAILURE;
        } catch (\InvalidArgumentException|\JsonException $e) {
            $this->error($e->getMessage());
            return self::FAILURE;
        }
    }
    private function counter(): int
    {
        $value = filter_var($this->option('counter'), FILTER_VALIDATE_INT);
        if (!$value || $value < 1) {
            throw new \InvalidArgumentException('Import requires the current --counter.');
        }
        return $value;
    }
    private function document(): array
    {
        $file = $this->option('file');
        if (!$file || !is_file($file)) {
            throw new \InvalidArgumentException('Provide --file with a catalogue document.');
        }
        return json_decode(file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
    }
}

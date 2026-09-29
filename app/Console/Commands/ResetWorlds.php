<?php
namespace App\Console\Commands;

use App\Services\WorldResetService;
use Illuminate\Console\Command;

class ResetWorlds extends Command
{
    protected $signature = 'game:reset-worlds {--execute : Delete the listed game/map domain}';
    protected $description = 'Preview or reset all games, saved maps and authored gameplay templates; preserve accounts and site data.';

    public function handle(WorldResetService $reset): int {
        $preview = $reset->preview();
        $this->table(['Domain table', 'Rows'], collect($preview['counts'])->map(fn ($count, $table) => [$table, $count])->values()->all());
        $this->line('Retained: accounts/login/admin access, site settings, migration history and source assets.');
        if (!$this->option('execute')) { $this->info('Preview only. Use --execute during maintenance to delete this domain.'); return self::SUCCESS; }
        if (!app()->isDownForMaintenance() && !app()->environment('entry-testing', 'testing')) {
            $this->error('Put the application into maintenance mode and stop turn automation before executing the reset.'); return self::FAILURE;
        }
        $result = $reset->reset($preview['token']);
        $this->info('Game/map domain is empty. Create a fresh game to initialize current defaults.');
        if ($result['cleanup_failed_game_ids'] || $result['status_cleanup']['failed']) {
            $this->error('Database reset completed, but some generated files could not be removed. Check the application log and file permissions.');
            return self::FAILURE;
        }
        return self::SUCCESS;
    }
}

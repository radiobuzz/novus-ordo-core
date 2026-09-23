<?php

namespace App\Console\Commands;

use App\Services\JavascriptClientServicesGenerator;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class GenerateClient extends Command
{
    protected $signature = 'client:generate {--check : Fail if the checked-in module is stale}';
    protected $description = 'Generate deterministic ES module endpoint definitions without querying game data';

    public function handle(JavascriptClientServicesGenerator $generator): int
    {
        $path = resource_path('js/client/api/generated.js');
        $code = $generator->generateModule();
        if ($this->option('check')) {
            if (!File::exists($path) || File::get($path) !== $code) {
                $this->error('Client definitions are stale. Run client:generate.');
                return self::FAILURE;
            }
        } else {
            File::ensureDirectoryExists(dirname($path));
            File::put($path, $code);
        }
        $this->info('Client definitions are current.');
        return self::SUCCESS;
    }
}

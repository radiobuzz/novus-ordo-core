<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;

class CommissionServer extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:commission-server {--admin-user=}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Commission a new server.';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $adminUser = $this->option('admin-user');
        if (empty($adminUser)) {
           $this->fail("Error: --admin-user=ADMIN_USER_NAME must be specified.");
        }

        $resultMigrate = Artisan::call('migrate');
        $message = Artisan::output();
        if ($resultMigrate != Command::SUCCESS) {
            echo $message;
            $this->fail("An error happened when attempted to migrate DB.");
        }
        
        $resultProvisionAdmin = Artisan::call('app:provision-admin', ["userName" => $adminUser]);
        $message = Artisan::output();
        if ($resultProvisionAdmin != Command::SUCCESS) {
            echo $message;
            $this->fail("An error happened when attempted to provision admin '$adminUser'.");
        }

        echo $message;
    }
}

<?php

namespace App\Providers;

use App\Models\Nation;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Removable V1Experimental bridge; core models depend only on GameParticipants.
        $this->app->bind(\App\Services\GameParticipants::class, \App\Integrations\AIPlayers\GameAdapter::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request) {
            return Limit::perMinute(12)->by($request->ip());
        });
    }
}

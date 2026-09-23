<?php

namespace App\Http\Middleware;

use App\Utils\HttpStatusCode;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Will deny requests when the server is going through upkeeping (processing next turn).
 */
class EnsureGameIsNotUpkeeping
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $game = app(\App\Services\SelectedGame::class)->resolve($request);

        if ($game->isUpkeeping()) {
            abort(HttpStatusCode::ServiceUnavailable, "Game ID {$game->getId()} is upkeeping. Retry later.");
        }

        return $next($request);
    }
}

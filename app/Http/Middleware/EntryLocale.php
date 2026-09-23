<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EntryLocale
{
    public function handle(Request $request, Closure $next)
    {
        $locale = $request->header('X-Client-Locale', 'en');
        app()->setLocale(in_array($locale, ['en', 'fr'], true) ? $locale : 'en');
        return $next($request);
    }
}

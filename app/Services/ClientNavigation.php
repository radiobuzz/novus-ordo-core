<?php

namespace App\Services;

use Illuminate\Http\Request;

/** Mirrors existing route boundaries; it does not grant access. */
class ClientNavigation
{
    public static function destinations(Request $request): array
    {
        $items = [['id' => 'games', 'url' => $request->user() ? route('client') : route('client.entry')]];
        if (config('app.env') === 'development') {
            $items[] = ['id' => 'admin', 'url' => $request->user()
                ? route('admin.index') : route('client.entry', ['destination' => 'admin'])];
            $items[] = ['id' => 'tools', 'url' => route('client.tools')];
        }
        return $items;
    }
}

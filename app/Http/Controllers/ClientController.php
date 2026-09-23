<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ClientController extends Controller
{
    public function index(Request $request): Response
    {
        return $this->page($request, 'games');
    }

    public function tools(Request $request): Response
    {
        return $this->page($request, 'tools');
    }

    private function page(Request $request, string $destination): Response
    {
        $gameId = $destination === 'games' && ($request->has('game_id') || $request->hasHeader('X-Game-Id'))
            ? app(\App\Services\SelectedGame::class)->resolve($request, false)?->getId() : null;
        $scope = $gameId ? ['game_id' => $gameId] : [];
        // Session-specific boot data belongs in private HTML, never in generated assets.
        return response()->view('client', ['boot' => [
            'gameId' => $gameId,
            'destination' => $destination,
            'destinations' => \App\Services\ClientNavigation::destinations($request),
            'labs' => $destination === 'tools' ? [
                ['id' => 'map', 'url' => route('dev.map-lab')],
                ['id' => 'portrait', 'url' => route('dev.portrait-lab')],
                ['id' => 'identity', 'url' => route('dev.identity-lab')],
                ['id' => 'gallery', 'url' => route('dev.ui-foundations')],
            ] : [],
            'spectator' => $request->query('mode') === 'spectator',
            'userId' => $request->user()?->getAuthIdentifier(),
            'userName' => $request->user()?->name,
            'baseUrl' => url('/'),
            'csrfToken' => csrf_token(),
            'urls' => [
                'client' => route('client'),
                'tools' => config('app.env') === 'development' ? route('client.tools') : null,
                'setup' => route('client.entry', $scope),
                'login' => route('client.entry', $scope),
                'logout' => route('logout'),
                'admin' => config('app.env') === 'development' ? route('admin.index') : null,
                'mapGeneration' => $request->user()?->isAdmin() && config('app.env') === 'development'
                    ? route('client.map-generation') : null,
            ],
            'mapImages' => [
                'terrain' => asset('res/bundled/map/map_layer_0.png'),
                'detail' => asset('res/bundled/map/map_layer_2.png'),
            ],
        ]])->header('Cache-Control', 'private, no-store');
    }
}

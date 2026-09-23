<?php

namespace App\Http\Controllers;

use App\Models\Game;
use App\Models\NewNation;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class EntryController extends Controller
{
    public static function boot(Request $request): array
    {
        $gameId = $request->has('game_id') || $request->hasHeader('X-Game-Id')
            ? app(\App\Services\SelectedGame::class)->resolve($request, false)?->getId() : null;
        $scope = $gameId ? ['game_id' => $gameId] : [];
        return [
            'gameId' => $gameId,
            'destinations' => \App\Services\ClientNavigation::destinations($request),
            'userId' => $request->user()?->getAuthIdentifier(),
            'userName' => $request->user()?->name,
            'baseUrl' => url('/'),
            'csrfToken' => csrf_token(),
            'urls' => [
                'entry' => route('client.entry', $scope), 'client' => route('client', $scope),
                'login' => route('client.entry', $scope),
                'admin' => $request->user() && config('app.env') === 'development' ? route('admin.index') : null,
                'tools' => config('app.env') === 'development' ? route('client.tools') : null,
            ],
            'assets' => [
                'background' => asset('res/bundled/entry/hires.png'),
                'backgroundSlides' => array_map(
                    fn (int $number) => asset("res/bundled/entry/{$number}.png"),
                    range(1, 6),
                ),
                'soundtrack' => asset('res/bundled/entry/intro.mp3'),
            ],
            'mapImages' => [
                'terrain' => asset('res/bundled/map/map_layer_0.png'),
                'detail' => asset('res/bundled/map/map_layer_2.png'),
            ],
        ];
    }

    public function index(Request $request): Response
    {
        return response()->view('entry', ['boot' => self::boot($request)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function session(Request $request): JsonResponse
    {
        return response()->json(self::boot($request))->header('Cache-Control', 'private, no-store');
    }

    public function setup(Request $request): JsonResponse
    {
        $game = app(\App\Services\SelectedGame::class)->resolve($request);
        if ($game->isUpkeeping()) return response()->json(['message' => __('entry.upkeep')], 503);
        $user = $request->user();
        $pending = NewNation::getForUserOrNull($game, $user);
        return response()->json([
            'user_id' => $user->getId(),
            'game_id' => $game->getId(),
            'status' => $user->getNationSetupStatus($game)->name,
            'pending_name' => $pending?->name,
            'pending_nation_id' => $pending?->getId(),
            'nation_colors' => \App\Models\NationColorAssignment::exportForGame($game),
            'required_territories' => Game::NUMBER_OF_STARTING_TERRITORIES,
            'suitable_ids' => $game->freeSuitableTerritoriesInTurn()->pluck('id'),
            'taken_ids' => $game->alreadyTakenTerritoriesInTurn()->pluck('id'),
            'upload' => ['max_bytes' => 2 * 1024 * 1024, 'types' => ['image/png', 'image/jpeg', 'image/webp']],
        ])->header('Cache-Control', 'private, no-store');
    }
}

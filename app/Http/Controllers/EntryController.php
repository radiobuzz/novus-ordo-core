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
        $slideshow = \App\Models\EntrySlideshow::withPublicUrls(
            \App\Models\EntrySlideshow::publishedOrDefault(),
        );
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
                'background' => $slideshow['fallback_url'],
                'backgroundSlides' => $slideshow['slides'],
                'soundtrack' => $slideshow['audio']['url'],
                'slideshow' => $slideshow,
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
            'resource_definitions' => \App\Services\Resources\ResourceCatalogue::forGame($game)->mapDefinitions(),
            'required_territories' => Game::NUMBER_OF_STARTING_TERRITORIES,
            'suitable_ids' => $game->freeSuitableTerritoriesInTurn()->pluck('id'),
            'taken_ids' => $game->alreadyTakenTerritoriesInTurn()->pluck('id'),
            'upload' => ['max_bytes' => 2 * 1024 * 1024, 'types' => ['image/png', 'image/jpeg', 'image/webp']],
        ])->header('Cache-Control', 'private, no-store');
    }
}

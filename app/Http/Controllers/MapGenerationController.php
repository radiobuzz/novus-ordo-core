<?php

namespace App\Http\Controllers;

use App\Domain\GeneratedMapData;
use App\Models\Game;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class MapGenerationController extends Controller
{
    public function index(Request $request): Response {
        if (!$request->user()->isAdmin()) abort(403);
        return response()->view('client-map-generation', ['boot' => [
            'csrfToken' => csrf_token(),
            'startUrl' => route('client.map-generation.start'),
            'worldUrl' => route('client'),
        ]])->header('Cache-Control', 'private, no-store');
    }

    public function start(Request $request): JsonResponse {
        if (!$request->user()->isAdmin()) abort(403);
        $data = $request->validate([
            'map' => 'required|array',
            'ai' => 'sometimes|array',
        ]);
        $map = GeneratedMapData::fromArray($data['map']);
        $ai = \ExperimentalAI\Setup::options($data['ai'] ?? []);
        $game = Game::createNew($map,
            fn (Game $created) => app(\ExperimentalAI\Setup::class)->populate($created, $ai));
        return response()->json(['game_id' => $game->getId(), 'url' => route('client', ['game_id' => $game->getId()])], 201);
    }
}

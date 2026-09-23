<?php

namespace App\Http\Controllers;

use App\Domain\GeneratedMapData;
use App\Domain\Password;
use App\Models\Game;
use App\Models\MapDraft;
use App\Models\Turn;
use App\Models\User;
use App\Models\UserAlreadyExists;
use App\Services\AdminGameService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AdminController extends Controller
{
    public function index(Request $request): Response {
        return response()->view('client-admin', ['boot' => [
            'destinations' => \App\Services\ClientNavigation::destinations($request),
            'baseUrl' => url(''), 'csrfToken' => csrf_token(),
            'userId' => $request->user()->getId(), 'userName' => $request->user()->getName(),
            'canCreateMaps' => $request->user()->isAdmin(), // Existing generator access, not a new role system.
            'apiUrl' => route('admin.games'),
            'urls' => ['tools' => route('client.tools'), 'client' => route('client'),
                'lab' => route('dev.map-lab'), 'gallery' => route('dev.ui-foundations'),
                'portraits' => route('dev.portrait-lab')],
            'mapImages' => ['terrain' => asset('res/bundled/map/map_layer_0.png'),
                'detail' => asset('res/bundled/map/map_layer_2.png')],
        ]])->header('Cache-Control', 'private, no-store');
    }

    public function games(AdminGameService $service): JsonResponse {
        return response()->json(['active_game_ids' => app(\App\Services\GameAccess::class)->availableGames()->pluck('id')->all(),
            'games' => Game::orderByDesc('id')->get()->map(fn (Game $game) => $service->summary($game))->all()]);
    }

    public function game(Game $game, AdminGameService $service): JsonResponse {
        return response()->json($service->overview($game));
    }

    public function gameMap(Game $game, AdminGameService $service): JsonResponse {
        return response()->json($service->map($game));
    }

    public function turn(Request $request, Game $game, AdminGameService $service): JsonResponse {
        $data = $request->validate(['turn_id' => 'required|integer|min:1', 'action' => 'required|in:advance,rollback']);
        return response()->json($service->changeTurn($game, (int) $data['turn_id'], $data['action']));
    }

    public function start(Request $request): JsonResponse {
        $data = $request->validate(['map_draft_id' => 'nullable|integer|min:1', 'ai' => 'sometimes|array']);
        $ai = \ExperimentalAI\Setup::options($data['ai'] ?? []);
        $map = null;
        if (isset($data['map_draft_id'])) {
            if (!$request->user()->isAdmin()) abort(403);
            $map = GeneratedMapData::fromArray(MapDraft::findOrFail($data['map_draft_id'])->getSnapshot());
        }
        $game = Game::createNew($map,
            fn (Game $created) => app(\ExperimentalAI\Setup::class)->populate($created, $ai));
        return response()->json(['game_id' => $game->getId()], 201);
    }

    public function inspect(Request $request, Game $game): JsonResponse {
        $data = $request->validate(['kind' => 'required|in:division,deployment', 'id' => 'required|integer|min:1']);
        if ($data['kind'] === 'division') {
            $division = $game->getDivisionWithIdOrNull((int) $data['id']);
            if ($division === null) abort(404);
            $detail = $division->getMostRecentDetail();
            return response()->json(['division_id' => $division->getId(), 'game_id' => $game->getId(),
                'turn_id' => Turn::getCurrentForGame($game)->getId(), 'nation_id' => $division->getNation()->getId(),
                'territory_id' => $detail->getTerritory()->getId(), 'is_active' => $detail->isActive()]);
        }
        $deployment = $game->getDeploymentWithIdOrNull((int) $data['id']);
        if ($deployment === null) abort(404);
        return response()->json(['deployment_id' => $deployment->getId(), 'game_id' => $game->getId(),
            'turn_id' => $deployment->getTurn()->getId(), 'nation_id' => $deployment->getNation()->getId(),
            'territory_id' => $deployment->getTerritory()->getId()]);
    }

    public function users(): JsonResponse {
        return response()->json(['users' => User::orderBy('name')->get()->map(fn (User $user) => $user->exportForDevPanel())->all()]);
    }

    public function addUser(Request $request): JsonResponse {
        $data = $request->validate(['username' => 'required|string|max:100', 'password' => 'nullable|string|max:255']);
        $password = isset($data['password']) ? Password::fromString($data['password']) : Password::randomize();
        $user = User::create($data['username'], $password);
        if ($user instanceof UserAlreadyExists) throw ValidationException::withMessages(['username' => 'A user with that name already exists.']);
        return response()->json([...$user->exportForDevPanel(), 'generated_password' => isset($data['password']) ? null : $password->value], 201);
    }

    public function password(Request $request, User $user): JsonResponse {
        $data = $request->validate(['password' => 'nullable|string|min:1|max:255', 'random' => 'required|boolean']);
        if (!$data['random'] && empty($data['password'])) throw ValidationException::withMessages(['password' => 'Enter a password or choose random.']);
        $password = $data['random'] ? Password::randomize() : Password::fromString($data['password']);
        $user->setPassword($password);
        return response()->json(['generated_password' => $data['random'] ? $password->value : null]);
    }

    public function enterUser(Request $request, User $user): JsonResponse {
        $request->validate(['destination' => 'required|in:client']);
        Auth::login($user);
        $request->session()->regenerate();
        return response()->json(['url' => route('client')]);
    }

    public function maps(Request $request): JsonResponse {
        if (!$request->user()->isAdmin()) abort(403);
        return response()->json(['maps' => MapDraft::orderByDesc('id')->get(['id', 'name', 'seed', 'fingerprint', 'created_at'])
            ->map(fn (MapDraft $draft) => $draft->exportSummary())->all()]);
    }

    public function map(Request $request, MapDraft $draft): JsonResponse {
        if (!$request->user()->isAdmin()) abort(403);
        return response()->json([...$draft->exportSummary(), 'map' => $draft->getSnapshot()]);
    }

    public function saveMap(Request $request): JsonResponse {
        if (!$request->user()->isAdmin()) abort(403);
        $data = $request->validate(['name' => 'required|string|max:100', 'map' => 'required|array']);
        $draft = MapDraft::store($data['name'], GeneratedMapData::fromArray($data['map']));
        return response()->json($draft->exportSummary(), 201);
    }
}

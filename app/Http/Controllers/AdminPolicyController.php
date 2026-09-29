<?php

namespace App\Http\Controllers;

use App\Models\{Game, Turn};
use App\Services\GameMutation;
use App\Services\Policies\{PolicyCatalogue, PolicyEffectRegistry, PolicyService};
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\DB;

final class AdminPolicyController extends Controller {
    public function index(Request $request): JsonResponse {
        $this->authorizeAdmin($request);
        return response()->json(['sets' => DB::table('policy_sets')->orderBy('id')->get(), 'effects' => app(PolicyEffectRegistry::class)->contracts(), 'economic_consumers_available' => true]);
    }

    public function show(Request $request, int $set, PolicyCatalogue $catalogues): JsonResponse {
        $this->authorizeAdmin($request);
        return response()->json($catalogues->load($set));
    }

    public function create(Request $request, PolicyCatalogue $catalogues): JsonResponse {
        $this->authorizeAdmin($request);
        $data = $request->validate(['document' => 'required|array']);
        return response()->json($catalogues->createTemplate($data['document']), 201);
    }

    public function update(Request $request, int $set, PolicyCatalogue $catalogues): JsonResponse {
        $this->authorizeAdmin($request);
        $data = $request->validate(['document' => 'required|array', 'edit_counter' => 'required|integer|min:1']);
        return response()->json($catalogues->edit($set, $data['edit_counter'], $data['document']));
    }

    public function clone(Request $request, int $set, PolicyCatalogue $catalogues): JsonResponse {
        $this->authorizeAdmin($request);
        $data = $request->validate(['name' => 'sometimes|string|max:255']);
        return response()->json($catalogues->cloneSet($set, name: $data['name'] ?? null), 201);
    }

    public function game(Request $request, Game $game, PolicyCatalogue $catalogues): JsonResponse {
        $this->authorizeAdmin($request);
        return response()->json(['testing_enabled' => (bool) $game->policy_testing_enabled, 'catalogue' => $catalogues->forGame($game)]);
    }

    public function configureGame(Request $request, Game $game, PolicyCatalogue $catalogues): JsonResponse {
        $this->authorizeAdmin($request);
        $data = $request->validate(['context_revision' => 'required|uuid', 'testing_enabled' => 'required|boolean', 'template_id' => 'sometimes|integer|min:1']);
        return app(GameMutation::class)->run($game, function () use ($game, $data, $catalogues) {
            $game->refresh();
            if ($game->turn_context_revision !== $data['context_revision']) abort(409, 'Game context changed. Refresh first.');
            if (!$game->isActive()) abort(409, 'This game is archived.');
            $game->policy_testing_enabled = $data['testing_enabled']; $game->save();
            if (isset($data['template_id'])) {
                if (!$data['testing_enabled']) abort(422, 'Attaching policies to an existing game is a test operation. Select a template at creation for normal games.');
                $catalogues->cloneSet($data['template_id'], $game);
            }
            return response()->json(['testing_enabled' => (bool) $game->policy_testing_enabled, 'catalogue' => $catalogues->forGame($game)]);
        });
    }

    public function resetNation(Request $request, Game $game, int $nation, PolicyService $service): JsonResponse {
        $this->authorizeAdmin($request);
        $data = $request->validate(['turn_id' => 'required|integer|min:1', 'context_revision' => 'required|uuid', 'edit_counter' => 'required|integer|min:1', 'changes' => 'present|array|max:500']);
        return app(GameMutation::class)->run($game, function () use ($game, $nation, $service, $data) {
            if ($game->fresh()->turn_context_revision !== $data['context_revision']) abort(409, 'Game context changed.');
            return response()->json($service->resetTestChoices($game->nations()->findOrFail($nation), Turn::where('game_id', $game->id)->findOrFail($data['turn_id']), $data['edit_counter'], $data['changes']));
        });
    }

    private function authorizeAdmin(Request $request): void { abort_unless($request->user()?->isAdmin(), 403); }
}

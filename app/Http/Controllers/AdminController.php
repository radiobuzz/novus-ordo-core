<?php

namespace App\Http\Controllers;

use App\Domain\GeneratedMapData;
use App\Domain\Password;
use App\Models\Game;
use App\Models\EntrySlideshow;
use App\Models\MapDraft;
use App\Models\Turn;
use App\Models\User;
use App\Models\UserAlreadyExists;
use App\Services\AdminGameService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AdminController extends Controller
{
    public function index(Request $request): Response {
        return response()->view('client-admin', ['boot' => [
            'mapLimits' => ['maxCells' => (int) config('maps.max_cells')],
            'destinations' => \App\Services\ClientNavigation::destinations($request),
            'baseUrl' => url(''), 'csrfToken' => csrf_token(),
            'userId' => $request->user()->getId(), 'userName' => $request->user()->getName(),
            'canMaintainWorlds' => $request->user()->isAdmin(),
            'canCreateMaps' => $request->user()->isAdmin(), // Existing generator access, not a new role system.
            'apiUrl' => route('admin.games'),
            'urls' => ['logout' => route('logout'), 'tools' => route('client.tools'), 'client' => route('client'),
                'lab' => route('dev.map-lab'), 'gallery' => route('dev.ui-foundations'),
                'portraits' => route('dev.portrait-lab')],
        ]])->header('Cache-Control', 'private, no-store');
    }

    public function maintenance(Request $request, \App\Services\WorldResetService $service): JsonResponse {
        abort_unless($request->user()->isAdmin(), 403);
        return response()->json($service->preview())->header('Cache-Control', 'private, no-store');
    }

    public function resetWorlds(Request $request, \App\Services\WorldResetService $service): JsonResponse {
        abort_unless($request->user()->isAdmin(), 403);
        $data = $request->validate(['token' => 'required|string|size:64', 'confirmation' => 'required|in:RESET WORLDS']);
        return response()->json($service->reset($data['token'], temporaryMaintenance: true));
    }

    public function cleanStatusFiles(Request $request, \App\Services\WorldResetService $service): JsonResponse {
        abort_unless($request->user()->isAdmin(), 403);
        return response()->json($service->cleanStatusFiles());
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

    public function lifecycle(Request $request, Game $game, AdminGameService $service): JsonResponse {
        $data = $request->validate(['action' => 'required|in:activate,deactivate,delete', 'context_revision' => 'required|uuid']);
        return response()->json($service->lifecycle($game, $data['action'], $data['context_revision']));
    }

    public function start(Request $request): JsonResponse {
        if (!$request->user()->isAdmin()) abort(403);
        $data = $request->validate(['map_draft_id' => 'required|integer|min:1', 'ai' => 'sometimes|array', 'policy_template_id' => 'sometimes|nullable|integer|min:1']);
        $ai = \ExperimentalAI\Setup::options($data['ai'] ?? []);
        $map = GeneratedMapData::fromArray(MapDraft::findOrFail($data['map_draft_id'])->getSnapshot());
        $game = Game::createNew($map,
            fn (Game $created) => app(\ExperimentalAI\Setup::class)->populate($created, $ai), $data['policy_template_id'] ?? null);
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

    public function slideshow(Request $request): JsonResponse {
        if (!$request->user()->isAdmin()) abort(403);
        return $this->slideshowResponse(EntrySlideshow::editable());
    }

    public function saveSlideshow(Request $request): JsonResponse {
        if (!$request->user()->isAdmin()) abort(403);
        $data = $request->validate([
            'revision' => 'required|integer|min:0',
            'configuration' => 'required|array',
            'configuration.version' => 'required|integer|in:1',
            'configuration.fallback' => ['required', 'string', 'max:500', $this->slideshowAssetRule('image')],
            'configuration.audio' => 'required|array',
            'configuration.audio.src' => ['required', 'string', 'max:500', $this->slideshowAssetRule('audio')],
            'configuration.audio.name' => 'required|string|max:180',
            'configuration.audio.loop' => 'required|boolean',
            'configuration.slides' => 'required|array|min:1|max:40',
            'configuration.slides.*.id' => 'required|string|max:80|regex:/^[a-zA-Z0-9_-]+$/|distinct',
            'configuration.slides.*.src' => ['required', 'string', 'max:500', $this->slideshowAssetRule('image')],
            'configuration.slides.*.name' => 'required|string|max:180',
            'configuration.slides.*.duration_ms' => 'required|integer|min:500|max:120000',
            'configuration.slides.*.transition' => 'required|in:' . implode(',', EntrySlideshow::TRANSITIONS),
            'configuration.slides.*.transition_ms' => 'required|integer|min:0|max:10000',
            'configuration.slides.*.effect' => 'required|in:' . implode(',', EntrySlideshow::EFFECTS),
            'configuration.slides.*.focus_x' => 'required|integer|min:0|max:100',
            'configuration.slides.*.focus_y' => 'required|integer|min:0|max:100',
        ]);
        $configuration = $data['configuration'];
        $configuration['slides'] = array_values($configuration['slides']);
        return $this->slideshowResponse(EntrySlideshow::saveDraft($configuration, (int) $data['revision']));
    }

    public function publishSlideshow(Request $request): JsonResponse {
        if (!$request->user()->isAdmin()) abort(403);
        $data = $request->validate(['revision' => 'required|integer|min:0']);
        return $this->slideshowResponse(EntrySlideshow::publishDraft((int) $data['revision']));
    }

    public function uploadSlideshowAsset(Request $request, string $kind): JsonResponse {
        if (!$request->user()->isAdmin()) abort(403);
        if (!in_array($kind, ['image', 'audio'], true)) abort(404);
        $types = $kind === 'image'
            ? 'image/jpeg,image/png,image/webp'
            : 'audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,video/mp4,application/ogg';
        $maximum = $kind === 'image' ? 15 * 1024 : 50 * 1024;
        $data = $request->validate(['asset' => "required|file|max:{$maximum}|mimetypes:{$types}"]);
        $file = $data['asset'];
        $extensions = [
            'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
            'audio/mpeg' => 'mp3', 'audio/ogg' => 'ogg', 'application/ogg' => 'ogg',
            'audio/wav' => 'wav', 'audio/x-wav' => 'wav',
            'audio/mp4' => 'm4a', 'audio/x-m4a' => 'm4a', 'video/mp4' => 'm4a',
        ];
        $mime = $file->getMimeType();
        if (!isset($extensions[$mime])) throw ValidationException::withMessages(['asset' => 'Unsupported asset format.']);
        $originalName = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $name = 'entry-slideshow-' . Str::uuid() . '.' . $extensions[$mime];
        File::ensureDirectoryExists(public_path('var'));
        $file->move(public_path('var'), $name);
        $path = "var/{$name}";
        if ($kind === 'image') {
            try {
                \App\Services\EntrySlideImage::generate($path);
            } catch (\Throwable $error) {
                report($error);
                throw ValidationException::withMessages(['asset' => 'Unable to optimize this image. Use an image under 20 megapixels.']);
            }
        }
        return response()->json([
            'src' => $path,
            'url' => asset($kind === 'image' ? \App\Services\EntrySlideImage::deliveryPath($path) : $path),
            'name' => $originalName,
        ], 201);
    }

    private function slideshowResponse(EntrySlideshow $slideshow): JsonResponse {
        return response()->json([
            'revision' => $slideshow->revision,
            'draft' => EntrySlideshow::withPublicUrls($slideshow->draft()),
            'published' => EntrySlideshow::withPublicUrls($slideshow->published()),
            'published_at' => $slideshow->published_at?->toIso8601String(),
            'effects' => EntrySlideshow::EFFECTS,
            'transitions' => EntrySlideshow::TRANSITIONS,
            'limits' => ['slides' => 40, 'image_mb' => 15, 'audio_mb' => 50],
        ]);
    }

    private function slideshowAssetRule(string $kind): string {
        $extensions = $kind === 'image' ? '(?:png|jpe?g|webp)' : '(?:mp3|ogg|wav|m4a)';
        return "regex:~^(?:res/bundled/entry/[a-zA-Z0-9._-]+|var/entry-slideshow-[a-f0-9-]{36}\\.{$extensions})$~D";
    }
}

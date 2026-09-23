<?php

namespace App\Services;

use App\Models\Game;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** Request-local selection; never reads or writes a browser-wide session game. */
class SelectedGame
{
    public function __construct(private readonly GameAccess $access) {}

    public function resolve(?Request $request = null, bool $required = true): ?Game
    {
        $request ??= request();
        $ids = [];
        // Read query and body independently so one cannot silently override the other.
        $body = $request->isJson() ? $request->json()->all() : $request->request->all();
        foreach ([$request->query->all(), $body] as $input) {
            foreach (['game_id', 'client_context.game_id', 'ai_context.game_id'] as $key) {
                if (\Illuminate\Support\Arr::has($input, $key)) {
                    $ids[] = $this->id(data_get($input, $key));
                }
            }
        }
        if ($request->headers->has('X-Game-Id')) $ids[] = $this->id($request->header('X-Game-Id'));
        $routeGame = $request->route('game');
        if ($routeGame !== null) $ids[] = $this->id($routeGame instanceof Game ? $routeGame->getId() : $routeGame);
        if (count(array_unique($ids)) > 1) abort(409, 'Conflicting game identities. Reload the intended game.');

        if ($ids) {
            $game = Game::findOrFail($ids[0]);
            if (!$this->access->allows($game, $request->user())) abort(403, 'This game is not available for play.');
            return $game;
        }

        // Temporary compatibility for the old screens. Ambiguity must never select the first game.
        $games = $this->access->availableGames($request->user())->limit(2)->get();
        if ($games->count() === 1) return $games->first();
        if (!$required) return null;
        abort(409, $games->isEmpty() ? 'No active game is available.' : 'Select a game using game_id.');
    }

    private function id(mixed $value): int
    {
        if ((!is_int($value) && !is_string($value))
            || filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
            throw ValidationException::withMessages(['game_id' => 'A positive integer game ID is required.']);
        }
        return (int) $value;
    }
}

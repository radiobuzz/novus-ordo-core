<?php

namespace App\Http\Middleware;

use App\Services\NationContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Serialize player writes and validate their confirmed context; required in diplomacy-enabled games. */
class EnsureClientCommandContext
{
    public function handle(Request $request, Closure $next): Response {
        $game = app(\App\Services\SelectedGame::class)->resolve($request);
        return app(\App\Services\GameMutation::class)->run($game, fn () => $this->insideLock($request, $next));
    }

    private function insideLock(Request $request, Closure $next): Response {
        $context = new NationContext;
        if (!app(\App\Services\GameParticipants::class)->canCommand($context->getNation())) {
            abort(409, 'This nation is a passive automated participant. Take control in administration before issuing orders.');
        }
        if ($request->exists('ai_context')) {
            $aiContext = $request->validate([
                'ai_context' => 'required|array', 'ai_context.game_id' => 'required|integer',
                'ai_context.turn_id' => 'required|integer', 'ai_context.generation' => 'required|uuid',
            ])['ai_context'];
            $status = app(\App\Integrations\AIPlayers\GameAdapter::class)->status($context->getGame());
            if (!$status || (int) $aiContext['game_id'] !== $status['game_id']
                || (int) $aiContext['turn_id'] !== $status['turn_id'] || $aiContext['generation'] !== $status['generation']) {
                abort(409, 'The automation context changed. Refresh before continuing.');
            }
        }
        if (!$request->exists('client_context')) {
            abort(409, 'A current command context is required.');
        }

        $values = $request->validate([
            'client_context' => 'required|array',
            'client_context.game_id' => 'required|integer|min:1',
            'client_context.turn_number' => 'required|integer|min:1',
            'client_context.nation_id' => 'required|integer|min:1',
            'client_context.user_id' => 'required|integer|min:1',
            'client_context.turn_context_revision' => 'sometimes|uuid',
            'client_context.resource_edit_counter' => 'required|integer|min:1',
        ])['client_context'];
        $context = new NationContext;
        abort_unless((int) $values['resource_edit_counter'] === \App\Services\Resources\ResourceCatalogue::forGame($context->getGame())->set['edit_counter'], 409, 'Resource definitions changed. Refresh before continuing.');
        $revision = $context->getGame()->turn_context_revision;
        if (($context->getGame()->diplomacy_enabled || isset($values['turn_context_revision']))
            && $revision !== ($values['turn_context_revision'] ?? null)) {
            abort(409, 'The turn was advanced or reset. Refresh before continuing.');
        }
        if ($context->getGame()->isUpkeeping()) abort(503, 'The turn is advancing.');
        if ((int) $values['game_id'] !== $context->getGame()->getId()
            || (int) $values['turn_number'] !== $context->getCurrentTurn()->getNumber()
            || (int) $values['nation_id'] !== $context->getNation()->getId()
            || (int) $values['user_id'] !== $request->user()->getAuthIdentifier()) {
            abort(409, 'The command belongs to a different game, turn or player. Refresh before continuing.');
        }

        return $next($request);
    }
}

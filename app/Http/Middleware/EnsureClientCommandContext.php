<?php

namespace App\Http\Middleware;

use App\Services\NationContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Optional identity fence for callers that carry a confirmed client context. */
class EnsureClientCommandContext
{
    public function handle(Request $request, Closure $next): Response {
        $context = new NationContext;
        if (!app(\App\Services\GameParticipants::class)->canCommand($context->getNation())) {
            abort(409, 'This nation is controlled by experimental AI. Take control in administration before issuing orders.');
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
        if (!$request->exists('client_context')) return $next($request);

        $values = $request->validate([
            'client_context' => 'required|array',
            'client_context.game_id' => 'required|integer|min:1',
            'client_context.turn_number' => 'required|integer|min:1',
            'client_context.nation_id' => 'required|integer|min:1',
            'client_context.user_id' => 'required|integer|min:1',
        ])['client_context'];
        $context = new NationContext;
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

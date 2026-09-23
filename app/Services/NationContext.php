<?php
namespace App\Services;

use App\Models\Game;
use App\Models\Nation;
use App\Models\Turn;
use App\Utils\Annotations\Context;
use App\Utils\HttpStatusCode;
use Illuminate\Support\Facades\Auth;

#[Context('An authenticated user with a nation.')]
class NationContext {
    private readonly Game $game;
    private readonly Turn $currenTurn;
    private readonly Nation $nation;
    public function __construct()
    {
        $userOrNull = Auth::user();
        if(is_null($userOrNull)) {
            abort(HttpStatusCode::Unauthorized, 'Bad context: Bad context: need an authenticated user with a nation. No authenticated user.');
        }
        $user = $userOrNull;

        $this->game = app(SelectedGame::class)->resolve();
        
        $nationOrNull = Nation::getForUserOrNull($this->game, $user);
        if (is_null($nationOrNull)) {
            abort(HttpStatusCode::BadRequest, 'Bad context: need an authenticated user with a nation. This user has not created their nation yet.');
        }
        $this->nation = $nationOrNull;

        $this->currenTurn = $this->game->getCurrentTurn();
    }

    public function getCurrentTurn(): Turn {
        return $this->currenTurn;
    }

    public function getNation() :Nation {
        return $this->nation;
    }

    public function getGame() :Game {
        return $this->game;
    }
}
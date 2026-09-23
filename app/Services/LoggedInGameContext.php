<?php
namespace App\Services;

use App\Models\Game;
use App\Models\User;
use App\Utils\Annotations\Context;
use App\Utils\HttpStatusCode;
use Illuminate\Support\Facades\Auth;

#[Context('An authenticated user that joined a game.')]
class LoggedInGameContext {
    private readonly Game $game;
    private readonly User $user;
    public function __construct()
    {
        $userOrNull = Auth::user();
        if(is_null($userOrNull)) {
            abort(HttpStatusCode::Unauthorized, 'Bad context: need an authenticated user that joined a game. No authenticated user.');
        }
        $this->user = $userOrNull;
        
        $this->game = app(SelectedGame::class)->resolve();
    }

    public function getGame(): Game {
        return $this->game;
    }
    public function getUser(): User {
        return $this->user;
    }
}
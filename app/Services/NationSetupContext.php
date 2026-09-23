<?php
namespace App\Services;

use App\Models\Game;
use App\Models\NewNation;
use App\Models\User;
use App\Utils\Annotations\Context;
use App\Utils\HttpStatusCode;
use Illuminate\Support\Facades\Auth;

#[Context('An authenticated user with a nation to set up.')]
class NationSetupContext {
    private readonly User $user;
    private readonly Game $game;
    private readonly NewNation $newNation;
    public function __construct()
    {
        $userOrNull = Auth::user();
        if(is_null($userOrNull)) {
            abort(HttpStatusCode::Unauthorized, 'Bad context: need an authenticated user with a nation to set up. No authenticated user.');
        }
        $this->user = $userOrNull;

        $this->game = app(SelectedGame::class)->resolve();
        
        $nationOrNull = NewNation::getForUserOrNull($this->game, $this->user);
        if (is_null($nationOrNull)) {
            abort(HttpStatusCode::BadRequest, 'Bad context: need an authenticated user with a nation to set up. This user has not created their nation yet or has finished setting their nation up.');
        }
        $this->newNation = $nationOrNull;
    }

    public function getUser(): User {
        return $this->user;
    }

    public function getGame(): Game {
        return $this->game;
    }

    public function getNewNation(): NewNation {
        return $this->newNation;
    }
}
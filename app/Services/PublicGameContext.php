<?php
namespace App\Services;

use App\Models\Game;
use App\Utils\Annotations\Context;

#[Context('Needs a selected game.')]
class PublicGameContext {
    private readonly Game $game;
    public function __construct()
    {
        $this->game = app(SelectedGame::class)->resolve();
    }

    public function getGame(): Game {
        return $this->game;
    }
}
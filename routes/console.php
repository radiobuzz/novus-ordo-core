<?php

use App\Console\Commands\ServerUpkeep;
use App\Models\Game;
use App\Models\ProvisionedUser;
use App\Models\User;
use App\Models\UserAlreadyExists;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Schedule::command(ServerUpkeep::class, [])
    ->everyFiveMinutes()
    ->withoutOverlapping();

Artisan::command('app:next-turn {gameId}', function (int $gameId) {
    $game = Game::findOrFail($gameId);
    $turn = $game->getCurrentTurn();
    $newTurn = $game->tryNextTurn($turn);
    $this->info("Game {$gameId} is now on turn {$newTurn->getNumber()}.");
})->purpose('Advance the explicitly selected active game.');

Artisan::command('app:rollback-turn {gameId}', function (int $gameId) {
    $game = Game::findOrFail($gameId);
    if ($game->getCurrentTurn()->getNumber() === 1) $this->fail('The first turn cannot be rolled back.');
    $game->rollbackLastTurn($game->getCurrentTurn()->getId());
    $this->info("Rolled back game {$gameId}.");
})->purpose('Roll back the explicitly selected active game.');

Artisan::command('app:start-game', function () {
    $game = Game::createNew();
    $this->info("Created game {$game->getId()}. Existing games remain active.");
})->purpose('Create an independent active game.');

Artisan::command('app:provision-admin {userName}', function (string $userName) {
    assert($this instanceof Command);

    $provisionedOrError = User::provisionAdministrator($userName);

    if ($provisionedOrError instanceof ProvisionedUser) {
        $this->info("Admin user $userName provisioned with password: {$provisionedOrError->password->value}");
    }
    else if ($provisionedOrError instanceof UserAlreadyExists) {
        $this->fail("$userName already exists.");
    }
    else {
        throw new LogicException("Unexpected result.");
    }
})->purpose('Provision a new administrator account.');
<?php

use App\Http\Controllers\AssetController;
use App\Http\Controllers\AdminController;
use App\Http\Middleware\NoStoreResponse;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\EntryController;
use App\Http\Controllers\MapGenerationController;
use App\Http\Middleware\EntryLocale;
use App\Http\Controllers\DeploymentController;
use App\Http\Controllers\DivisionController;
use App\Http\Controllers\GameController;
use App\Http\Controllers\NationController;
use App\Http\Controllers\NewsController;
use App\Http\Controllers\ProductionController;
use App\Http\Controllers\TerritoryController;
use App\Http\Controllers\UiController;
use App\Http\Controllers\UserController;
use App\Http\Middleware\EnsureGameIsNotUpkeeping;
use App\Http\Middleware\EnsureWhenRunningInDevelopmentOnly;
use Illuminate\Support\Facades\Route;

// The new client is the only user interface. Keep old screen URLs as redirects
// long enough for bookmarks, while removing their implementations below.
Route::get('/', fn () => redirect()->route('client'));

Route::get('/client/tools', [ClientController::class, 'tools'])
    ->middleware([EnsureWhenRunningInDevelopmentOnly::class, NoStoreResponse::class])->name('client.tools');

// Standalone browser sandbox: guest access is safe, but still development-only.
Route::view('/dev-panel/map-lab', 'dev.map-lab')
    ->middleware(EnsureWhenRunningInDevelopmentOnly::class)->name('dev.map-lab');
// Local portrait studies only: no uploads, game data or server commands.
Route::view('/dev-panel/portrait-lab', 'dev.portrait-lab')
    ->middleware(EnsureWhenRunningInDevelopmentOnly::class)->name('dev.portrait-lab');
// Local flag composition proof: no game data, uploads or server commands.
Route::view('/dev-panel/identity-lab', 'dev.identity-lab')
    ->middleware(EnsureWhenRunningInDevelopmentOnly::class)->name('dev.identity-lab');
// Static synthetic UI samples only: no game/session data and no commands.
Route::view('/dev-panel/ui-foundations', 'dev.ui-foundations')
    ->middleware(EnsureWhenRunningInDevelopmentOnly::class)->name('dev.ui-foundations');

// Administration uses the former development-panel boundary; no new role system.
Route::middleware(['auth', EnsureWhenRunningInDevelopmentOnly::class, NoStoreResponse::class])->group(function () {
    Route::get('/client/admin', [AdminController::class, 'index'])->name('admin.index');
    Route::prefix('/client/admin/api')->group(function () {
        Route::get('/games', [AdminController::class, 'games'])->name('admin.games');
        Route::post('/games', [AdminController::class, 'start'])->name('admin.start');
        Route::get('/games/{game}', [AdminController::class, 'game'])->name('admin.game');
        Route::get('/games/{game}/map', [AdminController::class, 'gameMap'])->name('admin.game-map');
        Route::post('/games/{game}/turn', [AdminController::class, 'turn'])->name('admin.turn');
        Route::get('/games/{game}/inspect', [AdminController::class, 'inspect'])->name('admin.inspect');
        Route::get('/games/{game}/ai', [\App\Integrations\AIPlayers\Controller::class, 'report']);
        Route::get('/games/{game}/ai/snapshot', [\App\Integrations\AIPlayers\Controller::class, 'snapshot']);
        Route::get('/ai/author-kit', [\App\Integrations\AIPlayers\Controller::class, 'kit']);
        Route::post('/games/{game}/ai/step', [\App\Integrations\AIPlayers\Controller::class, 'adminStep']);
        Route::post('/games/{game}/ai/control', [\App\Integrations\AIPlayers\Controller::class, 'control']);
        Route::get('/users', [AdminController::class, 'users'])->name('admin.users');
        Route::post('/users', [AdminController::class, 'addUser'])->name('admin.add-user');
        Route::post('/users/{user}/password', [AdminController::class, 'password'])->name('admin.password');
        Route::post('/users/{user}/enter', [AdminController::class, 'enterUser'])->name('admin.enter-user');
        Route::get('/maps', [AdminController::class, 'maps'])->name('admin.maps');
        Route::post('/maps', [AdminController::class, 'saveMap'])->name('admin.save-map');
        Route::get('/maps/{draft}', [AdminController::class, 'map'])->name('admin.map');
    });
});

Route::get('/dev-panel', fn () => redirect()->route('admin.index'))
    ->middleware(['auth', EnsureWhenRunningInDevelopmentOnly::class, NoStoreResponse::class]);

// User and login/logout routes.
Route::get('/client/entry', [EntryController::class, 'index'])->name('client.entry');
Route::get('/client/session', [EntryController::class, 'session'])->name('ajax.get-entry-session');
Route::get('/client/setup', [EntryController::class, 'setup'])
    ->middleware(['auth', EntryLocale::class])->name('ajax.get-entry-setup');
Route::get('/login', fn () => redirect()->route('client.entry', request()->query()))->name('login');
Route::middleware(['throttle:login', EntryLocale::class])->group(function () {
    Route::post('/login-user', [UiController::class, 'loginUser'])
        ->name('user.login');
});
Route::middleware('auth')->group(function () {
    Route::get('/logout', [UserController::class, 'logoutCurrentUser'])->name('logout');
    Route::get('/user', [UserController::class, 'info'])
        ->name('ajax.get-user-info');
    Route::get('/user/nation-setup-status', [UserController::class, 'nationSetupStatus'])
        ->name('ajax.get-user-nation-setup-status');
});

// Game routes
Route::get('/games', [GameController::class, 'games'])->middleware('auth')->name('ajax.get-games');
Route::get('/game', [GameController::class, 'info'])->name('ajax.get-game-info');
Route::get('/game/map', [GameController::class, 'map'])->name('ajax.get-game-map');
Route::get('/game/ready-status', [GameController::class, 'readyStatus'])
    ->name('ajax.get-game-ready-status');
Route::get('/game/victory-status', [GameController::class, 'victoryStatus'])
    ->name('ajax.get-game-victory-status');
Route::get('/game/rankings', [GameController::class, 'rankings'])
    ->name('ajax.get-game-rankings');
Route::get('/game/ranking-history', [GameController::class, 'rankingHistory'])
    ->name('ajax.get-game-ranking-history');
Route::get('/game/news', [NewsController::class, 'news'])
    ->name('ajax.get-game-news');

// Nation routes.
Route::middleware('auth')->group(function () {
    Route::post('/nation/experimental-ai-step', [\App\Integrations\AIPlayers\Controller::class, 'step'])
        ->middleware(EnsureGameIsNotUpkeeping::class);
    Route::get('/client/gameplay', [\App\Http\Controllers\ClientGameplayController::class, 'info'])
        ->name('ajax.get-client-gameplay');
    Route::get('/nation', [NationController::class, 'ownNationInfo'])
        ->name('ajax.get-nation-info');
    Route::get('/nation/budget', [NationController::class, 'budgetInfo'])
        ->name('ajax.get-nation-budget');
    Route::get('/nation/battle-logs', [NationController::class, 'nationBattleLogs'])
        ->name('ajax.get-nation-battle-logs');
    Route::post('/nation/production-bids', [ProductionController::class, 'placeProductionBid'])
        ->middleware(\App\Http\Middleware\EnsureClientCommandContext::class)
        ->name('ajax.place-production-bid');
    Route::post('/nation/production-plan', [ProductionController::class, 'applyProductionPlan'])
        ->middleware([EnsureGameIsNotUpkeeping::class, \App\Http\Middleware\EnsureClientCommandContext::class])
        ->name('ajax.apply-production-plan');
    Route::middleware(EnsureGameIsNotUpkeeping::class)->group(function () {
        Route::post('/nation', [NationController::class, 'createNation'])
            ->name('ajax.create-nation');
        Route::post('/nation:select-home-territories', [NationController::class, 'selectHomeTerritories'])
            ->name('ajax.select-home-territories');
    });
});
Route::get('/nations/{nationId}', [NationController::class, 'info'])
    ->whereNumber('nationId')->name('ajax.get-public-nation-info');
Route::get('/game/identities', [\App\Http\Controllers\ClientGameplayController::class, 'identities'])
    ->name('ajax.get-game-identities');

// Territory routes.
Route::get('/territories', [TerritoryController::class, 'allTerritories'])
    ->name('ajax.get-all-territories');
Route::get('/territories/base-infos', [TerritoryController::class, 'allTerritoriesBaseInfo'])
    ->name('ajax.get-all-territories-base-info');
Route::get('/territories/base-infos/ref', [TerritoryController::class, 'allTerritoriesBaseInfoStaticLink'])
    ->name('ajax.get-all-territories-base-info-ref');
Route::get('/territories/turn-infos', [TerritoryController::class, 'allTerritoriesTurnInfo'])
    ->name('ajax.get-all-territories-turn-info');
Route::get('/territories/suitable-as-home-ids', [TerritoryController::class, 'allTerritoriesSuitableAsHomeIds'])
    ->name('ajax.get-all-territories-suitable-as-home-ids');
Route::get('/territories/{territoryId}/base-info', [TerritoryController::class, 'info'])
    ->whereNumber('territoryId')
    ->name('ajax.get-territory-base-info');
Route::get('/territories/{territoryId}/turn-info', [TerritoryController::class, 'turnInfo'])
    ->whereNumber('territoryId')
    ->name('ajax.get-territory-turn-info');
Route::middleware('auth')->group(function () {
    Route::get('/nation/territories/turn-infos', [TerritoryController::class, 'nationTerritoriesTurnInfo'])
        ->name('ajax.get-nation-territories-turn-info');
});

// Division routes.
Route::middleware('auth')->group(function () {
    Route::get('/nation/divisions', [DivisionController::class, 'allOwnedDivisions'])
        ->name('ajax.get-nation-divisions');
    Route::get('/nation/divisions/{divisionId}', [DivisionController::class, 'ownedDivision'])
        ->whereNumber('divisionId')
        ->name('ajax.get-nation-division');
    Route::middleware(EnsureGameIsNotUpkeeping::class)->group(function () {
            Route::post('/nation/divisions/move-orders', [DivisionController::class, 'sendMoveOrders'])
                ->middleware(\App\Http\Middleware\EnsureClientCommandContext::class)
                ->name('ajax.send-move-orders');
            Route::post('/nation/divisions/disband-orders', [DivisionController::class, 'sendDisbandOrders'])
                ->middleware(\App\Http\Middleware\EnsureClientCommandContext::class)
                ->name('ajax.send-disband-orders');
            Route::post('/nation/divisions:cancel-orders', [DivisionController::class, 'cancelOrders'])
                ->middleware(\App\Http\Middleware\EnsureClientCommandContext::class)
                ->name('ajax.cancel-orders');
    });
});

// Deployment routes
Route::middleware('auth')->group(function () {
    Route::get('nation/deployments', [DeploymentController::class, 'allDeployments'])
        ->name('ajax.get-all-deployments');
    Route::get('nation/territories/{territoryId}/deployments', [DeploymentController::class, 'allDeploymentsInOwnedTerritory'])
        ->whereNumber('territoryId')
        ->name('ajax.get-territory-deployments');
    Route::middleware(EnsureGameIsNotUpkeeping::class)->group(function () {
        Route::post('nation/deployments/cancel-deployment-requests', [DeploymentController::class, 'cancelDeployments'])
            ->middleware(\App\Http\Middleware\EnsureClientCommandContext::class)
            ->name('ajax.cancel-deployments');
        Route::post('nation/territories/deployments', [DeploymentController::class, 'deploy'])
            ->middleware(\App\Http\Middleware\EnsureClientCommandContext::class)
            ->name('ajax.deploy');
    });
});

// Asset routes.
Route::get('assets/{encodedUri}', [AssetController::class, 'assetInfo'])
    ->name('ajax.get-asset-info');

// UI
Route::middleware('auth')->group(function () {
    Route::get('/client/map-generation', [MapGenerationController::class, 'index'])
        ->middleware(EnsureWhenRunningInDevelopmentOnly::class)->name('client.map-generation');
    Route::post('/client/map-generation', [MapGenerationController::class, 'start'])
        ->middleware(EnsureWhenRunningInDevelopmentOnly::class)->name('client.map-generation.start');
    Route::get('/client', [ClientController::class, 'index'])->name('client');
    Route::get('/dashboard', fn () => redirect()->route('client', request()->only('game_id')));
    Route::post('/ready-for-next-turn', [UiController::class, 'readyForNextTurn'])
        ->middleware(\App\Http\Middleware\EnsureClientCommandContext::class)
        ->name('ajax.ready-for-next-turn');
    Route::get('/create-nation', fn () => redirect()->route('client.entry', request()->only('game_id')));
    Route::middleware(EnsureGameIsNotUpkeeping::class)->group(function () {
            Route::post('/create-nation', [UiController::class, 'storeNation'])->middleware(EntryLocale::class)
                ->name('nation.store');
    });
});

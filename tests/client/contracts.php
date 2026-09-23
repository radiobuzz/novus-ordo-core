<?php
// Isolated contracts: no DB connection, sessions, users, migrations or game commands.
require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'client_contracts_no_database', 'session.driver' => 'array']);
$check = function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
};
$generator = app(App\Services\JavascriptClientServicesGenerator::class);
$code = $generator->generateModule();
$check($code === file_get_contents(resource_path('js/client/api/generated.js')), 'Generated source differs');
$check(str_contains($code, 'getGameInfo'), 'Game read route missing');
$check(str_contains($code, 'getGameRankingHistory'), 'Ranking history route missing');
$check(str_contains($code, 'getPublicNationInfo'), 'Nation read route missing');
$check(str_contains($code, 'getClientGameplay') && str_contains($code, 'getGameIdentities'), 'Gameplay read routes missing');
$gameplayRoute = Illuminate\Support\Facades\Route::getRoutes()->getByName('ajax.get-client-gameplay');
$check(in_array('auth', $gameplayRoute->gatherMiddleware()), 'Owner gameplay must require authentication');
foreach (['place-production-bid', 'apply-production-plan', 'send-move-orders', 'send-disband-orders', 'cancel-orders', 'deploy', 'cancel-deployments', 'ready-for-next-turn'] as $command) {
    $commandRoute = Illuminate\Support\Facades\Route::getRoutes()->getByName('ajax.' . $command);
    $check(in_array(App\Http\Middleware\EnsureClientCommandContext::class, $commandRoute->gatherMiddleware()), 'Client identity fence missing: ' . $command);
}
$check(Illuminate\Support\Facades\Route::getRoutes()->getByName('ajax.choose-nation-colors') === null, 'Post-setup nation-colour mutation route remains');
$check(!str_contains($code, 'chooseNationColors'), 'Retired nation-colour command remains in generated source');
$check(!str_contains($code, 'dev-panel'), 'Privileged routes must not enter the player client');
$check(!str_contains($code, 'csrf') && !str_contains($code, 'password'), 'Runtime secrets must not enter generated source');
Illuminate\Support\Facades\Route::get('/contract/{first}/{second}', fn () => null)->name('ajax.contract-pair');
$check(str_contains($generator->generateModule(), '/contract/{first}/{second}'), 'All route placeholders preserved');
$route = Illuminate\Support\Facades\Route::getRoutes()->getByName('client');
$check($route !== null && in_array('auth', $route->gatherMiddleware()), 'Client must be authenticated');
$devGuard = App\Http\Middleware\EnsureWhenRunningInDevelopmentOnly::class;
foreach (Illuminate\Support\Facades\Route::getRoutes() as $adminRoute) {
    if (!str_starts_with($adminRoute->getName() ?? '', 'admin.')) continue;
    $check(in_array('auth', $adminRoute->gatherMiddleware()), 'Admin retains login requirement');
    $check(in_array($devGuard, $adminRoute->gatherMiddleware()), 'Admin remains development-only');
    $check(in_array(App\Http\Middleware\NoStoreResponse::class, $adminRoute->gatherMiddleware()), 'Admin data must not be cached');
}
$check(!str_contains($code, '/client/admin'), 'Admin endpoints must not enter the player client');
$mapLab = Illuminate\Support\Facades\Route::getRoutes()->getByName('dev.map-lab');
$check($mapLab !== null && !in_array('auth', $mapLab->gatherMiddleware()), 'Map lab must allow guests');
$check(in_array($devGuard, $mapLab->gatherMiddleware()), 'Map lab must remain development-only');
$portraitLab = Illuminate\Support\Facades\Route::getRoutes()->getByName('dev.portrait-lab');
$check($portraitLab !== null && !in_array('auth', $portraitLab->gatherMiddleware()), 'Portrait lab must allow guests');
$check(in_array($devGuard, $portraitLab->gatherMiddleware()), 'Portrait lab must remain development-only');
$identityLab = Illuminate\Support\Facades\Route::getRoutes()->getByName('dev.identity-lab');
$check($identityLab !== null && !in_array('auth', $identityLab->gatherMiddleware()), 'Identity lab must allow guests');
$check(in_array($devGuard, $identityLab->gatherMiddleware()), 'Identity lab must remain development-only');
$gallery = Illuminate\Support\Facades\Route::getRoutes()->getByName('dev.ui-foundations');
$check($gallery !== null && !in_array('auth', $gallery->gatherMiddleware()), 'Synthetic UI gallery must allow guests');
$check(in_array($devGuard, $gallery->gatherMiddleware()), 'UI gallery must remain development-only');
$remainingDevRoutes = collect(Illuminate\Support\Facades\Route::getRoutes())->filter(
    fn ($route) => str_starts_with($route->uri(), 'dev-panel')
        && !in_array($route, [$mapLab, $gallery, $portraitLab, $identityLab], true),
)->values();
$check($remainingDevRoutes->count() === 1 && $remainingDevRoutes[0]->uri() === 'dev-panel', 'Only the retired panel redirect may remain under dev-panel');
$check(in_array('auth', $remainingDevRoutes[0]->gatherMiddleware()), 'Panel redirect must require authentication');
$check(in_array($devGuard, $remainingDevRoutes[0]->gatherMiddleware()), 'Panel redirect must stay development-only');
$check(in_array(App\Http\Middleware\NoStoreResponse::class, $remainingDevRoutes[0]->gatherMiddleware()), 'Panel redirect must not be cached');
foreach (['dev.start-game', 'dev.next-turn', 'dev.rollback-turn', 'dev.add-user', 'dev.login-user',
    'dev.ajax.set-user-password', 'dev.ajax.generate-password', 'dev.ajax.division',
    'dev.ajax.deployment', 'dev.generate-js-client-services', 'dev.spa', 'dev.ajax.force-next-turn'] as $retired) {
    $check(Illuminate\Support\Facades\Route::getRoutes()->getByName($retired) === null, "Retired route remains: $retired");
}
$routes = Illuminate\Support\Facades\Route::getRoutes();
foreach (['/' => false, 'login' => false, 'dashboard' => true, 'create-nation' => true, 'dev-panel' => true] as $uri => $authenticated) {
    $legacyEntry = $routes->match(Illuminate\Http\Request::create('/' . ltrim($uri, '/'), 'GET'));
    $check($legacyEntry->getActionName() === 'Closure', "Retired screen is not a redirect: $uri");
    $check(in_array('auth', $legacyEntry->gatherMiddleware()) === $authenticated, "Unexpected redirect access boundary: $uri");
}
foreach (['resources/views/login.blade.php', 'resources/views/dashboard.blade.php',
    'resources/views/new_nation.blade.php', 'resources/views/dev/panel.blade.php',
    'resources/views/dev/spa.blade.php', 'public/js/jquery-3.7.1.min.js',
    'public/js/dashboard.js', 'public/js/component-map-display.js'] as $retiredFile) {
    $check(!file_exists(base_path($retiredFile)), "Retired interface file remains: $retiredFile");
}
$toolsRoute = Illuminate\Support\Facades\Route::getRoutes()->getByName('client.tools');
$check($toolsRoute !== null && !in_array('auth', $toolsRoute->gatherMiddleware()), 'Tools directory preserves guest lab access');
$check(in_array($devGuard, $toolsRoute->gatherMiddleware()), 'Tools directory must stay development-only');
foreach (['development' => ['games', 'admin', 'tools'], 'production' => ['games']] as $env => $expected) {
    $prior = config('app.env'); config(['app.env' => $env]);
    $links = App\Services\ClientNavigation::destinations(Illuminate\Http\Request::create('/client/entry'));
    $check(array_column($links, 'id') === $expected, 'Destination links must match the environment');
    if ($env === 'development') $check(str_contains($links[1]['url'], 'destination=admin'), 'Guest admin entry must retain its login destination');
    config(['app.env' => $prior]);
}
$originalEnvironment = config('app.env');
foreach (['development' => 200, 'production' => 403] as $environment => $expectedStatus) {
    config(['app.env' => $environment]);
    $result = app($devGuard)->handle(
        Illuminate\Http\Request::create('/dev-panel/map-lab'),
        fn () => new Symfony\Component\HttpFoundation\Response('sandbox'),
    );
    $check($result->getStatusCode() === $expectedStatus, 'Development guard must reject production guests');
}
config(['app.env' => $originalEnvironment]);
config(['session.driver' => 'array']);
app('session')->start();
$user = new App\Models\User();
$user->id = 77;
$user->is_admin = false;
$user->name = '</script><script>unsafe()</script>';
$request = Illuminate\Http\Request::create('/client');
$request->setUserResolver(fn () => $user);
// Bootstrap serialization remains a no-database contract; selection is exercised by multi-game.php.
$app->instance(App\Services\SelectedGame::class, new class(app(App\Services\GameAccess::class)) extends App\Services\SelectedGame {
    public function resolve(?Illuminate\Http\Request $request = null, bool $required = true): ?App\Models\Game { return null; }
});
$response = app(App\Http\Controllers\ClientController::class)->index($request);
$check(!str_contains($response->getContent(), $user->name), 'Bootstrap must escape script delimiters');
$check(str_contains($response->getContent(), 'client-boot'), 'Bootstrap missing');
$check(str_contains($response->headers->get('Cache-Control'), 'no-store'), 'Session HTML must not be cached');
echo "PASS: generated coverage, reproducibility, secret exclusion, multi-placeholder routes, stage-5 redirects/removals, authenticated entry, guest development-only labs, protected administration, safe Blade bootstrap (no database).\n";

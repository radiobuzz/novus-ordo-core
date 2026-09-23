<?php
// Test-only bootstrap. Explicit socket/database/public isolation; never uses live credentials.
require __DIR__ . '/../../vendor/autoload.php';
$testRoot = getenv('NO7_ENTRY_TEST_ROOT');
if (!$testRoot || !preg_match('~^/tmp/no7-entry-db-[A-Za-z0-9]+$~', $testRoot) || !is_dir($testRoot)) {
    throw new RuntimeException('An explicit temporary entry-test root is required.');
}
putenv('APP_ENV=entry-testing'); // Keep real CSRF middleware enabled for HTTP browser tests.
putenv('APP_ROUTES_CACHE=' . $testRoot . '/routes.php');
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config([
    'app.env' => 'entry-testing', 'app.url' => 'http://127.0.0.1:8792',
    'database.default' => 'entry_isolated',
    'database.connections.entry_isolated' => [
        'driver' => 'mysql', 'unix_socket' => $testRoot . '/mysql.sock',
        'database' => 'no7_entry_test', 'username' => 'root', 'password' => '',
        'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'prefix' => '', 'strict' => true,
    ],
    'cache.default' => 'array', 'session.driver' => 'file',
    'session.files' => $testRoot . '/sessions', 'session.secure' => false,
    'session.cookie' => 'no7_entry_test_session',
    'view.compiled' => $testRoot . '/views',
    'logging.channels.single.path' => $testRoot . '/laravel.log',
]);
foreach (['public/var/static', 'sessions', 'views'] as $directory) {
    if (!is_dir($testRoot . '/' . $directory)) mkdir($testRoot . '/' . $directory, 0700, true);
}
foreach (['res', 'build'] as $directory) {
    if (!file_exists($testRoot . '/public/' . $directory)) symlink(base_path('public/' . $directory), $testRoot . '/public/' . $directory);
}
$app->usePublicPath($testRoot . '/public');
return $app;

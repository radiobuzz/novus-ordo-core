<?php
// Explicit temporary DB/socket isolation; development guard is enabled only here.
$app = require __DIR__ . '/isolated-app.php';
config(['app.env' => 'development']);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/build/') || str_starts_with($path, '/res/bundled/')) {
    $file = realpath(base_path('public') . $path);
    if ($file && str_starts_with($file, realpath(base_path('public')) . DIRECTORY_SEPARATOR) && is_file($file)) {
        $types = ['js' => 'text/javascript', 'css' => 'text/css', 'png' => 'image/png', 'svg' => 'image/svg+xml', 'mp3' => 'audio/mpeg'];
        header('Content-Type: ' . ($types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
        readfile($file);return;
    }
}
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$request = Illuminate\Http\Request::capture();
$response = $kernel->handle($request);
$response->send();
$kernel->terminate($request, $response);

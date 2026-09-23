<?php
// Shared live/standalone entry point. No Laravel or database boot.
require __DIR__ . '/bootstrap.php';
try {
    $script = $argv[1] ?? throw new RuntimeException('Usage: php runtime/run.php SCRIPT.php [snapshot.json]');
    $input = json_decode(isset($argv[2]) ? file_get_contents($argv[2]) : stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
    ob_start();
    $policy = require $script;
    if (!is_object($policy) || !is_callable([$policy, 'decide'])) throw new RuntimeException('Script must return an object with decide().');
    $plan = $policy->decide($input['view'], $input['memory'] ?? [], $input['settings'] ?? [],
        new ExperimentalAI\PlayerTools($input['view']));
    ob_end_clean();
    echo json_encode(ExperimentalAI\Plan::normalize($plan), JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT) . "\n";
} catch (Throwable $error) {
    while (ob_get_level()) ob_end_clean();
    fwrite(STDERR, get_class($error) . ': ' . $error->getMessage() . "\n");
    exit(1);
}

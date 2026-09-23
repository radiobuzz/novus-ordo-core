<?php

// Temporary V1Experimental integration. See modules/ai-player/REMOVAL.md.
return [
    'enabled' => env('AI_PLAYER_ENABLED', true),
    'php_binary' => env('AI_PLAYER_PHP_BINARY', '/usr/bin/php8.3'),
    'timeout_seconds' => 20,
    'scripts_path' => null,
];

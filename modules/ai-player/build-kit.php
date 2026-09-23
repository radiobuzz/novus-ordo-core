<?php
require __DIR__ . '/AuthorKit.php';
$target = $argv[1] ?? dirname(__DIR__, 2) . '/artifacts/novus-ai-author.zip';
if (!is_dir(dirname($target))) mkdir(dirname($target), 0775, true);
ExperimentalAI\AuthorKit::build($target);
echo $target . "\n";

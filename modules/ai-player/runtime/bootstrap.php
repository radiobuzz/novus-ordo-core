<?php
// Packaged kits carry exact copies of these pure game helpers in runtime/domain.
$domain = is_dir(__DIR__ . '/domain') ? __DIR__ . '/domain' : dirname(__DIR__, 3) . '/app/Domain';
foreach (['LaborPoolConstants', 'ProductionBidConstants', 'ProductionAllocation', 'ProductionForecast'] as $class)
    require_once $domain . '/' . $class . '.php';
require_once is_file(__DIR__ . '/Plan.php') ? __DIR__ . '/Plan.php' : dirname(__DIR__) . '/Plan.php';
require_once __DIR__ . '/PlayerTools.php';

<?php

use App\Domain\GeneratedMapData;
use Symfony\Component\Process\Process;

/** Generated-world fixture for isolated PHP integration scripts. */
function generatedMapFixture(): GeneratedMapData
{
    static $map;
    if ($map instanceof GeneratedMapData) return $map;

    $process = new Process(['node', __DIR__ . '/map-beta-fixture.mjs'], dirname(__DIR__, 2));
    $process->setTimeout(120);
    $process->mustRun();
    return $map = GeneratedMapData::fromArray(json_decode(
        $process->getOutput(),
        true,
        flags: JSON_THROW_ON_ERROR,
    ));
}

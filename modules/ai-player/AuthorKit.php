<?php
namespace ExperimentalAI;

/** Builds a standalone zip from an explicit source allowlist; never reads application configuration or player data. */
final class AuthorKit
{
    public static function build(string $target): void {
        $zip = new \ZipArchive;
        if ($zip->open($target, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) throw new \RuntimeException('Could not create author kit.');
        $root = __DIR__ . '/author-kit/novus-ai-author';
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS)) as $file)
            if ($file->isFile()) $zip->addFile($file->getPathname(), 'novus-ai-author/' . substr($file->getPathname(), strlen($root) + 1));
        foreach (['run.php', 'bootstrap.php', 'PlayerTools.php'] as $file)
            $zip->addFile(__DIR__ . '/runtime/' . $file, 'novus-ai-author/runtime/' . $file);
        $zip->addFile(__DIR__ . '/Plan.php', 'novus-ai-author/runtime/Plan.php');
        $zip->addFile(__DIR__ . '/scripts/experimental-v1.php', 'novus-ai-author/scripts/experimental-v1.php');
        foreach (['LaborPoolConstants', 'ProductionBidConstants', 'ProductionAllocation', 'ProductionForecast'] as $class)
            $zip->addFile(dirname(__DIR__, 2) . '/app/Domain/' . $class . '.php', 'novus-ai-author/runtime/domain/' . $class . '.php');
        $zip->addFile(dirname(__DIR__, 2) . '/LICENSE', 'novus-ai-author/LICENSE');
        if (!$zip->close()) throw new \RuntimeException('Could not finish author kit.');
    }
}

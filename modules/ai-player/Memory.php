<?php

namespace ExperimentalAI;

/** One existing JSON column, separate notebooks per nation/script; lazy V1 conversion. */
final class Memory
{
    public static function notebooks(array $stored): array {
        return $stored['_scripts'] ?? [ScriptCatalog::DEFAULT => $stored];
    }
    public static function forScript(array $stored, string $script): array {
        return self::notebooks($stored)[$script] ?? [];
    }
    public static function save(array $stored, string $script, array $notes): array {
        $books = self::notebooks($stored);
        $books[$script] = $notes;
        return ['_scripts' => $books];
    }
}

<?php

namespace ExperimentalAI;

use Symfony\Component\Process\Process;

/** Trusted local PHP files. Discovery reads labels without executing script code. */
final class ScriptCatalog
{
    public const DEFAULT = 'experimental-v1';

    public function directory(): string { return config('ai-player.scripts_path') ?: __DIR__ . '/scripts'; }

    public function all(): array {
        $scripts = [];
        foreach (glob($this->directory() . '/*.php') ?: [] as $file) {
            $id = basename($file, '.php');
            if (!preg_match('/^[a-z0-9][a-z0-9-]{0,63}$/D', $id)) continue;
            $header = file_get_contents($file, false, null, 0, 4096);
            preg_match('/@ai-name\s+([^\r\n*]+)/', $header, $match);
            $scripts[] = ['id' => $id, 'name' => trim($match[1] ?? $id)];
        }
        return $scripts;
    }

    public function path(string $id): string {
        if (!in_array($id, array_column($this->all(), 'id'), true)) throw new \RuntimeException("AI script unavailable: $id");
        return $this->directory() . '/' . $id . '.php';
    }

    public function decide(string $id, array $input): array {
        $process = new Process([
            config('ai-player.php_binary', '/usr/bin/php8.3'), '-d', 'memory_limit=256M',
            __DIR__ . '/runtime/run.php', $this->path($id),
        ], __DIR__, null, json_encode($input, JSON_THROW_ON_ERROR));
        $process->setTimeout((float) config('ai-player.timeout_seconds', 20));
        $process->run();
        if (!$process->isSuccessful()) throw new \RuntimeException('Script failed: ' . substr($process->getErrorOutput(), 0, 1000));
        $plan = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        return Plan::normalize($plan);
    }
}

<?php

namespace App\Console\Commands;

use App\Services\EntrySlideImage;
use Illuminate\Console\Command;

class OptimizeEntrySlides extends Command
{
    protected $signature = 'entry:optimize-images';
    protected $description = 'Create bounded WebP delivery copies of existing entry artwork without changing originals or playlists';

    public function handle(): int
    {
        $failed = false;
        $before = $after = 0;
        foreach (['res/bundled/entry/*', 'var/entry-slideshow-*'] as $pattern) {
            foreach (glob(public_path($pattern)) as $path) {
                if (!preg_match('/\.(png|jpe?g|webp)$/', $path) || str_ends_with($path, '.display-v1.webp')) continue;
                $source = substr($path, strlen(public_path()) + 1);
                try {
                    $copy = EntrySlideImage::generate($source);
                    $before += filesize($path);
                    $after += filesize(public_path($copy));
                    $this->line($source . ' → ' . filesize(public_path($copy)) . ' bytes');
                } catch (\Throwable $error) {
                    $failed = true;
                    $this->error($source . ': ' . $error->getMessage());
                }
            }
        }
        $this->info("Original bytes: {$before}; delivery bytes: {$after}. Originals and saved playlists preserved.");
        return $failed ? self::FAILURE : self::SUCCESS;
    }
}

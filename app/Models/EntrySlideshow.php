<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/** One global entry presentation with independently editable and published revisions. */
class EntrySlideshow extends Model
{
    public const EFFECTS = ['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'drift-up', 'drift-down'];
    public const TRANSITIONS = ['fade', 'cut'];

    protected $guarded = [];

    protected function casts(): array
    {
        return ['published_at' => 'datetime'];
    }

    public static function defaults(): array
    {
        $files = [
            '2026-09-26-01-0a.png',
            '2026-09-26-02-0b.png',
            '2026-09-26-03-1.png',
            '2026-09-26-04-2.png',
            '2026-09-26-05-3.png',
            '2026-09-26-06-4.png',
            '2026-09-26-07-5.png',
            '2026-09-26-08-6.png',
        ];

        return [
            'version' => 1,
            'fallback' => 'res/bundled/entry/2026-09-26-static.png',
            'audio' => [
                'src' => 'res/bundled/entry/intro.mp3',
                'name' => 'intro.mp3',
                'loop' => true,
            ],
            'slides' => array_map(fn (string $file, int $index) => [
                'id' => sprintf('bundled-%02d', $index + 1),
                'src' => "res/bundled/entry/{$file}",
                'name' => pathinfo($file, PATHINFO_FILENAME),
                'duration_ms' => $index === count($files) - 1 ? 10000 : 5000,
                'transition' => 'fade',
                'transition_ms' => 2200,
                'effect' => 'none',
                'focus_x' => 50,
                'focus_y' => 50,
            ], $files, array_keys($files)),
        ];
    }

    public static function editable(): self
    {
        return static::firstOrCreate(['id' => 1], [
            'revision' => 0,
            'draft_configuration' => json_encode(static::defaults(), JSON_THROW_ON_ERROR),
        ]);
    }

    public function draft(): array
    {
        return json_decode($this->draft_configuration, true, flags: JSON_THROW_ON_ERROR);
    }

    public function published(): array
    {
        return $this->published_configuration
            ? json_decode($this->published_configuration, true, flags: JSON_THROW_ON_ERROR)
            : static::defaults();
    }

    public static function publishedOrDefault(): array
    {
        return static::find(1)?->published() ?? static::defaults();
    }

    public static function saveDraft(array $configuration, int $expectedRevision): self
    {
        return DB::transaction(function () use ($configuration, $expectedRevision) {
            $slideshow = static::query()->whereKey(1)->lockForUpdate()->first();
            if (!$slideshow) {
                $slideshow = static::editable();
                $slideshow->refresh();
            }
            if ($slideshow->revision !== $expectedRevision) {
                throw new ConflictHttpException('The slideshow was changed in another session.');
            }
            $slideshow->draft_configuration = json_encode($configuration, JSON_THROW_ON_ERROR);
            $slideshow->revision++;
            $slideshow->save();
            return $slideshow;
        });
    }

    public static function publishDraft(int $expectedRevision): self
    {
        return DB::transaction(function () use ($expectedRevision) {
            $slideshow = static::query()->whereKey(1)->lockForUpdate()->firstOrFail();
            if ($slideshow->revision !== $expectedRevision) {
                throw new ConflictHttpException('The slideshow was changed in another session.');
            }
            $slideshow->published_configuration = $slideshow->draft_configuration;
            $slideshow->published_at = now();
            $slideshow->revision++;
            $slideshow->save();
            return $slideshow;
        });
    }

    public static function withPublicUrls(array $configuration): array
    {
        $configuration['fallback_url'] = asset(\App\Services\EntrySlideImage::deliveryPath($configuration['fallback']));
        $configuration['audio']['url'] = asset($configuration['audio']['src']);
        $configuration['slides'] = array_map(function (array $slide) {
            $slide['url'] = asset(\App\Services\EntrySlideImage::deliveryPath($slide['src']));
            return $slide;
        }, $configuration['slides']);
        return $configuration;
    }
}

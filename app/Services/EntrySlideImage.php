<?php

namespace App\Services;

/** Delivery copies only: saved playlists and original artwork remain untouched. */
final class EntrySlideImage
{
    public static function deliveryPath(string $source): string
    {
        $copy = self::copyPath($source);
        return $copy && is_file(public_path($copy)) ? $copy : $source;
    }

    private static function copyPath(string $source): ?string
    {
        return preg_match('~^(?:res/bundled/entry/[a-zA-Z0-9_-]+|var/entry-slideshow-[a-f0-9-]{36})\.(?:png|jpe?g|webp)$~D', $source)
            ? $source . '.display-v1.webp'
            : null;
    }

    public static function generate(string $source): string
    {
        $copy = self::copyPath($source);
        if (!$copy || !is_file(public_path($source))) throw new \InvalidArgumentException('Invalid slideshow image.');
        if (is_file(public_path($copy))) return $copy;
        if (!function_exists('imagewebp')) throw new \RuntimeException('GD WebP support is required.');
        $size = getimagesize(public_path($source));
        // Bound decoded upload memory before asking GD to allocate it.
        if (!$size || $size[0] * $size[1] > 20000000) throw new \RuntimeException('Slideshow image exceeds 20 megapixels.');
        $image = match ($size[2]) {
            IMAGETYPE_PNG => imagecreatefrompng(public_path($source)),
            IMAGETYPE_JPEG => imagecreatefromjpeg(public_path($source)),
            IMAGETYPE_WEBP => imagecreatefromwebp(public_path($source)),
            default => false,
        };
        if (!$image) throw new \RuntimeException('Unable to decode slideshow image.');
        $scale = min(1, 1920 / max($size[0], $size[1]));
        $target = imagecreatetruecolor(max(1, (int) round($size[0] * $scale)), max(1, (int) round($size[1] * $scale)));
        imagealphablending($target, false);
        imagesavealpha($target, true);
        imagecopyresampled($target, $image, 0, 0, 0, 0, imagesx($target), imagesy($target), $size[0], $size[1]);
        $temporary = tempnam(dirname(public_path($copy)), 'slide-');
        try {
            if (!$temporary || !imagewebp($target, $temporary, 82) || !filesize($temporary)) {
                throw new \RuntimeException('Unable to encode slideshow image.');
            }
            chmod($temporary, 0644);
            if (!rename($temporary, public_path($copy))) throw new \RuntimeException('Unable to publish slideshow image.');
        } finally {
            imagedestroy($image);
            imagedestroy($target);
            if ($temporary && is_file($temporary)) unlink($temporary);
        }
        return $copy;
    }
}

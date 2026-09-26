<?php

namespace App\Services;

use InvalidArgumentException;
use JsonException;
use stdClass;

/** Bounded, inert canvas recipe. Keep this transport contract aligned with identity-lab/recipe.js. */
final class FlagDesign
{
    public const MAX_BYTES = 500_000;
    private const SYMBOLS = ['star', 'sun', 'crescent', 'disc', 'diamond', 'cross', 'lightning', 'mountain', 'tree', 'tower', 'anchor', 'wheat', 'bird', 'fleur'];
    private const SLOTS = ['primary', 'secondary', 'supporting'];

    public static function parse(string $json): array
    {
        self::check(strlen($json) <= self::MAX_BYTES);
        try {
            $r = json_decode($json, false, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new InvalidArgumentException('Invalid flag design', previous: $e);
        }
        self::check($r instanceof stdClass);
        $version = $r->schemaVersion ?? null;
        self::check(in_array($version, [1, 2], true));
        self::exact($r, ['schemaVersion', 'kind', 'rendererVersion', 'assetLibrary', 'name', 'palette', 'flag', ...($version === 2 ? ['customAssets'] : [])]);
        self::check($r->kind === 'flag' && $r->rendererVersion === "flag-canvas-v{$version}" && $r->assetLibrary === 'flag-geometry-v1');
        self::label($r->name);
        self::exact($r->palette, self::SLOTS);
        foreach (self::SLOTS as $slot) self::color($r->palette->$slot, false);
        $symbols = self::SYMBOLS;
        if ($version === 2) {
            self::items($r->customAssets, 0, 8);
            foreach ($r->customAssets as $asset) {
                self::exact($asset, ['id', 'name', 'viewBox', 'paths']);
                self::check(is_string($asset->id) && preg_match('/^custom-[a-z0-9-]{1,40}$/D', $asset->id) && !in_array($asset->id, $symbols, true));
                $symbols[] = $asset->id;
                self::label($asset->name);
                self::items($asset->viewBox, 4, 4);
                foreach ($asset->viewBox as $i => $v) self::number($v, $i < 2 ? -10000 : .01, 10000);
                self::items($asset->paths, 1, 100);
                $length = 0;
                foreach ($asset->paths as $path) {
                    self::exact($path, ['d', 'matrix', 'fill', 'stroke', 'strokeWidth', 'fillRule', 'opacity']);
                    self::check(is_string($path->d) && preg_match('/^[Mm][MmLlHhVvCcSsQqTtAaZzEe0-9.,+\-\s]*$/D', $path->d));
                    $length += strlen($path->d);
                    self::check($length <= 50000);
                    preg_match_all('/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/', $path->d, $tokens);
                    foreach ($tokens[0] as $token) self::number((float) $token, -100000, 100000);
                    self::items($path->matrix, 6, 6);
                    foreach ($path->matrix as $v) self::number($v, -10000, 10000);
                    self::check(is_bool($path->fill) && is_bool($path->stroke) && in_array($path->fillRule, ['nonzero', 'evenodd'], true));
                    self::number($path->strokeWidth, 0, 1000);
                    self::number($path->opacity, 0, 1);
                }
            }
        }
        self::exact($r->flag, ['width', 'height', 'background', 'layers']);
        self::check($r->flag->width === 900 && $r->flag->height === 600);
        self::color($r->flag->background);
        self::items($r->flag->layers, 0, 64);
        $ids = [];
        foreach ($r->flag->layers as $layer) {
            self::exact($layer, ['id', 'name', 'shape', 'color', 'visible', 'x', 'y', 'scale', 'rotation', 'flipX', 'geometry', ...($version === 2 ? ['role'] : [])]);
            self::check(is_string($layer->id) && preg_match('/^[a-z][a-z0-9-]{0,47}$/D', $layer->id) && !in_array($layer->id, $ids, true));
            $ids[] = $layer->id;
            self::label($layer->name);
            self::color($layer->color);
            self::check(in_array($layer->shape, ['rect', 'ellipse', 'polygon', 'crescent', ...($version === 2 ? ['symbol'] : [])], true));
            self::check(is_bool($layer->visible) && is_bool($layer->flipX));
            if ($version === 2) self::check(in_array($layer->role, ['shape', 'emblem'], true));
            self::number($layer->x, -900, 1800);
            self::number($layer->y, -600, 1200);
            self::number($layer->scale, .05, 4);
            self::number($layer->rotation, -180, 180);
            $g = $layer->geometry;
            if ($layer->shape === 'polygon') {
                self::exact($g, ['points']);
                self::items($g->points, 3, 64);
                foreach ($g->points as $point) {
                    self::items($point, 2, 2);
                    foreach ($point as $v) self::number($v, -1800, 1800);
                }
            } else {
                self::exact($g, ['width', 'height', ...($layer->shape === 'symbol' ? ['symbolId'] : [])]);
                self::number($g->width, 1, 2400);
                self::number($g->height, 1, 2400);
                if ($layer->shape === 'symbol') self::check(in_array($g->symbolId, $symbols, true));
            }
        }
        return json_decode($json, true, 32, JSON_THROW_ON_ERROR);
    }

    private static function check(bool $ok): void
    {
        if (!$ok) throw new InvalidArgumentException('Invalid flag design');
    }
    private static function exact(mixed $value, array $keys): void
    {
        self::check($value instanceof stdClass);
        $actual = array_keys(get_object_vars($value));
        self::check(count($actual) === count($keys) && !array_diff($keys, $actual));
    }
    private static function items(mixed $value, int $min, int $max): void
    {
        self::check(is_array($value) && count($value) >= $min && count($value) <= $max);
    }
    private static function number(mixed $value, float $min, float $max): void
    {
        self::check((is_int($value) || is_float($value)) && is_finite((float) $value) && $value >= $min && $value <= $max);
    }
    private static function label(mixed $value): void
    {
        self::check(is_string($value) && strlen(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')) / 2 <= 80);
    }
    private static function color(mixed $value, bool $allowSlot = true): void
    {
        self::check(is_string($value) && (($allowSlot && in_array($value, self::SLOTS, true)) || preg_match('/^#[0-9a-f]{6}$/iD', $value)));
    }
}

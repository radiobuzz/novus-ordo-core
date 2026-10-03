<?php
// Isolated filesystem fixtures; never connects to or changes the game database.
require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'client_contracts_no_database', 'session.driver' => 'array']);
use App\Services\EntrySlideImage;
use App\Models\EntrySlideshow;
$root = sys_get_temp_dir() . '/no7-slide-images-' . bin2hex(random_bytes(8));
mkdir($root . '/res/bundled/entry', 0755, true);
$app->usePublicPath($root);
$checks = 0;
$check = function ($ok, $message) use (&$checks) {
    ++$checks;
    if (!$ok) throw new RuntimeException($message);
};
$source = 'res/bundled/entry/test.png';
$image = imagecreatetruecolor(2400, 1200);
imagefill($image, 0, 0, imagecolorallocate($image, 50, 90, 120));
imagepng($image, public_path($source));
imagedestroy($image);
$hash = hash_file('sha256', public_path($source));
$check(EntrySlideImage::deliveryPath($source) === $source, 'Missing derivative falls back to original');
$copy = EntrySlideImage::generate($source);
$size = getimagesize(public_path($copy));
$check($size[0] === 1920 && $size[1] === 960 && $size[2] === IMAGETYPE_WEBP, 'Bounded WebP with preserved aspect ratio');
$check(hash_file('sha256', public_path($source)) === $hash, 'Original image preserved');
$check(EntrySlideImage::deliveryPath($source) === $copy, 'Existing derivative served');
$copyHash = hash_file('sha256', public_path($copy));
$check(EntrySlideImage::generate($source) === $copy && hash_file('sha256', public_path($copy)) === $copyHash, 'Repeat generation is idempotent');
foreach (['../test.png', 'https://example.com/test.png', 'res/bundled/entry/missing.png'] as $invalid) {
    try { EntrySlideImage::generate($invalid); throw new LogicException('Invalid source accepted'); }
    catch (InvalidArgumentException) { $check(true, 'Unsafe or missing source rejected'); }
}
$configuration = EntrySlideshow::defaults();
$configuration['fallback'] = $source;
$configuration['slides'][0]['src'] = $source;
$resolved = EntrySlideshow::withPublicUrls($configuration);
$check($resolved['slides'][0]['src'] === $source && str_ends_with($resolved['slides'][0]['url'], $copy), 'Saved source stays unchanged while delivery URL is optimized');
$check(str_ends_with($resolved['fallback_url'], $copy), 'Static fallback is optimized too');
$check(str_ends_with($resolved['audio']['url'], $configuration['audio']['src']), 'Audio remains unchanged');
echo "{$checks} slideshow image checks passed. Temporary fixtures: {$root}\n";

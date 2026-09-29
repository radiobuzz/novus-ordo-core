<?php
require __DIR__ . '/../../vendor/autoload.php';
use App\Domain\Resources\Agriculture;
$food = fn ($fulfilled, $stock = '0') => ['civilian_requested' => '10', 'civilian' => ['fulfilled' => $fulfilled], 'government_closing' => $stock];
if (Agriculture::growthMultiplier($food('10'), []) !== 1.0) throw new RuntimeException('Full nutrition should retain ordinary growth.');
if (Agriculture::growthMultiplier($food('10', '100'), []) !== Agriculture::growthMultiplier($food('10'), [])) throw new RuntimeException('Hoarding must not boost growth.');
if (Agriculture::growthMultiplier($food('0'), []) >= 0) throw new RuntimeException('Severe food shortage should cause decline.');
if (Agriculture::shortage(['civilian_requested' => '0', 'civilian' => ['fulfilled' => '0']]) !== 0.0) throw new RuntimeException('Zero demand is not shortage.');
echo "PASS: nutrition-driven growth, shortage and no stockpiling bonus.\n";

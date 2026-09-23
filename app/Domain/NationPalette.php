<?php

namespace App\Domain;

/** Stable catalogue IDs. Presentation shades are not gameplay rules. */
class NationPalette
{
    public static function colors(): array {
        return [
            ['id' => 1, 'name' => 'Crimson', 'name_fr' => 'Cramoisi', 'hex' => '#d94b57'],
            ['id' => 2, 'name' => 'Azure', 'name_fr' => 'Azur', 'hex' => '#428ee8'],
            ['id' => 3, 'name' => 'Emerald', 'name_fr' => 'Émeraude', 'hex' => '#32b880'],
            ['id' => 4, 'name' => 'Gold', 'name_fr' => 'Or', 'hex' => '#e0b83c'],
            ['id' => 5, 'name' => 'Violet', 'name_fr' => 'Violet', 'hex' => '#9664d8'],
            ['id' => 6, 'name' => 'Coral', 'name_fr' => 'Corail', 'hex' => '#f08768'],
            ['id' => 7, 'name' => 'Turquoise', 'name_fr' => 'Turquoise', 'hex' => '#32c3cb'],
            ['id' => 8, 'name' => 'Rose', 'name_fr' => 'Rose', 'hex' => '#e978b3'],
            ['id' => 9, 'name' => 'Lime', 'name_fr' => 'Citron vert', 'hex' => '#a1c944'],
            ['id' => 10, 'name' => 'Amber', 'name_fr' => 'Ambre', 'hex' => '#dd8c2e'],
            ['id' => 11, 'name' => 'Indigo', 'name_fr' => 'Indigo', 'hex' => '#665cc6'],
            ['id' => 12, 'name' => 'Jade', 'name_fr' => 'Jade', 'hex' => '#5baf9d'],
            ['id' => 13, 'name' => 'Burgundy', 'name_fr' => 'Bordeaux', 'hex' => '#9e385e'],
            ['id' => 14, 'name' => 'Cobalt', 'name_fr' => 'Cobalt', 'hex' => '#355caa'],
            ['id' => 15, 'name' => 'Forest', 'name_fr' => 'Forêt', 'hex' => '#438148'],
            ['id' => 16, 'name' => 'Saffron', 'name_fr' => 'Safran', 'hex' => '#f0d566'],
            ['id' => 17, 'name' => 'Orchid', 'name_fr' => 'Orchidée', 'hex' => '#b855c1'],
            ['id' => 18, 'name' => 'Copper', 'name_fr' => 'Cuivre', 'hex' => '#ae6742'],
            ['id' => 19, 'name' => 'Sky', 'name_fr' => 'Ciel', 'hex' => '#7cbde5'],
            ['id' => 20, 'name' => 'Mint', 'name_fr' => 'Menthe', 'hex' => '#8cd6a3'],
            ['id' => 21, 'name' => 'Peach', 'name_fr' => 'Pêche', 'hex' => '#eeb28b'],
            ['id' => 22, 'name' => 'Lavender', 'name_fr' => 'Lavande', 'hex' => '#b3a0e9'],
            ['id' => 23, 'name' => 'Olive', 'name_fr' => 'Olive', 'hex' => '#879341'],
            ['id' => 24, 'name' => 'Raspberry', 'name_fr' => 'Framboise', 'hex' => '#ce438b'],
        ];
    }
}

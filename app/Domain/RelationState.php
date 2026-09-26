<?php
namespace App\Domain;

enum RelationState: int {
    case NoRelations = 0;
    case War = 1;
    case Peace = 2;
    case Allied = 3;

    public function protects(): bool { return $this === self::Peace || $this === self::Allied; }
}

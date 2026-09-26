<?php
namespace App\Domain;

enum OrderType :int {
    case Move = 0;
    case Disband = 1;
    case Attack = 2;
    case Raid = 3;
    case Guard = 4;
    case StandDown = 5;

    public static function getEngagingTypes(): array {
        return [ OrderType::Attack->value, OrderType::Raid->value];
    }
}

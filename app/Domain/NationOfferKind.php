<?php
namespace App\Domain;

enum NationOfferKind: int {
    case Peace = 0;
    case Alliance = 1;
    case ResourceGrant = 2;
}

<?php
namespace App\Domain;

enum NationOfferStatus: int {
    case Pending = 0;
    case Accepted = 1;
    case Declined = 2;
    case Cancelled = 3;
    case Invalid = 4;
}

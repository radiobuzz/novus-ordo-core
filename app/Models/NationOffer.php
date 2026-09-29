<?php
namespace App\Models;

use App\Domain\NationOfferKind;
use Illuminate\Database\Eloquent\Model;

class NationOffer extends Model {
    protected $guarded = ['id'];
    protected function casts(): array {
        return ['kind' => NationOfferKind::class, 'quantity' => 'decimal:6'];
    }
}

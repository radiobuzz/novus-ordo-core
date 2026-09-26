<?php
namespace App\Models;

use App\Domain\{NationOfferKind, ResourceType};
use Illuminate\Database\Eloquent\Model;

class NationOffer extends Model {
    protected $guarded = ['id'];
    protected function casts(): array {
        return ['kind' => NationOfferKind::class, 'resource_type' => ResourceType::class, 'quantity' => 'decimal:4'];
    }
}

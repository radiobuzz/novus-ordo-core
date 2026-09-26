<?php
namespace App\Models;

use App\Domain\NationOfferStatus;
use App\ModelTraits\ReplicatesForTurns;
use Illuminate\Database\Eloquent\Model;

class NationOfferDetail extends Model {
    use ReplicatesForTurns;
    protected $guarded = ['id'];
    protected function casts(): array { return ['status' => NationOfferStatus::class, 'resolved_at' => 'datetime']; }
}

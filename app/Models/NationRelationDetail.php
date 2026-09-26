<?php
namespace App\Models;

use App\Domain\RelationState;
use App\ModelTraits\ReplicatesForTurns;
use Illuminate\Database\Eloquent\Model;

class NationRelationDetail extends Model {
    use ReplicatesForTurns;
    protected $guarded = ['id'];
    protected function casts(): array { return ['state' => RelationState::class]; }
}

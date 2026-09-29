<?php

namespace App\ModelTraits;

use App\Models\Turn;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait ReplicatesForTurns {
    /**
     * Returns the relation for this detail's turn.
     */
    public function turn() :BelongsTo {
        return $this->belongsTo(Turn::class);
    }

    public function getTurn() :Turn {
        return $this->turn;
    }

    public function replicateForTurn(Turn $turn) :static {
        $newDetail = $this->replicate();
        $newDetail->turn_id = $turn->getId();
        $newDetail->setRelation('turn', $turn);

        return $newDetail;
    }
}

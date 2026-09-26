<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NationRelation extends Model {
    protected $guarded = ['id'];

    public function otherId(int $nationId): int {
        if ($nationId === (int) $this->nation_a_id) return (int) $this->nation_b_id;
        if ($nationId === (int) $this->nation_b_id) return (int) $this->nation_a_id;
        abort(404);
    }

    public function readColumn(int $nationId): string {
        $this->otherId($nationId);
        return $nationId === (int) $this->nation_a_id ? 'last_read_message_a_id' : 'last_read_message_b_id';
    }
}

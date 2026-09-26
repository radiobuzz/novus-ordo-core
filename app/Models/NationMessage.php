<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NationMessage extends Model {
    protected $guarded = ['id'];
    protected function casts(): array { return ['event_data' => 'array', 'reverted_at' => 'datetime']; }
}

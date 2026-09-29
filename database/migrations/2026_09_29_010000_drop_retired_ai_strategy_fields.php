<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('ai_player_games')) {
            $columns = array_values(array_intersect(
                ['seed', 'protect_humans'],
                Schema::getColumnListing('ai_player_games'),
            ));
            if ($columns !== []) {
                Schema::table('ai_player_games', fn (Blueprint $table) => $table->dropColumn($columns));
            }
        }

        if (Schema::hasTable('ai_players')) {
            $columns = array_values(array_intersect(
                ['enabled', 'aggression', 'seed', 'memory', 'script'],
                Schema::getColumnListing('ai_players'),
            ));
            if ($columns !== []) {
                Schema::table('ai_players', fn (Blueprint $table) => $table->dropColumn($columns));
            }
        }
    }

    public function down(): void
    {
        throw new RuntimeException('Retired strategic AI fields are not restored.');
    }
};

<?php

use App\Domain\NationPalette;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void {
        // Fail before DDL rather than silently sharing primaries in an oversized existing game.
        $counts = DB::table('nations')->selectRaw('game_id, COUNT(*) as total')->groupBy('game_id')->get();
        if ($counts->contains(fn ($row) => $row->total > count(NationPalette::colors()))) {
            throw new RuntimeException('Expand the nation palette before migrating a game with more than 24 nations.');
        }
        Schema::create('nation_colors', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name', 32);
            $table->string('name_fr', 32);
            $table->char('hex', 7)->unique();
        });
        DB::table('nation_colors')->insert(NationPalette::colors());
        Schema::create('nation_color_assignments', function (Blueprint $table) {
            $table->foreignId('nation_id')->primary()->constrained('nations')->cascadeOnDelete();
            $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
            $table->foreignId('primary_color_id')->constrained('nation_colors');
            $table->foreignId('secondary_color_id')->constrained('nation_colors');
            $table->unique(['game_id', 'primary_color_id'], 'nation_primary_per_game');
        });
        foreach ($counts as $game) {
            $ids = DB::table('nations')->where('game_id', $game->game_id)->orderBy('id')->pluck('id');
            foreach ($ids as $index => $id) {
                DB::table('nation_color_assignments')->insert([
                    'nation_id' => $id, 'game_id' => $game->game_id,
                    'primary_color_id' => $index + 1, 'secondary_color_id' => ($index + 11) % 24 + 1,
                ]);
            }
        }
    }
    public function down(): void {
        Schema::dropIfExists('nation_color_assignments');
        Schema::dropIfExists('nation_colors');
    }
};

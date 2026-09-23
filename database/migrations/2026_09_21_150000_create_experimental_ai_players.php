<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('ai_player_games', function (Blueprint $table) {
            $table->foreignId('game_id')->primary()->constrained('games')->cascadeOnDelete();
            $table->string('generation', 36);
            $table->string('seed', 64);
            $table->boolean('protect_humans')->default(false);
            $table->boolean('paused')->default(false);
        });
        Schema::create('ai_players', function (Blueprint $table) {
            $table->foreignId('nation_id')->primary()->constrained('nations')->cascadeOnDelete();
            $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
            $table->boolean('enabled')->default(true);
            $table->unsignedTinyInteger('aggression');
            $table->string('seed', 64);
            $table->json('memory')->nullable();
        });
        Schema::create('ai_player_turns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->constrained('games')->cascadeOnDelete();
            $table->foreignId('nation_id')->constrained('nations')->cascadeOnDelete();
            $table->foreignId('turn_id')->constrained('turns')->cascadeOnDelete();
            $table->string('generation', 36);
            $table->string('status', 16);
            $table->json('result');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['nation_id', 'turn_id', 'generation'], 'ai_player_once');
        });
    }
    public function down(): void {
        // These references point TO game records: retirement never deletes nations/history.
        Schema::dropIfExists('ai_player_turns');
        Schema::dropIfExists('ai_players');
        Schema::dropIfExists('ai_player_games');
    }
};

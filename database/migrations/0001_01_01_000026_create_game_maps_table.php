<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_maps', function (Blueprint $table) {
            $table->id();
            $table->timestamps();
            $table->foreignId('game_id')->unique()->constrained('games')->onDelete('cascade');
            $table->string('fingerprint', 64);
            $table->longText('snapshot');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_maps');
    }
};

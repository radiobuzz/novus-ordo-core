<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('battles', function (Blueprint $table) {
            $table->unsignedInteger('attacker_formation_losses')->nullable();
            $table->unsignedInteger('attacker_division_losses')->nullable();
            $table->unsignedInteger('defender_formation_losses')->nullable();
            $table->unsignedInteger('defender_division_losses')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('battles', function (Blueprint $table) {
            $table->dropColumn([
                'attacker_formation_losses',
                'attacker_division_losses',
                'defender_formation_losses',
                'defender_division_losses',
            ]);
        });
    }
};

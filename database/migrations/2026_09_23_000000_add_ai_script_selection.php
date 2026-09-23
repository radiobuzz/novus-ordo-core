<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('ai_players', function (Blueprint $table) {
            $table->string('script', 64)->default('experimental-v1');
        });
    }
    public function down(): void {
        Schema::table('ai_players', fn (Blueprint $table) => $table->dropColumn('script'));
    }
};

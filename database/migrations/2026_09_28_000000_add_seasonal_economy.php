<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('games', function (Blueprint $t) { $t->json('economy_rules')->nullable(); });
        Schema::table('nation_details', function (Blueprint $t) { $t->json('economy_state')->nullable(); $t->json('economy_report')->nullable(); });
        Schema::table('territory_details', function (Blueprint $t) { $t->json('economy_state')->nullable(); });
    }
    public function down(): void {
        Schema::table('territory_details', fn (Blueprint $t) => $t->dropColumn('economy_state'));
        Schema::table('nation_details', fn (Blueprint $t) => $t->dropColumn(['economy_state', 'economy_report']));
        Schema::table('games', fn (Blueprint $t) => $t->dropColumn('economy_rules'));
    }
};

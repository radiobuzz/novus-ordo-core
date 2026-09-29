<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration {
    public function up(): void {
        if (DB::table('games')->exists()) {
            throw new RuntimeException('Production ownership requires fresh worlds. Remove disposable games through the game lifecycle before migrating; no save conversion is provided.');
        }
        Schema::table('nation_resource_stockpiles', function (Blueprint $t) {
            $t->enum('owner_kind', ['government', 'producer'])->default('government');
            $t->decimal('cost_basis', 20, 6)->default(0);
            $t->unique(['nation_id', 'turn_id', 'resource_id', 'owner_kind'], 'nation_turn_resource_owner');
            // Install the replacement first: InnoDB uses this prefix for the nation FK.
            $t->dropUnique('nation_turn_resource');
        });
        Schema::create('territory_production_states', function (Blueprint $t) {
            $t->id();
            $t->foreignId('game_id')->constrained()->cascadeOnDelete();
            $t->foreignId('turn_id')->constrained()->cascadeOnDelete();
            $t->foreignId('territory_id')->constrained()->cascadeOnDelete();
            $t->foreignId('resource_id')->constrained('resource_definitions')->restrictOnDelete();
            // National ownership follows territory_details for this season, including neutral land.
            $t->enum('owner_kind', ['government', 'producer']);
            $t->decimal('installed_capacity', 20, 6);
            $t->unique(['turn_id', 'territory_id', 'resource_id', 'owner_kind'], 'territory_season_resource_owner');
            $t->index(['game_id', 'turn_id']);
        });
        Schema::create('nation_economic_accounts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('game_id')->constrained()->cascadeOnDelete();
            $t->foreignId('turn_id')->constrained()->cascadeOnDelete();
            $t->foreignId('nation_id')->constrained()->cascadeOnDelete();
            // Treasury remains solely in the government currency stockpile.
            $t->enum('account_kind', ['household', 'producer']);
            $t->decimal('cash', 20, 6);
            $t->unique(['nation_id', 'turn_id', 'account_kind'], 'nation_season_account');
            $t->index(['game_id', 'turn_id']);
        });
        Schema::create('nation_resource_acquisitions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('game_id')->constrained()->cascadeOnDelete();
            $t->foreignId('turn_id')->constrained()->cascadeOnDelete();
            $t->foreignId('nation_id')->constrained()->cascadeOnDelete();
            $t->foreignId('resource_id')->constrained('resource_definitions')->restrictOnDelete();
            $t->decimal('requested_quantity', 20, 6);
            $t->decimal('spending_limit', 20, 6);
            $t->unsignedInteger('priority');
            $t->unique(['nation_id', 'turn_id', 'resource_id'], 'nation_season_acquisition');
            $t->index(['game_id', 'turn_id']);
        });
    }

    public function down(): void {
        throw new RuntimeException('Breaking production schema: recreate the disposable database to return to an earlier build.');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};
return new class extends Migration
{
    public function up(): void
    {
        if (DB::table('games')->exists()) {
            throw new RuntimeException('Resource foundation requires fresh games. Remove disposable games through the game lifecycle before applying this migration; no save conversion is provided.');
        }
        Schema::create('resource_sets', function (Blueprint $t) {
            $t->id();
            $t->timestamps();
            $t->string('kind', 16);
            $t->foreignId('game_id')->nullable()->unique()->constrained()->cascadeOnDelete();
            $t->foreignId('source_resource_set_id')->nullable()->constrained('resource_sets')->nullOnDelete();
            $t->string('name');
            $t->text('description')->nullable();
            $t->unsignedInteger('edit_counter')->default(1);
        });
        Schema::create('resource_definitions', function (Blueprint $t) {
            $t->id();
            $t->timestamps();
            $t->foreignId('resource_set_id')->constrained()->cascadeOnDelete();
            $t->string('key', 64);
            $t->string('kind', 16);
            $t->string('role', 32)->nullable();
            $t->json('labels');
            $t->json('descriptions');
            $t->json('unit_labels');
            $t->string('icon_key', 64)->nullable();
            $t->integer('sort_order');
            $t->unsignedTinyInteger('display_decimals');
            $t->decimal('starting_quantity', 20, 6);
            $t->boolean('grantable');
            $t->unique(['resource_set_id', 'key']);
            $t->unique(['resource_set_id', 'role']);
        });
        Schema::create('resource_rules', function (Blueprint $t) {
            $t->id();
            $t->timestamps();
            $t->foreignId('resource_id')->constrained('resource_definitions')->cascadeOnDelete();
            $t->string('handler', 64);
            $t->json('parameters');
            $t->unique(['resource_id', 'handler']);
        });
        Schema::create('unit_resource_costs', function (Blueprint $t) {
            $t->id();
            $t->timestamps();
            $t->foreignId('resource_id')->constrained('resource_definitions')->cascadeOnDelete();
            $t->string('division_type', 32);
            $t->string('phase', 32);
            $t->decimal('quantity', 20, 6);
            $t->unique(['resource_id', 'division_type', 'phase'], 'unit_resource_phase');
        });
        Schema::table('nation_resource_stockpiles', function (Blueprint $t) {
            $t->dropColumn('resource_type');
            $t->foreignId('resource_id')->constrained('resource_definitions')->restrictOnDelete();
            $t->decimal('available_quantity', 20, 6)->change();
            $t->unique(['nation_id', 'turn_id', 'resource_id'], 'nation_turn_resource');
        });
        Schema::table('labor_pool_facilities', function (Blueprint $t) {
            $t->dropColumn(['resource_type', 'productivity_pct']);
            $t->foreignId('resource_rule_id')->constrained('resource_rules')->restrictOnDelete();
            $t->decimal('productivity', 20, 6);
            $t->unique(['labor_pool_id', 'resource_rule_id'], 'pool_rule');
        });
        Schema::table('labor_pool_allocations', function (Blueprint $t) {
            $t->dropColumn('resource_type');
            $t->unique('labor_pool_facility_id');
        });
        Schema::table('production_bids', function (Blueprint $t) {
            $t->dropColumn(['resource_type', 'max_quantity', 'max_labor_allocation_per_unit']);
            $t->foreignId('resource_id')->constrained('resource_definitions')->restrictOnDelete();
            $t->decimal('quantity', 20, 6);
            $t->decimal('minimum_productivity', 20, 6)->default(0);
            $t->unique(['nation_id', 'turn_id', 'resource_id', 'bid_type'], 'nation_turn_resource_bid');
        });
        Schema::table('nation_offers', function (Blueprint $t) {
            $t->dropColumn('resource_type');
            $t->foreignId('resource_id')->nullable()->constrained('resource_definitions')->restrictOnDelete();
            $t->decimal('quantity', 20, 6)->nullable()->change();
        });
        Schema::table('nation_details', fn(Blueprint $t) => $t->json('resource_report')->nullable());
    }
    public function down(): void
    {
        throw new RuntimeException('Breaking resource schema: recreate the disposable database to return to a pre-resource build.');
    }
};

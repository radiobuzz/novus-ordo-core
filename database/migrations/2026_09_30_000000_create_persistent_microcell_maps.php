<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration {
    public function up(): void {
        if (DB::table('games')->exists() || DB::table('map_drafts')->exists()) {
            throw new RuntimeException('Microcell worlds require a fresh game/map domain. Run game:reset-worlds --execute before this migration. No conversion is provided.');
        }
        Schema::create('map_definitions', function (Blueprint $t) {
            $t->id(); $t->timestamps(); $t->string('fingerprint',64)->unique();
            $t->unsignedInteger('region_columns'); $t->unsignedInteger('region_rows'); $t->unsignedTinyInteger('cells_per_region');
            $t->longText('geography');
        });
        Schema::create('map_features', function (Blueprint $t) {
            $t->id(); $t->foreignId('map_definition_id')->constrained()->cascadeOnDelete();
            $t->string('feature_key',100); $t->string('type',32); $t->string('name',120); $t->json('geometry');
            $t->unique(['map_definition_id','feature_key']);
        });
        Schema::create('map_resource_profiles', function (Blueprint $t) {
            $t->id(); $t->foreignId('map_definition_id')->constrained()->cascadeOnDelete();
            $t->string('resource_key',64); $t->json('profile'); $t->unique(['map_definition_id','resource_key']);
        });
        foreach (['game_maps','map_drafts'] as $table) Schema::table($table, function (Blueprint $t) {
            $t->dropColumn('snapshot'); $t->foreignId('map_definition_id')->constrained()->restrictOnDelete();
        });
        Schema::table('territories', function (Blueprint $t) {
            $t->decimal('usable_land_ratio', 8, 6)->change();
            $t->json('geographic_potential')->nullable();
        });
    }
    public function down(): void {
        throw new RuntimeException('The geographic schema is a fresh-world boundary; recreate a disposable database to revert.');
    }
};

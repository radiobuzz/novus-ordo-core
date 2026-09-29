<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration {
    public function up(): void {
        Schema::table('games', fn (Blueprint $t) => $t->boolean('policy_testing_enabled')->default(false));
        Schema::table('nation_details', fn (Blueprint $t) => $t->json('policy_report')->nullable());
        Schema::create('policy_sets', function (Blueprint $t) {
            $t->id(); $t->timestamps();
            $t->string('kind', 16);
            // Explicit cleanup avoids cascade ordering through restrictive choice references.
            $t->foreignId('game_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $t->foreignId('source_policy_set_id')->nullable()->constrained('policy_sets')->nullOnDelete();
            $t->string('name'); $t->text('description')->nullable();
            $t->unsignedInteger('edit_counter')->default(1);
        });
        DB::statement("ALTER TABLE policy_sets ADD CONSTRAINT policy_set_owner CHECK ((kind = 'template' AND game_id IS NULL) OR (kind = 'game' AND game_id IS NOT NULL))");
        Schema::create('policies', function (Blueprint $t) {
            $t->id(); $t->timestamps();
            $t->foreignId('policy_set_id')->constrained()->cascadeOnDelete();
            $t->string('key', 80); $t->string('category_key', 80);
            $t->json('labels'); $t->json('descriptions');
            $t->integer('sort_order')->default(0); $t->string('status', 16);
            $t->unique(['policy_set_id', 'key']);
        });
        Schema::create('policy_options', function (Blueprint $t) {
            $t->id(); $t->timestamps();
            $t->foreignId('policy_id')->constrained()->cascadeOnDelete();
            $t->string('key', 80); $t->json('labels'); $t->json('descriptions');
            $t->boolean('is_default')->default(false); $t->integer('sort_order')->default(0);
            $t->timestamp('retired_at')->nullable();
            $t->unique(['policy_id', 'key']);
        });
        Schema::create('policy_parameters', function (Blueprint $t) {
            $t->id(); $t->timestamps();
            $t->foreignId('policy_id')->constrained()->cascadeOnDelete();
            $t->string('key', 80); $t->json('labels');
            $t->string('value_type', 16); $t->string('unit_key', 80); $t->json('default_value');
            $t->decimal('min_value', 20, 6)->nullable(); $t->decimal('max_value', 20, 6)->nullable();
            $t->decimal('step', 20, 6)->nullable(); $t->integer('sort_order')->default(0);
            $t->unique(['policy_id', 'key']);
        });
        Schema::create('policy_effects', function (Blueprint $t) {
            $t->id(); $t->timestamps();
            $t->foreignId('policy_option_id')->constrained()->cascadeOnDelete();
            $t->string('key', 80); $t->string('effect_type', 100); $t->json('arguments');
            $t->integer('sort_order')->default(0);
            $t->unique(['policy_option_id', 'key']);
        });
        Schema::create('policy_conditions', function (Blueprint $t) {
            $t->id(); $t->timestamps();
            $t->foreignId('policy_id')->constrained()->cascadeOnDelete();
            $t->foreignId('policy_option_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('key', 80); $t->string('condition_type', 40);
            $t->foreignId('referenced_policy_id')->constrained('policies')->restrictOnDelete();
            $t->json('arguments'); $t->json('message');
            $t->unique(['policy_id', 'key']);
        });
        foreach (['nation_policy_choices', 'nation_policy_pending_changes'] as $table) {
            Schema::create($table, function (Blueprint $t) use ($table) {
                $t->id(); $t->timestamps();
                $t->foreignId('game_id')->constrained()->cascadeOnDelete();
                $t->foreignId('nation_id')->constrained()->cascadeOnDelete();
                $t->foreignId('turn_id')->constrained()->cascadeOnDelete();
                $t->foreignId('policy_id')->constrained()->restrictOnDelete();
                $t->foreignId('policy_option_id')->constrained()->restrictOnDelete();
                $t->json('parameter_values');
                $t->unique(['nation_id', 'turn_id', 'policy_id'], $table . '_choice');
                $t->index(['game_id', 'turn_id']);
            });
        }
    }

    public function down(): void {
        foreach (['nation_policy_pending_changes', 'nation_policy_choices', 'policy_conditions', 'policy_effects', 'policy_parameters', 'policy_options', 'policies', 'policy_sets'] as $table) Schema::dropIfExists($table);
        Schema::table('nation_details', fn (Blueprint $t) => $t->dropColumn('policy_report'));
        Schema::table('games', fn (Blueprint $t) => $t->dropColumn('policy_testing_enabled'));
    }
};

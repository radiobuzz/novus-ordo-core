<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};
use Illuminate\Support\Str;

return new class extends Migration {
    public function up(): void {
        Schema::table('games', function (Blueprint $table) {
            $table->boolean('diplomacy_enabled')->default(false);
            $table->uuid('turn_context_revision')->nullable();
        });
        DB::table('games')->orderBy('id')->each(function ($game) {
            DB::table('games')->where('id', $game->id)->update(['turn_context_revision' => (string) Str::uuid()]);
        });
        Schema::create('nation_relations', function (Blueprint $table) {
            $table->id(); $table->timestamps();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('nation_a_id')->constrained('nations')->cascadeOnDelete();
            $table->foreignId('nation_b_id')->constrained('nations')->cascadeOnDelete();
            // Monotonic private positions, intentionally not exposed to the other participant.
            $table->unsignedBigInteger('last_read_message_a_id')->default(0);
            $table->unsignedBigInteger('last_read_message_b_id')->default(0);
            $table->unique(['game_id', 'nation_a_id', 'nation_b_id'], 'nation_relation_pair');
        });
        Schema::create('nation_offers', function (Blueprint $table) {
            $table->id(); $table->timestamps();
            $table->foreignId('relation_id')->constrained('nation_relations')->cascadeOnDelete();
            $table->foreignId('sender_nation_id')->constrained('nations')->cascadeOnDelete();
            $table->foreignId('created_turn_id')->constrained('turns')->cascadeOnDelete();
            $table->unsignedTinyInteger('kind');
            $table->uuid('basis_relation_revision')->nullable();
            $table->unsignedTinyInteger('resource_type')->nullable();
            $table->decimal('quantity', 16, 4)->nullable();
            $table->uuid('request_key');
            $table->string('request_hash', 64);
            $table->unique(['relation_id', 'sender_nation_id', 'request_key'], 'nation_offer_request');
        });
        Schema::create('nation_relation_details', function (Blueprint $table) {
            $table->id(); $table->timestamps();
            $table->foreignId('relation_id')->constrained('nation_relations')->cascadeOnDelete();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('turn_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('state')->default(0);
            $table->uuid('revision');
            $table->foreignId('agreement_offer_id')->nullable()->constrained('nation_offers')->nullOnDelete();
            $table->foreignId('cancellation_by_nation_id')->nullable()->constrained('nations')->nullOnDelete();
            $table->unsignedInteger('ends_on_turn_number')->nullable();
            $table->unique(['relation_id', 'turn_id']);
        });
        Schema::create('nation_offer_details', function (Blueprint $table) {
            $table->id(); $table->timestamps();
            $table->foreignId('offer_id')->constrained('nation_offers')->cascadeOnDelete();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('turn_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('status')->default(0);
            $table->foreignId('resolved_by_nation_id')->nullable()->constrained('nations')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->string('reason')->nullable();
            $table->unique(['offer_id', 'turn_id']);
        });
        Schema::create('nation_messages', function (Blueprint $table) {
            $table->id(); $table->timestamps();
            $table->foreignId('relation_id')->constrained('nation_relations')->cascadeOnDelete();
            $table->foreignId('sender_nation_id')->nullable()->constrained('nations')->nullOnDelete();
            $table->string('kind', 16);
            $table->text('body')->nullable();
            $table->foreignId('offer_id')->nullable()->constrained('nation_offers')->nullOnDelete();
            $table->string('event_type', 40)->nullable();
            $table->json('event_data')->nullable();
            $table->foreignId('created_turn_id')->nullable()->constrained('turns')->nullOnDelete();
            $table->unsignedInteger('original_turn_number');
            $table->uuid('request_key')->nullable();
            $table->timestamp('reverted_at')->nullable();
            $table->index(['relation_id', 'id']);
            $table->unique(['relation_id', 'sender_nation_id', 'request_key'], 'nation_message_request');
        });
        Schema::create('battle_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('battle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('nation_id')->constrained()->cascadeOnDelete();
            $table->string('side', 12);
            $table->unique(['battle_id', 'nation_id']);
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('intended_owner_nation_id')->nullable()->constrained('nations')->nullOnDelete();
            $table->boolean('intent_captured')->default(false);
        });
    }

    public function down(): void {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('intended_owner_nation_id');
            $table->dropColumn('intent_captured');
        });
        Schema::dropIfExists('battle_participants');
        Schema::dropIfExists('nation_messages');
        Schema::dropIfExists('nation_offer_details');
        Schema::dropIfExists('nation_relation_details');
        Schema::dropIfExists('nation_offers');
        Schema::dropIfExists('nation_relations');
        Schema::table('games', fn (Blueprint $table) => $table->dropColumn(['diplomacy_enabled', 'turn_context_revision']));
    }
};

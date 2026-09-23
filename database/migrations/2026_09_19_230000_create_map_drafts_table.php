<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void {
        Schema::create('map_drafts', function (Blueprint $table) {
            $table->id();
            $table->timestamps();
            $table->string('name', 100);
            $table->string('seed', 64);
            $table->string('fingerprint', 64);
            $table->longText('snapshot');
        });
    }

    public function down(): void {
        Schema::dropIfExists('map_drafts');
    }
};

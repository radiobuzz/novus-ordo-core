<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        // Obsolete allocations and bids have no role in the coordinated economy.
        // Do not transform or copy their rows into the new seasonal state.
        Schema::dropIfExists('labor_pool_allocations');
        Schema::dropIfExists('labor_pool_facilities');
        Schema::dropIfExists('production_bids');
    }

    public function down(): void {
        throw new RuntimeException('Retired production tables are not restored. Use a fresh database for an older build.');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void {
        Schema::table('nation_colors', fn (Blueprint $table) => $table->boolean('primary_allowed')->default(true));
        DB::table('nation_colors')->insert([
            ['id' => 25, 'name' => 'Black', 'name_fr' => 'Noir', 'hex' => '#17191c', 'primary_allowed' => false],
            ['id' => 26, 'name' => 'White', 'name_fr' => 'Blanc', 'hex' => '#f4f3ed', 'primary_allowed' => false],
            ['id' => 27, 'name' => 'Slate grey', 'name_fr' => 'Gris ardoise', 'hex' => '#626970', 'primary_allowed' => false],
            ['id' => 28, 'name' => 'Silver grey', 'name_fr' => 'Gris argent', 'hex' => '#b8bdc2', 'primary_allowed' => false],
        ]);
    }
    public function down(): void {
        // Do not destroy identities that already use these secondary colours.
        if (DB::table('nation_color_assignments')->whereIn('secondary_color_id', [25, 26, 27, 28])->exists())
            throw new RuntimeException('Reassign neutral secondary colours before rolling this migration back.');
        DB::table('nation_colors')->whereIn('id', [25, 26, 27, 28])->delete();
        Schema::table('nation_colors', fn (Blueprint $table) => $table->dropColumn('primary_allowed'));
    }
};

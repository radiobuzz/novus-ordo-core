<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration {
    public function up(): void {
        if (DB::table('games')->exists()) throw new RuntimeException('Indicator economy requires fresh games. Delete games through the game lifecycle first; saved map definitions and geographic data should remain. No save conversion is provided.');
        // Retire incompatible authored templates, rather than convert their economic contracts.
        $retired = DB::table('resource_sets as s')->join('resource_definitions as d', 'd.resource_set_id', '=', 's.id')
            ->join('resource_rules as r', 'r.resource_id', '=', 'd.id')->where('s.kind','template')
            ->whereIn('r.handler',['production.operating','production.maintenance','production.subsistence','finance.civilian_founding'])->distinct()->pluck('s.id');
        DB::table('resource_sets')->whereIn('id',$retired)->delete();
        DB::table('policy_sets')->where('kind','template')->where('name','Production economy — civilian finance v4')->delete();
        Schema::drop('nation_economic_accounts');
        Schema::table('nation_resource_stockpiles', function (Blueprint $t) {
            $t->unique(['nation_id','turn_id','resource_id'], 'nation_turn_resource');
            $t->dropUnique('nation_turn_resource_owner');
            $t->dropColumn(['owner_kind','cost_basis']);
        });
        Schema::table('territory_production_states', function (Blueprint $t) {
            $t->unique(['turn_id','territory_id','resource_id'], 'territory_season_resource');
            $t->dropUnique('territory_season_resource_owner');
            $t->dropColumn('owner_kind');
        });
    }
    public function down(): void { throw new RuntimeException('Breaking economy replacement: use a fresh disposable database for an earlier build.'); }
};

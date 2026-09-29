<?php
// Rehearse the forward boundary on a second database in the explicit temporary server.
require __DIR__.'/isolated-app.php';
use Illuminate\Support\Facades\{Artisan, DB, Schema};

DB::statement('DROP DATABASE IF EXISTS no7_map_upgrade_test');
DB::statement('CREATE DATABASE no7_map_upgrade_test');
config(['database.connections.entry_isolated.database'=>'no7_map_upgrade_test']);
DB::purge('entry_isolated');
$migration = '2026_09_30_000000_create_persistent_microcell_maps.php';
$paths = array_values(array_filter(glob(database_path('migrations/*.php')), fn($path)=>basename($path)!==$migration));
if (Artisan::call('migrate', ['--path'=>$paths, '--realpath'=>true, '--force'=>true])!==0) throw new RuntimeException(Artisan::output());
DB::table('users')->insert(['name'=>'retained-upgrade-admin','email'=>'upgrade@example.test','password'=>'test-only','is_admin'=>true]);
DB::table('map_drafts')->insert(['name'=>'Retired map','seed'=>'retired','fingerprint'=>str_repeat('a',64),'snapshot'=>'{}','created_at'=>now(),'updated_at'=>now()]);
$newPath = database_path('migrations/'.$migration);
try {
    Artisan::call('migrate',['--path'=>$newPath,'--realpath'=>true,'--force'=>true]);
    throw new RuntimeException('Migration accepted old map records.');
} catch (RuntimeException $e) {
    if (!str_contains($e->getMessage(),'Microcell worlds require')) throw $e;
}
if (Artisan::call('game:reset-worlds')!==0 || DB::table('map_drafts')->count()!==1) throw new RuntimeException('Old-schema preview mutated data.');
if (Artisan::call('game:reset-worlds',['--execute'=>true])!==0) throw new RuntimeException(Artisan::output());
if (Artisan::call('migrate',['--path'=>$newPath,'--realpath'=>true,'--force'=>true])!==0) throw new RuntimeException(Artisan::output());
if (!Schema::hasTable('map_definitions') || Schema::hasColumn('map_drafts','snapshot') || DB::table('users')->count()!==1) throw new RuntimeException('Forward upgrade failed.');
echo "PASS: old-schema migration guard, read-only preview, reset, forward migration and retained account.\n";

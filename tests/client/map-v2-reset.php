<?php
require __DIR__.'/isolated-app.php';
use Illuminate\Support\Facades\{Artisan,DB};
$users=DB::table('users')->count();$games=DB::table('games')->count();
if(!$games)throw new RuntimeException('Seed games before reset test.');
if(Artisan::call('game:reset-worlds')!==0)throw new RuntimeException(Artisan::output());
if(DB::table('games')->count()!==$games)throw new RuntimeException('Preview changed games');
if(Artisan::call('game:reset-worlds',['--execute'=>true])!==0)throw new RuntimeException(Artisan::output());
foreach(['games','map_drafts','map_definitions','map_features','map_resource_profiles','policy_sets','resource_sets','territories','turns'] as $table)if(DB::table($table)->exists())throw new RuntimeException("Reset retained {$table}");
if(DB::table('users')->count()!==$users)throw new RuntimeException('Reset removed accounts');
echo "PASS: reset preview is read-only; execution empties game/map/rules domain and preserves {$users} accounts.\n";

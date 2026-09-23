<?php
// Test-only; the bootstrap refuses any location outside the explicit isolated /tmp instance.
$app = require __DIR__ . '/isolated-app.php';
Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
$user = App\Models\User::where('name', 'map-admin')->first() ?? new App\Models\User();
$user->name = 'map-admin';
$user->email = 'map-admin@example.test';
$user->password = Illuminate\Support\Facades\Hash::make('fixture-password');
$user->is_admin = true;
$user->save();
echo "Isolated admin fixture ready.\n";

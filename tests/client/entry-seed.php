<?php
$app = require __DIR__ . '/isolated-app.php';
Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
$game = App\Models\Game::getCurrentOrNull() ?? App\Models\Game::createNew();
foreach (['entry-player', 'entry-recovery', 'entry-legacy'] as $name) {
    if (!App\Models\User::where('name', $name)->exists()) {
        $user = new App\Models\User();
        $user->name = $name; $user->email = $name . '@example.test'; $user->password = Illuminate\Support\Facades\Hash::make('fixture-password');
        $user->is_admin = false; $user->save();
    }
}
echo "Isolated entry fixture ready: game {$game->getId()}, " . $game->territories()->count() . " territories.\n";

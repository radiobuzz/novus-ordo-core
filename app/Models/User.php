<?php

namespace App\Models;

use App\Domain\NationSetupStatus;
use App\Domain\Password;
use App\ReadModels\UserNationSetupStatusOwnerInfo;
use App\ReadModels\UserOwnerInfo;
use App\Utils\GuardsForAssertions;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Auth;

readonly class UserCredentialsRejected {}
readonly class UserLogedIn {}

readonly class UserCredentials {
    public function __construct(
        public string $name,
        public string $password
    ) {}
}

readonly class ProvisionedUser {
    public function __construct(
        public User $user,
        public Password $password
    ) {}
}

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    use GuardsForAssertions;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    public function getName(): string {
        return $this->name;
    }
    public function getId(): int {
        return $this->getKey();
    }

    public function isAdmin(): bool {
        return $this->is_admin;
    }

    public function setPassword(Password $newPassword): void {
        $this->password = $newPassword->value;
        $this->save();
    }

    public function promoteAdministrator(): void {
        $this->is_admin = true;
        $this->save();
    }

    public function exportForDevPanel(): array {
        return ["user_id" => $this->getId(), "username" => $this->getName()];
    }

    public function exportForOwner(): UserOwnerInfo {
        return new UserOwnerInfo(
            user_name: $this->getName(),
        );
    }

    public function exportNationSetupSatusForOwner(Game $game): UserNationSetupStatusOwnerInfo {
        $nationOrNull = Nation::getForUserOrNull($game, $this);
        $setupStatus =  $this->getNationSetupStatus($game);

        return new UserNationSetupStatusOwnerInfo(
            game_id: $game->getId(),
            nation_id: $nationOrNull?->getId(),
            nation_setup_status: $setupStatus->name,
        );
    }

    public function hasJoinedGame(Game $game): bool {
        return app(\App\Services\GameAccess::class)->allows($game, $this); // Initial open-game eligibility.
    }

    public function getNationSetupStatus(Game $game): NationSetupStatus {
        $nationOrNull = Nation::getForUserOrNull($game, $this);
        if (!is_null($nationOrNull)) {
            return NationSetupStatus::FinishedSetup;
        }
        $newNationOrNull = NewNation::getForUserOrNull($game, $this);

        return is_null($newNationOrNull) ? NationSetupStatus::NotCreated : $newNationOrNull->getSetupStatus();
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
        ];
    }

    public static function login(UserCredentials $credentials): UserLogedIn|UserCredentialsRejected {
        if (Auth::attempt((array)$credentials)) {
            session()->regenerate();
            return new UserLogedIn;
        }

        sleep(1);

        return new UserCredentialsRejected;
    }

    public static function logoutCurrentUser(): void {
        Auth::logout();
        request()->session()->invalidate();
        request()->session()->regenerateToken();
    }

    public static function create(string $name, Password $password): User|UserAlreadyExists {
        $userOrNull = User::getUserWithNameOrNull($name);

        if ($userOrNull !== null) {
            return new UserAlreadyExists;
        }

        $user = new User(['name' => $name, 'email' => "{$name}@thisisnotvalid.net", 'password' => $password->value]);
        $user->save();

        return $user;
    }

    public static function provisionAdministrator(string $name): ProvisionedUser|UserAlreadyExists {
        $userOrNull = User::getUserWithNameOrNull($name);

        if ($userOrNull !== null) {
            return new UserAlreadyExists;
        }

        $password = Password::randomize();

        $user = new User(['name' => $name, 'email' => "{$name}@thisisnotvalid.net", 'password' => $password->value]);
        $user->save();
        $user->promoteAdministrator();

        return new ProvisionedUser($user, $password);
    }

    public static function adminExists(): bool {
        return User::where('is_admin', true)
            ->exists();
    }

    private static function getUserWithNameOrNull(string $name): User|null {
        return User::where('name', $name)
            ->first();
    }
}

readonly class UserAlreadyExists {}
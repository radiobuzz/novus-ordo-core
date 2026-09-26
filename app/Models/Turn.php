<?php

namespace App\Models;

use App\Utils\GuardsForAssertions;
use Carbon\CarbonImmutable;
use DateTimeZone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Turn extends Model
{
    use GuardsForAssertions;

    public const string FIELD_TURN_NUMBER = 'number';
    public const string FIELD_TURN_ACTIVATED_AT = 'activated_at';

    public function getPreviousTurn(): Turn {
        if ($this->number == 1) {
            return $this;
        }

        return Turn::where('game_id', $this->game_id)
            ->where('number', $this->number - 1)
            ->first();
    }

    public function game(): BelongsTo {
        return $this->belongsTo(Game::class);
    }

    public function getGame(): Game {
        return $this->game;
    }

    public function getGameId(): int {
        return $this->game_id;
    }

    public function deployments(): HasMany {
        return $this->hasMany(Deployment::class);
    }

    public function orders(): HasMany {
        return $this->hasMany(Order::class);
    }

    public function nationDetails(): HasMany {
        return $this->hasMany(NationDetail::class);
    }

    public function divisionDetails(): HasMany {
        return $this->hasMany(DivisionDetail::class)
            ->where(DivisionDetail::FIELD_IS_ACTIVE, true);
    }

    public function getId(): int {
        return $this->getKey();
    }

    public function getNumber(): int {
        return $this->number;
    }

    public function getPopulationSize(): int {
        return DB::table('territory_details')
            ->where('turn_id', $this->id)
            ->sum(TerritoryDetail::FIELD_POPULATION_SIZE);
    }

    public function getNumberOfDivisions(): int {
        return $this->divisionDetails()->count();
    }

    private static function calculateUltimatum(int $timeLimitMinutes): CarbonImmutable {
        $now = CarbonImmutable::now(config('novusordo.timezone_for_turn_expiration'));
        $startOfDay = $now->startOfDay();
        $minutesSinceStartOfDay = intval($startOfDay->diffInMinutes($now));
        $minutesToNextExpiration = (floor($minutesSinceStartOfDay / $timeLimitMinutes) + 1) * $timeLimitMinutes;
        $nextExpiration = $startOfDay->addMinutes($minutesToNextExpiration)->subSecond();
        
        $minimumDelaiMinutes = config('novusordo.minimum_delay_before_turn_expiration_minutes');
        if ($nextExpiration->subMinutes($minimumDelaiMinutes)->isBefore($now)) {
            $nextExpiration = $nextExpiration->addMinutes(ceil($minimumDelaiMinutes / $timeLimitMinutes) * $timeLimitMinutes);
        }

        return $nextExpiration->setTimezone('UTC');
    }

    public function activate(): void {
        $this->activated_at = CarbonImmutable::now('UTC');
        $this->save();
        $this->rotateContext();
    }

    public function end(): void {
        $this->ended_at = CarbonImmutable::now('UTC');
        $this->save();
    }

    public function reset(): void {
        $this->ended_at = null;
        $this->activated_at = CarbonImmutable::now('UTC');
        $timeLimitMinutes = intval(config('novusordo.turn_time_limit_minutes'));
        $this->expires_at = $timeLimitMinutes > 0 ? Turn::calculateUltimatum($timeLimitMinutes) : null;
        $this->save();
        $this->rotateContext();
    }

    private function rotateContext(): void {
        $game = $this->getGame()->fresh();
        if (array_key_exists('turn_context_revision', $game->getAttributes())) {
            $game->turn_context_revision = (string) \Illuminate\Support\Str::uuid();
            $game->save();
        }
    }

    public function getExpirationOrNull(): ?CarbonImmutable {
        return is_null($this->expires_at) ? null : CarbonImmutable::createFromTimeString($this->expires_at);
    }

    public function hasExpired(): bool {
        return CarbonImmutable::now()->greaterThan($this->expires_at);
    }

    public function hasEnded(): bool {
        return !is_null($this->ended_at);
    }

    public function createNext(): Turn {
        $next = $this->replicate();
        $next->number++;
        $timeLimitMinutes = intval(config('novusordo.turn_time_limit_minutes'));
        $next->expires_at = $timeLimitMinutes > 0 ? Turn::calculateUltimatum($timeLimitMinutes) : null;
        $next->activated_at = null;
        $next->ended_at = null;
        $next->save();

        return $next;
    }

    public static function createFirst(Game $game): Turn {
        $turn = new Turn;
        $turn->game_id = $game->getId();
        $turn->number = 1;
        $timeLimitMinutes = intval(config('novusordo.turn_time_limit_minutes'));
        $turn->expires_at = $timeLimitMinutes > 0 ? Turn::calculateUltimatum($timeLimitMinutes) : null;
        $turn->save();

        return $turn;
    }

    public static function getCurrentForGame(Game $game): Turn {
        return Turn::where('game_id', $game->getId())
            ->orderByDesc('number')
            ->first();
    }

    public static function getForGameByNumberOrNull(Game $game, int $number): ?Turn {
        return Turn::where('game_id', $game->getId())
            ->where('number', $number)
            ->first();
    }
}

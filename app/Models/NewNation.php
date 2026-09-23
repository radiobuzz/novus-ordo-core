<?php

namespace App\Models;

use App\Domain\SharedAssetType;
use App\Domain\NationSetupStatus;
use App\Facades\Metacache;
use App\Utils\GuardsForAssertions;
use App\Utils\ImageSource;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;
use LogicException;

readonly class NationWithSameNameAlreadyExists {
    public function __construct(
        public string $otherNationName
    ) {}
}

class NewNation extends Model
{
    use GuardsForAssertions;
    private const CRITICAL_SECTION_HOME_TERRITORIES_SELECT_CACHE_NAME = 'critical_section:home_territories_select';
    private const HOME_TERRITORY_POPULATION = 1_000_000;

    protected $table = 'nations';

    public function game(): BelongsTo {
        return $this->BelongsTo(Game::class);
    }

    public function getGame(): Game {
        return $this->game;
    }

    public function getId(): int {
        return $this->id;
    }

    public function getSetupStatus(): NationSetupStatus {
        return NationSetupStatus::from($this->nation_setup_status);
    }

    public function rename(string $usualName) {
        if ($this->anotherNationHasTheSameName($usualName)) {
            throw new LogicException("Another nation is named '$usualName'");
        }
        $this->name = $usualName;
        $this->save();
    }

    private function anotherNationHasTheSameName(string $usualName): bool {
        return NewNation::withoutGlobalScopes()
            ->where('game_id', $this->getGame()->getId())
            ->whereRaw('LOWER(' . Nation::FIELD_USUAL_NAME . ') = ?', strtolower($usualName))
            ->whereNot('id', $this->getId())
            ->exists();
    }

    public function finishSetup(
        array $homeTerritoryIds,
        string $leaderName,
        ?ImageSource $flagSrc = null,
        ?string $formalName = null,
        ?string $leaderTitleOrNull = null,
        ?ImageSource $leaderPictureSrcOrNull = null,
        ?int $primaryColorId = null,
        ?int $secondaryColorId = null,
    ): Nation {
        if (!is_null($formalName)) {
            $formalName = Str::trim($formalName);

            if (mb_strlen($formalName) < 2 || mb_strlen($formalName) > 1024) {
                throw new LogicException('The formal name must be between 2 and 1024 characters long.');
            }
        }

        if (count($homeTerritoryIds) != Game::NUMBER_OF_STARTING_TERRITORIES) {
            throw new LogicException("Parameter homeTerritoryIds: expecting " . Game::NUMBER_OF_STARTING_TERRITORIES . " IDs, " . count($homeTerritoryIds) . " specified");
        }

        $nation = Cache::lock(NewNation::CRITICAL_SECTION_HOME_TERRITORIES_SELECT_CACHE_NAME . ":{$this->game_id}", 60)->block(3, function () use ($flagSrc, $formalName, $homeTerritoryIds, $leaderName, $leaderTitleOrNull, $leaderPictureSrcOrNull, $primaryColorId, $secondaryColorId) {
            return DB::transaction(function () use ($flagSrc, $formalName, $homeTerritoryIds, $leaderName, $leaderTitleOrNull, $leaderPictureSrcOrNull, $primaryColorId, $secondaryColorId) {
                $record = Nation::withoutGlobalScopes()->lockForUpdate()->findOrFail($this->getId());
                if ((int) $record->nation_setup_status === NationSetupStatus::FinishedSetup->value) abort(409, __('entry.already_created'));
                $validate = Territory::createValidationSuitableHomeTerritory($this->getGame());
                $validate('territory_ids', $homeTerritoryIds, function () {
                    throw ValidationException::withMessages(['territory_ids' => __('entry.territories')]);
            });
            $nation = Nation::notNull(Nation::withoutGlobalScopes()->find($this->getId()));
            if ($primaryColorId !== null && $secondaryColorId !== null)
                NationColorAssignment::choose($nation, $primaryColorId, $secondaryColorId);
            
            $homeTerritories = $nation->getGame()->freeSuitableTerritoriesInTurn()->whereIn('id', $homeTerritoryIds)->get();
            
            $homeTerritories->each(function (Territory $territory) {
                if (!$territory->isSuitableAsHome()) {
                    throw new LogicException("Territory ID {$territory->getId()} is not suitable as home territory");
                }
            });

            if (is_null($flagSrc)) {
                $flagSrc = $nation->getGame()->availableSharedAssetsOfType(SharedAssetType::Flag)
                    ->inRandomOrder()->first();
            }

            $formalName = $formalName ?? "Empire of {$nation->getInternalName()}";

            $nationDetail = NationDetail::create($nation, $formalName, $flagSrc);

            Leader::create($nationDetail, $leaderName, $leaderTitleOrNull, $leaderPictureSrcOrNull);

            $homeTerritories->each(function (Territory $territory) use ($nation) {
                $detail = $territory->getDetail();
                $detail->assignHomeToOwner($nation);
                $detail->setPopulationSize(NewNation::HOME_TERRITORY_POPULATION);
                $detail->resetLaborPool();
            });

            $nation->nation_setup_status = NationSetupStatus::FinishedSetup;

            $nation->save();

            $nation->getDetail()->finalizeNationCreation();

            Metacache::expireAllforTurn($nation->getGame()->getCurrentTurn());

            return $nation;
            });
        });

        assert($nation instanceof Nation);

        return $nation;
    }

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::addGlobalScope('nation_setup_not_finished', function (Builder $builder) {
            $builder->whereNot('nation_setup_status', NationSetupStatus::FinishedSetup->value);
        });
    }

    public static function getForUserOrNull(Game $game, User $user): ?NewNation {
        return NewNation::where('user_id', $user->getId())
            ->where('game_id', $game->getId())
            ->first();
    }

    public static function createRuleNoNationWithSameNameInGame(Game $game): Unique {
        return Rule::unique(NewNation::class, 'name')
            ->where('game_id', $game->getId());
    }

    public static function createRuleNoNationWithSameNameInGameUnlessItsOwner(Game $game, User $user): Unique {
        return Rule::unique(NewNation::class, 'name')
            ->where('game_id', $game->getId())
            ->whereNot('user_id', $user->getId());
    }

    private static function nationWithSameNameAlreadyExistsInGame(Game $game, string $usualName): bool {
        return NewNation::withoutGlobalScopes()
            ->where('game_id', $game->getId())
            ->whereRaw('LOWER(' . Nation::FIELD_USUAL_NAME . ') = ?', strtolower($usualName))
            ->exists()
            ||
            NationDetail::where('game_id', $game->getId())
            ->where('turn_id', $game->getCurrentTurn()->getId())
            ->where(NationDetail::whereUsualNameIgnoreCase($usualName))
            ->exists();
    }

    private static function userAlreadyHasANationInGame(Game $game, User $user): bool {
        return NewNation::withoutGlobalScopes()
            ->where('game_id', $game->getId())
            ->where('user_id', $user->getId())
            ->exists();
    }

    public static function create(Game $game, User $user, string $usualName): NewNation {
        return NewNation::tryCreate($game, $user, $usualName);
    }

    public static function tryCreate(Game $game, User $user, string $usualName): NewNation|NationWithSameNameAlreadyExists {
        $usualName = Str::trim($usualName);

        if (mb_strlen($usualName) < 2 || mb_strlen($usualName) > 100) {
            throw new LogicException('The usual name must be between 2 and 100 characters long.');
        }

        if (NewNation::userAlreadyHasANationInGame($game, $user)) {
            throw new LogicException("User ID '{$user->getId()}' already has a nation in game ID '{$game->getId()}'");
        }

        if (NewNation::nationWithSameNameAlreadyExistsInGame($game, $usualName)) {
            return new NationWithSameNameAlreadyExists($usualName);
        }

        return DB::transaction(function () use ($game, $user, $usualName) {
            Game::whereKey($game->getId())->lockForUpdate()->firstOrFail();
            // Recheck under the same lock used to reserve a colour.
            if (NewNation::userAlreadyHasANationInGame($game, $user)) {
                throw new LogicException('This user already has a nation in this game.');
            }
            if (NewNation::nationWithSameNameAlreadyExistsInGame($game, $usualName)) {
                return new NationWithSameNameAlreadyExists($usualName);
            }
            $nation = new NewNation();
            $nation->game_id = $game->getId();
            $nation->user_id = $user->getId();
            $nation->nation_setup_status = NationSetupStatus::HomeTerritoriesSelection->value;
            $nation->name = $usualName;
            $nation->save();

            NationColorAssignment::assignAvailable($game->getId(), $nation->getId());

            return $nation;
        });
    }
}

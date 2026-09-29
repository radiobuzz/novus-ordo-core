<?php

namespace App\Models;

use App\Domain\DeploymentCommand;
use App\Domain\DivisionType;
use App\Domain\NationSetupStatus;
use App\Utils\GuardsForAssertions;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

readonly class TooExpensive {}

class Nation extends Model
{
    use GuardsForAssertions;

    public const string FIELD_USUAL_NAME = 'name';

    public function game(): BelongsTo {
        return $this->belongsTo(Game::class);
    }

    public function getGame(): Game {
        return $this->game;
    }

    public function details(): HasMany {
        return $this->hasMany(NationDetail::class);
    }

    public function getDetail(?Turn $turnOrNull = null): NationDetail {
        $turn = Turn::as($turnOrNull, fn () => Turn::getCurrentForGame($this->getGame()));
        return $this->details()->where('turn_id', $turn->getId())->first();
    }

    public function divisions(): HasMany {
        return $this->hasMany(Division::class);
    }

    public function deployments(): HasMany {
        return $this->hasMany(Deployment::class);
    }

    public function deploymentByIds(int ...$ids): HasMany {
        return $this->deployments()
            ->whereIn('id', $ids);
    }

    public function battlesWhereAttacker(): HasMany {
        return $this->hasMany(Battle::class, 'attacker_nation_id');
    }

    public function battlesWhereDefender(): HasMany {
        return $this->hasMany(Battle::class, 'defender_nation_id');
    }

    public function getId(): int {
        return $this->getKey();
    }
    public function getInternalName(): string {
        return $this->name;
    }

    public function isReadyForNextTurn(): bool {
        return $this->is_ready_for_next_turn;
    }

    public static function resetAllReadyForNextTurnStatuses(Game $game): void {
        Nation::where('game_id', $game->getId())
            ->update(['is_ready_for_next_turn' => false]);
    }

    public function cancelDeployments(Deployment ...$deployments): void {
        foreach ($deployments as $d) {
            $d->cancel();
        }

    }

    public function deploy(DeploymentCommand ...$deploymentCommands): array {
        $detail = $this->getDetail();

        $deployments = [];

        $deployedTypes = array_map(fn (DeploymentCommand $dc) => $dc->divisionType, $deploymentCommands);

        if (!$detail->canAffordCosts(\App\Services\Resources\ResourceCatalogue::forGame($this->getGame())->deploymentCosts(...$deployedTypes))) {
            throw new LogicException("Not enough resources for deployment.");
        }

        foreach ($deploymentCommands as $d) {
            $territory = $detail->getTerritoryById($d->territoryId);

            $deployments[] = Deployment::Create($this, $d->divisionType, $territory);
        }


        return $deployments;
    }

    public static function whereReadyForNextTurn(): Closure {
        return fn (Builder $builder) => $builder
            ->where('is_ready_for_next_turn', true);
    }

    public function readyForNextTurn(Turn $turn): void {
        if ($this->getGame()->getCurrentTurn()->getId() == $turn->getId()) {
            $this->is_ready_for_next_turn = true;
            $this->save();
        }
    }

    public function onNextTurn(Turn $currentTurn, Turn $nextTurn, ?array $policyContext = null): void {
        $currentDetail = $this->getDetail($currentTurn);
        $newDetail = $currentDetail->replicateForTurn($nextTurn);
        // Context is resolved for all nations before upkeep; do not inherit last season's report.
        $newDetail->policy_report = $policyContext;
        $newDetail->onNextTurn($currentDetail);
        if ($newDetail->hasEconomy()) app(\App\Services\EconomyService::class)->settle($currentDetail, $newDetail, $policyContext['settings']);

        $currentDetail->deployments()->get()->each(fn (Deployment $d) => $d->execute());
    }

    public function equals(?Nation $otherNationOrNull): bool {
        return ($otherNation = $otherNationOrNull??false)
            && $this->getId() == $otherNation->getId();
    }

    public static function getForUserOrNull(Game $game, User $user): Nation|null {
        return Nation::where('game_id', $game->getId())
            ->where('user_id', $user->getId())
            ->first();
    }

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::addGlobalScope('ancient', function (Builder $builder) {
            $builder->where('nation_setup_status', NationSetupStatus::FinishedSetup->value);
        });
    }
}

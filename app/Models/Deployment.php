<?php

namespace App\Models;

use App\Domain\DeploymentCommand;
use App\Domain\DivisionType;
use App\Domain\OrderType;
use App\ReadModels\DeploymentInfo;
use App\Utils\GuardsForAssertions;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use LogicException;

class Deployment extends Model
{
    use SoftDeletes;
    use GuardsForAssertions;

    public const float REQUIRED_LOYALTY_TO_DEPLOY = 0.50;

    public function game() :BelongsTo {
        return $this->belongsTo(Game::class);
    }

    public function getGame() :Game {
        return $this->game;
    }

    public function nation() :BelongsTo {
        return $this->belongsTo(Nation::class);
    }

    public function getNation() :Nation {
        return $this->nation;
    }

    public function territory() :BelongsTo {
        return $this->belongsTo(Territory::class);
    }

    public function getTerritory() :Territory {
        return $this->territory;
    }

    public function turn() :BelongsTo {
        return $this->belongsTo(Turn::class);
    }

    public function getTurn() :Turn {
        return $this->turn;
    }

    public function getId() :int {
        return $this->id;
    }

    public function getDivisionType(): DivisionType {
        return DivisionType::from($this->division_type);
    }

    public static function createRuleValidDeployment(Nation $nation): Exists {
        return Rule::exists(Deployment::class, 'id')
            ->where('nation_id', $nation->getId())
            ->where('turn_id', $nation->getGame()->getCurrentTurn()->getId())
            ->whereNull('deleted_at');
    }

    public static function isLoyaltyHighEnoughToDeployOnTerritory(float $ownerLoyalty): bool {
        return $ownerLoyalty > Deployment::REQUIRED_LOYALTY_TO_DEPLOY;
    }

    public function export() :DeploymentInfo {
        return new DeploymentInfo(
            deployment_id: $this->getId(),
            division_type: $this->getDivisionType()->name,
            nation_id: $this->getNation()->getId(),
            territory_id: $this->getTerritory()->getId()
        );
    }

    public function execute() :void {
        Division::create($this);
        $this->save();
    }

    public function cancel() :void {
        $this->delete();
    }

    public static function Create(Nation $nation, DivisionType $type, Territory $territory) :Deployment {
        if (!Deployment::isLoyaltyHighEnoughToDeployOnTerritory(NationTerritoryLoyalty::getLoyaltyRatioForNation($nation, $territory, $nation->getGame()->getCurrentTurn()))) {
            throw new LogicException("Loyalty of Nation ID {$nation->getId()} on Territory ID {$territory->getId()} is too low to deploy.");
        }

        $deployment = new Deployment();
        $deployment->game_id = $nation->getGame()->getId();
        $deployment->nation_id = $nation->getId();
        $deployment->territory_id = $territory->getId();
        $deployment->turn_id = Turn::getCurrentForGame($nation->getGame())->getId();
        $deployment->division_type = $type->value;
        $deployment->save();

        return $deployment;
    }
}

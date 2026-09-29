<?php
namespace App\Domain;

use App\ReadModels\DivisionTypeInfo;
use App\Utils\ParsableFromCaseName;
use Illuminate\Support\Collection;

enum DivisionType :int {
    use ParsableFromCaseName;
    
    case Infantry = 0;
    case Armored = 1;
    case Artillery = 2;
    case Fighter = 3;
    case Bomber = 4;

    public static function getMeta(DivisionType $type): DivisionTypeMeta {
        return match($type) {
            DivisionType::Infantry => new DivisionTypeMeta(
                description: "Infantry division",
                attackPower: 15,
                defensePower: 30,
            ),
            DivisionType::Armored => new DivisionTypeMeta(
                description: "Armored division",
                attackPower: 50,
                defensePower: 30,
                moves: 2,
            ),
            DivisionType::Artillery => new DivisionTypeMeta(
                description: "Artillery brigade",
                attackPower: 30,
                defensePower: 30,
            ),
            DivisionType::Fighter => new DivisionTypeMeta(
                description: "Fighter squadron",
                attackPower: 50,
                defensePower: 80,
                moves: 6,
                canTakeTerritory: false,
                canFly: true,
            ),
            DivisionType::Bomber => new DivisionTypeMeta(
                description: "Bomber squadron",
                attackPower: 80,
                defensePower: 15,
                moves: 8,
                canTakeTerritory: false,
                canFly: true,
            ),
        };
    }

    public static function getMetas(): Collection {
        return collect(DivisionType::cases())->mapWithKeys(fn (DivisionType $divisionType) => [$divisionType->value => DivisionType::getMeta($divisionType)]);
    }

    public static function exportMetas(\App\Models\Game $game): array {
        $catalogue = \App\Services\Resources\ResourceCatalogue::forGame($game);
        $types = [];
        foreach (DivisionType::cases() as $type) {
            $meta = DivisionType::getMeta($type);
            $types[] = new DivisionTypeInfo(
                division_type: $type->name,
                description: $meta->description,
                deployment_costs: $catalogue->deploymentCosts($type),
                upkeep_costs: $catalogue->costs('season', $type),
                attack_costs: $catalogue->costs('operation', $type),
                attack_power: $meta->attackPower,
                defense_power: $meta->defensePower,
                moves: $meta->moves,
                can_take_territory: $meta->canTakeTerritory,
                can_fly: $meta->canFly,
            );
        }

        return $types;
    }
}
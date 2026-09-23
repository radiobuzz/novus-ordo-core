<?php

namespace App\Models;

use App\ReadModels\NewsInfo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class News extends Model
{
    protected function casts(): array {
        return [
            'context' => 'array',
        ];
    }

    public function export(): NewsInfo {
        return new NewsInfo($this->content, $this->context);
    }

    public static function getNationUsualNameTag(NationDetail $nationDetail): string {
        return "##nation#{$nationDetail->getNationId()}#usual_name##";
    }

    public static function getNationFormalNameTag(NationDetail $nationDetail): string {
        return "##nation#{$nationDetail->getNationId()}#formal_name##";
    }

    public static function getLeaderNameTag(LeaderDetail $leaderDetail): string {
        return "##leader#{$leaderDetail->getLeaderId()}#name##";
    }

    public static function getLeaderTitleTag(LeaderDetail $leaderDetail): string {
        return "##leader#{$leaderDetail->getLeaderId()}#title##";
    }

    public static function getTerritoryNameTag(Territory $territory): string {
        return "##territory#{$territory->getId()}#name##";
    }

    public static function getAllForTurn(Turn $turn): Collection {
        return News::where('game_id', $turn->getGameId())
            ->where('turn_id', $turn->getId())
            ->get();
    }

    public static function create(Turn $turn, string $content, ?array $context = null): News {
        $news = new News();
        $news->game_id = $turn->getGame()->getId();
        $news->turn_id = $turn->getId();
        $news->content = $content;
        $news->context = $context;
        $news->save();

        return $news;
    }

    public static function createBattle(Turn $turn, Battle $battle): News {
        $attacker = $battle->getAttacker()->getDetail($turn);
        $defender = $battle->getDefenderOrNull()?->getDetail($turn);
        $territory = $battle->getTerritory();
        $conquered = $battle->getWinnerOrNull()?->getId() === $battle->getAttacker()->getId();
        $defenderName = $defender ? self::getNationUsualNameTag($defender) : 'Neutral';
        $content = $conquered
            ? self::getNationUsualNameTag($attacker) . ' conquered ' . self::getTerritoryNameTag($territory) . ' from ' . $defenderName . '.'
            : self::getNationUsualNameTag($attacker) . ' was repelled by ' . $defenderName . ' at ' . self::getTerritoryNameTag($territory) . '.';

        return self::create($turn, $content, [
            'type' => 'battle',
            'battle_id' => $battle->getId(),
            'attacker_nation_id' => $battle->getAttacker()->getId(),
            'defender_nation_id' => $battle->getDefenderOrNull()?->getId(),
            'territory_id' => $territory->getId(),
            'outcome' => $conquered ? 'conquered' : 'repelled',
        ]);
    }
}

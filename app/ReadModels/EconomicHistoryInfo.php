<?php
namespace App\ReadModels;

readonly class EconomicHistoryInfo
{
    public function __construct(public int $game_id, public int $nation_id, public int $through_turn, public string $turn_context_revision, public array $seasons) {}
}

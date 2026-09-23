<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class NationColorAssignment extends Model
{
    protected $primaryKey = 'nation_id';
    public $incrementing = false;
    public $timestamps = false;

    /** Called inside nation creation's transaction, before setup can be completed. */
    public static function assignAvailable(int $gameId, int $nationId): void {
        Game::whereKey($gameId)->lockForUpdate()->firstOrFail();
        $used = self::where('game_id', $gameId)->pluck('primary_color_id');
        $available = DB::table('nation_colors')->where('primary_allowed', true)->whereNotIn('id', $used)->orderBy('id')->first();
        if (!$available) throw ValidationException::withMessages(['nation_colors' => 'All nation colours in this game are reserved.']);
        $row = new self;
        $row->nation_id = $nationId;
        $row->game_id = $gameId;
        $row->primary_color_id = $available->id;
        $row->secondary_color_id = DB::table('nation_colors')->where('id', '!=', $available->id)->orderBy('id')->value('id');
        $row->save();
    }

    public static function choose(Nation $nation, int $primary, int $secondary): void {
        DB::transaction(function () use ($nation, $primary, $secondary) {
            Game::whereKey($nation->getGame()->getId())->lockForUpdate()->firstOrFail();
            if (!DB::table('nation_colors')->where('id', $primary)->where('primary_allowed', true)->exists()) {
                throw ValidationException::withMessages(['primary_color_id' => 'Choose a primary colour from the national palette. Neutral colours are secondary only.']);
            }
            if (DB::table('nation_colors')->whereIn('id', [$primary, $secondary])->count() !== count(array_unique([$primary, $secondary]))) {
                throw ValidationException::withMessages(['primary_color_id' => 'Choose colours from the catalogue.']);
            }
            if (self::where('game_id', $nation->getGame()->getId())->where('primary_color_id', $primary)->where('nation_id', '!=', $nation->getId())->exists()) {
                throw ValidationException::withMessages(['primary_color_id' => 'That primary colour is already reserved by another nation.']);
            }
            $row = self::findOrFail($nation->getId());
            $row->primary_color_id = $primary;
            $row->secondary_color_id = $secondary;
            $row->save();
        });
    }

    public static function exportForGame(Game $game): array {
        return [
            'colors' => DB::table('nation_colors')->orderBy('id')->get()->all(),
            'assignments' => DB::table('nation_color_assignments as colors')
                ->join('nations', 'nations.id', '=', 'colors.nation_id')
                ->where('colors.game_id', $game->getId())
                ->orderBy('colors.nation_id')
                ->get(['colors.nation_id', 'colors.primary_color_id', 'colors.secondary_color_id', 'nations.name'])->all(),
        ];
    }
}

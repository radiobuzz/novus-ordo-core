<?php

namespace App\Services\Resources;

use App\Domain\Resources\Quantity as Q;
use App\Models\{Game, Nation, Turn};
use App\Services\GameMutation;
use Illuminate\Support\Facades\DB;

/** Seasonal owned inventories, civilian cash, territorial capacity and acquisition intent. */
final class ProductionStateStore {
    private const SNAPSHOTS = [
        'territory_production_states' => ['territory_id', 'resource_id', 'owner_kind', 'installed_capacity'],
        'nation_economic_accounts' => ['nation_id', 'account_kind', 'cash'],
        'nation_resource_acquisitions' => ['nation_id', 'resource_id', 'requested_quantity', 'spending_limit', 'priority'],
        'nation_resource_stockpiles' => ['nation_id', 'resource_id', 'owner_kind', 'available_quantity', 'cost_basis'],
    ];

    /** Neutral assets exist before national founding. Never seed on annexation or capture. */
    public function initializeWorld(Game $game, Turn $turn): void {
        $this->scope($game, $turn);
        app(GameMutation::class)->run($game, function () use ($game, $turn) {
            if ($turn->getNumber() !== 1 || $this->rows('territory_production_states', $game, $turn)->exists()) {
                throw new \LogicException('World production can only be seeded once, in its founding season.');
            }
            $territories = DB::table('territories')->where('game_id', $game->id)->get(['id', 'geographic_potential']);
            $rows = $this->capacities(ResourceCatalogue::forGame($game), $territories, false);
            $this->insert('territory_production_states', $game, $turn, $rows);
        });
    }

    /** One-off core development and explicit opening cash/goods, not recurring seasonal income. */
    public function foundNation(Nation $nation, Turn $turn, array $coreTerritoryIds): void {
        $game = $nation->getGame(); $this->scope($game, $turn);
        app(GameMutation::class)->run($game, function () use ($nation, $game, $turn, $coreTerritoryIds) {
            if (DB::table('nation_economic_accounts')->where('game_id', $game->id)->where('nation_id', $nation->id)->exists()) {
                throw new \LogicException('Civilian founding assets already exist.');
            }
            $owned = DB::table('territory_details')->where('territory_details.game_id', $game->id)->where('turn_id', $turn->id)
                ->where('owner_nation_id', $nation->id)->whereIn('territory_id', $coreTerritoryIds)
                ->join('territories', 'territories.id', '=', 'territory_details.territory_id')
                ->get(['territories.id', 'territories.geographic_potential', 'territory_details.population_size']);
            if (!$coreTerritoryIds || count(array_unique($coreTerritoryIds)) !== count($coreTerritoryIds) || $owned->count() !== count($coreTerritoryIds)) {
                throw new \LogicException('Founding requires distinct territories owned by this nation in this season.');
            }
            $catalogue = ResourceCatalogue::forGame($game);
            $expected = count($catalogue->producers()) * 2 * count($coreTerritoryIds);
            if ($this->rows('territory_production_states', $game, $turn)->whereIn('territory_id', $coreTerritoryIds)->count() !== $expected) {
                throw new \LogicException('Initialize neutral territorial assets before founding.');
            }
            $rows = $this->capacities($catalogue, $owned, true);
            $this->rows('territory_production_states', $game, $turn)->whereIn('territory_id', $coreTerritoryIds)->delete();
            $this->insert('territory_production_states', $game, $turn, $rows);
            $population = (int) $owned->sum('population_size');
            $funds = $catalogue->get($catalogue->role('treasury'))['rules']['finance.civilian_founding'];
            $accounts = [];
            foreach (['household', 'producer'] as $kind) {
                $accounts[] = ['nation_id' => $nation->id, 'account_kind' => $kind, 'cash' => Q::output($population, $funds[$kind . '_cash_per_million'])];
            }
            $this->insert('nation_economic_accounts', $game, $turn, $accounts);
            $stocks = [];
            foreach ($catalogue->producers() as $resource) {
                $seed = $resource['rules']['production.founding'];
                $quantity = Q::output($population, $seed['private_inventory_per_million']);
                $stocks[] = ['nation_id' => $nation->id, 'resource_id' => $resource['id'], 'owner_kind' => 'producer',
                    'available_quantity' => $quantity, 'cost_basis' => Q::mul($quantity, $seed['private_inventory_unit_cost']),
                    'created_at' => now(), 'updated_at' => now()];
            }
            $this->insert('nation_resource_stockpiles', $game, $turn, $stocks);
        });
    }

    /** Intent only. Saving a request neither reserves money nor acquires goods. */
    public function setAcquisition(Nation $nation, Turn $turn, string $key, string $quantity, string $spendingLimit, int $priority): void {
        $game = $nation->getGame(); $this->scope($game, $turn);
        $resource = ResourceCatalogue::forGame($game)->get($key);
        if ($resource['kind'] !== 'stock' || !isset($resource['rules']['exchange.reference_price'])) {
            ResourceRuleRegistry::fail('Only priced stock resources can be acquired.');
        }
        $quantity = Q::parse($quantity); $spendingLimit = Q::parse($spendingLimit);
        if ($priority < 0 || $priority > 2147483647) ResourceRuleRegistry::fail('Invalid acquisition priority.');
        app(GameMutation::class)->run($game, function () use ($nation, $game, $turn, $resource, $quantity, $spendingLimit, $priority) {
            if (!$this->rows('nation_economic_accounts', $game, $turn)->where('nation_id', $nation->id)->exists()) {
                throw new \LogicException('Found the nation economic state before planning acquisitions.');
            }
            DB::table('nation_resource_acquisitions')->updateOrInsert(
                ['game_id' => $game->id, 'turn_id' => $turn->id, 'nation_id' => $nation->id, 'resource_id' => $resource['id']],
                ['requested_quantity' => $quantity, 'spending_limit' => $spendingLimit, 'priority' => $priority]
            );
        });
    }

    /** Copy changing state only into an empty destination. Resolver adjustments follow inside the same game transaction. */
    public function copySeason(Game $game, Turn $current, Turn $next): void {
        $this->scope($game, $current); $this->scope($game, $next);
        if ($next->getNumber() !== $current->getNumber() + 1) throw new \LogicException('Production state requires consecutive seasons.');
        app(GameMutation::class)->run($game, function () use ($game, $current, $next) {
            if (!$this->rows('territory_production_states', $game, $current)->exists()) throw new \LogicException('Opening production state is missing.');
            foreach (self::SNAPSHOTS as $table => $columns) {
                if ($this->rows($table, $game, $next)->exists()) throw new \LogicException('Destination production state must be empty.');
            }
            foreach (self::SNAPSHOTS as $table => $columns) {
                $this->rows($table, $game, $current)->orderBy('id')->chunkById(500, function ($rows) use ($table, $columns, $game, $next) {
                    $values = [];
                    foreach ($rows as $row) {
                        $value = array_intersect_key((array) $row, array_flip($columns));
                        if ($table === 'nation_resource_stockpiles') $value += ['created_at' => now(), 'updated_at' => now()];
                        $values[] = $value;
                    }
                    $this->insert($table, $game, $next, $values);
                });
            }
        });
    }

    /** Stable content snapshot for deterministic replay; row IDs and timestamps have no economic meaning. */
    public function snapshot(Game $game, Turn $turn, ?int $nationId = null): array {
        $this->scope($game, $turn); $snapshot = [];
        foreach (self::SNAPSHOTS as $table => $columns) {
            $query = $this->rows($table, $game, $turn);
            if ($nationId !== null) {
                if ($table === 'territory_production_states') $query->whereIn('territory_id', DB::table('territory_details')->where('game_id', $game->id)->where('turn_id', $turn->id)->where('owner_nation_id', $nationId)->select('territory_id'));
                else $query->where('nation_id', $nationId);
            }
            foreach ($columns as $column) $query->orderBy($column);
            $snapshot[$table] = $query->get($columns)->map(fn ($row) => (array) $row)->all();
        }
        return $snapshot;
    }

    private function capacities(ResourceCatalogue $catalogue, iterable $territories, bool $core): array {
        $rows = [];
        foreach ($territories as $territory) {
            $geography = json_decode($territory->geographic_potential, true, flags: JSON_THROW_ON_ERROR);
            foreach ($catalogue->producers() as $key => $resource) {
                $seed = $resource['rules']['production.founding'];
                // Seasonal output units. Geography is not a stockpile and population does not recreate deposits.
                $potential = Q::max('0', Q::calculated((float) ($geography['resources'][$key]['capacity'] ?? 0)));
                $total = Q::mul($potential, $seed[$core ? 'core_developed_fraction' : 'neutral_developed_fraction']);
                $public = Q::mul($total, $seed['public_share']);
                foreach (['government' => $public, 'producer' => Q::sub($total, $public)] as $owner => $capacity) {
                    $rows[] = ['territory_id' => $territory->id, 'resource_id' => $resource['id'], 'owner_kind' => $owner, 'installed_capacity' => $capacity];
                }
            }
        }
        return $rows;
    }

    private function insert(string $table, Game $game, Turn $turn, array $rows): void {
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table($table)->insert(array_map(fn ($row) => ['game_id' => $game->id, 'turn_id' => $turn->id] + $row, $chunk));
        }
    }

    private function rows(string $table, Game $game, Turn $turn): \Illuminate\Database\Query\Builder {
        return DB::table($table)->where('game_id', $game->id)->where('turn_id', $turn->id);
    }

    private function scope(Game $game, Turn $turn): void {
        if ($game->id !== $turn->getGameId()) throw new \LogicException('Foreign production season.');
    }
}

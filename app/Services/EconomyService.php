<?php
namespace App\Services;

use App\Domain\Economy\{ProductionEconomyInput, ProductionEconomySeason};
use App\Domain\Resources\Quantity as Q;
use App\Domain\TerrainType;
use App\Models\{Game, Nation, NationDetail, TerritoryDetail, Turn, DivisionDetail, News};
use App\Services\Policies\{PolicyCatalogue, PolicyService};
use App\Services\Resources\{ResourceCatalogue, ResourceLedger, ProductionStateStore};
use Illuminate\Support\Facades\DB;

/** Database boundary for the single production/exchange/fiscal resolver. */
final class EconomyService {
    public function enabled(Game $game): bool { return $game->economy_rules !== null; }

    public static function seed(bool $core, int $population): array {
        return ['capacity' => $core ? '1' : '0.45', 'infrastructure' => $core ? '0.65' : '0.25',
            'unrest' => $core ? '0.03' : '0.15', 'informal' => $core ? '0.1' : '0.2',
            'background_capacity' => ['producer' => Q::mul((string) $population, $core ? '1' : '0.45'), 'government' => '0']];
    }

    public function facts(NationDetail $detail): array {
        return DB::table('territory_details as d')->where('d.turn_id', $detail->turn_id)->where('d.owner_nation_id', $detail->nation_id)
            ->join('territories as t', 't.id', '=', 'd.territory_id')
            ->leftJoin('labor_pools as l', function ($q) { $q->on('l.territory_id', '=', 'd.territory_id')->on('l.turn_id', '=', 'd.turn_id')->on('l.nation_id', '=', 'd.owner_nation_id'); })
            ->orderBy('d.territory_id')->get(['d.territory_id', 'd.owner_nation_id', 'd.population_size', 'd.economy_state', 't.terrain_type', 't.geographic_potential', 'l.size'])
            ->map(fn ($r) => ['territory_id' => $r->territory_id, 'owner_nation_id' => $r->owner_nation_id, 'population_size' => (int) $r->population_size,
                'workers' => (int) ($r->size ?? 0), 'economy_state' => json_decode($r->economy_state, true, flags: JSON_THROW_ON_ERROR),
                'terrain' => TerrainType::from($r->terrain_type)->name, 'geography' => json_decode($r->geographic_potential, true, flags: JSON_THROW_ON_ERROR)])->all();
    }

    public function resolve(NationDetail $detail, ?array $settings = null, ?array $acquisitions = null): array {
        $cat = $detail->resources(); $game = $detail->getGame();
        $settings ??= app(PolicyService::class)->effectiveSettings($detail->getNation(), $detail->getTurn());
        $input = ProductionEconomyInput::fromSnapshots($cat->resources,
            app(ProductionStateStore::class)->snapshot($game, $detail->getTurn(), $detail->nation_id), $this->facts($detail), $detail->nation_id, $detail->economy_state['fiscal']);
        $input['state']['accounts']['lender'] = ['kind' => 'lender', 'cash' => $detail->economy_state['lender_cash']];
        $input['state']['debts'] = ['government' => ['lender' => $detail->economy_state['debt']]];
        $acquisitions = $acquisitions === null ? $input['acquisitions'] : app(ResourceLedger::class)->validatePlan($detail, $acquisitions);
        $costs = app(ResourceLedger::class)->costs($detail); $money = $cat->role('treasury');
        app(ResourceLedger::class)->assertOpeningActions($detail, $costs);
        $stocks = array_fill_keys(array_keys($cat->producers()), true);
        $nutrition = $cat->role('nutrition');
        $release = Q::mul($detail->getStockpiledQuantity($nutrition), $settings['food.emergency_release']['nutrition'] ?? '0');
        $ownership = $settings['institutions.development_ownership']['production'] ?? 'mixed';
        $result = ProductionEconomySeason::resolve($cat->resources, $input['state'], [
            'settings' => $settings, 'acquisitions' => $acquisitions,
            'committed_goods' => array_intersect_key($costs['commands'], $stocks), 'military' => array_intersect_key($costs['upkeep'], $stocks),
            'committed_payroll' => $costs['commands'][$money], 'public_payroll' => $costs['upkeep'][$money],
            'release_limits' => [$nutrition => $release],
            'investors' => match ($ownership) { 'public' => ['government'], 'private' => ['producer'], default => ['government', 'producer'] },
        ], $game->economy_rules['production']);
        $report = &$result['report'];
        $funding = Q::cmp($costs['upkeep'][$money], '0') > 0 ? min(1, (float) $report['public_payroll_paid'] / (float) $costs['upkeep'][$money]) : 1;
        foreach ($result['resources'] as $row) if (Q::cmp($row['military_requested'], '0') > 0) $funding = min($funding, (float) $row['military_fulfilled'] / (float) $row['military_requested']);
        $report['military_funding_ratio'] = $funding;
        $report['desertion_risk'] = (1 - $funding) * $game->economy_rules['desertion_rate'];
        $report['territories'] = [];
        foreach ($result['state']['territories'] as $id => $t) $report['territories'][] = ['id' => (int) $id, 'population' => $t['population'],
            'state' => $t['economy'] + ['background_capacity' => $t['background_capacity'], 'productive_condition' => $t['productive_condition'] ?? []], 'workers_used' => $result['used_workers'][$id] ?? '0'];
        $report['indicators'] = $this->indicators($report['territories'], $report);
        $report['food'] = $result['resources'][$nutrition];
        $withoutWorkers = array_keys(array_filter($result['opening_territories'], fn ($t) => $t['population'] > 0 && Q::cmp($t['workforce'], '0') === 0));
        if ($withoutWorkers) {
            $previousTurn = Turn::where('game_id', $game->id)->where('number', $detail->getTurn()->number - 1)->value('id');
            if ($previousTurn) {
                $previousOwners = DB::table('territory_details')->where('game_id', $game->id)->where('turn_id', $previousTurn)
                    ->whereIn('territory_id', $withoutWorkers)->pluck('owner_nation_id', 'territory_id')->all();
                $annexed = array_filter($withoutWorkers, fn ($id) => array_key_exists($id, $previousOwners) && ($previousOwners[$id] === null || (int) $previousOwners[$id] !== $detail->nation_id));
                $result['warnings'] = \App\Domain\Economy\MaintenanceWarnings::explain($result, $annexed);
            }
        }
        $report['warnings'] = $result['warnings'];
        return $result;
    }

    private function indicators(array $cells, ?array $report): array {
        $population = array_sum(array_column($cells, 'population')); $out = ['population' => $population];
        foreach (['infrastructure', 'unrest', 'informal'] as $key) $out[$key] = $population ? array_sum(array_map(fn ($c) => $c['population'] * (float) $c['state'][$key], $cells)) / $population : 0;
        $out['civilian_income'] = $report['earned_income'] ?? null;
        $out['income_per_person'] = $report && $population ? ((float) $report['earned_income'] - (float) $report['tax_receipts']) / $population : null;
        return $out;
    }

    public function forecast(NationDetail $detail, array $settings, ?array $acquisitions = null): array {
        return $this->forecastResult($this->resolve($detail, $settings, $acquisitions));
    }
    public function forecastResult(array $result): array {
        // No fabricated ±5% band: this conditional estimate is the exact settlement calculation.
        return ['expected' => $result['report'], 'ranges' => [], 'indicator_ranges' => [], 'warnings' => $result['warnings'],
            'resources' => $result['resources'], 'assumption' => 'Conditional estimate: current ownership, population, orders and reference prices held constant.'];
    }

    public function overview(NationDetail $detail, array $policies, ?array $result = null): array {
        $result ??= $this->resolve($detail);
        $cells = array_map(fn ($t) => ['id' => $t['territory_id'], 'population' => $t['population_size'], 'state' => $t['economy_state']], $this->facts($detail));
        $money = $detail->resources()->role('treasury'); $cash = $detail->getStockpiledQuantity($money);
        $commands = app(ResourceLedger::class)->costs($detail)['commands'][$money];
        return ['reserve_target' => $policies['report']['settings']['finance.treasury_reserve']['treasury'] ?? ($detail->getGame()->economy_rules['production']['treasury_reserve'] ?? ProductionEconomySeason::defaults()['treasury_reserve']), 'treasury' => $cash, 'committed_cash' => $commands, 'available_cash' => Q::max('0', Q::sub($cash, $commands)),
            'state' => $detail->economy_state, 'current' => $this->indicators($cells, $detail->economy_report), 'territories' => $cells,
            'last_season' => $detail->economy_report, 'forecast' => $this->forecastResult($result)];
    }

    public function initializeGame(Game $game): array {
        return app(GameMutation::class)->run($game, function () use ($game) {
            if ($this->enabled($game->fresh())) return ['game_id' => $game->id, 'already_enabled' => true];
            $catalogues = app(PolicyCatalogue::class);
            if (!$catalogues->forGame($game)) {
                $document = json_decode(file_get_contents(database_path('policy-templates/economy.json')), true, flags: JSON_THROW_ON_ERROR);
                $templateId = DB::table('policy_sets')->where('kind', 'template')->where('name', $document['name'])->orderBy('id')->value('id');
                $templateId ??= $catalogues->createTemplate($document)['set']['id'];
                $catalogues->cloneSet($templateId, $game);
            }
            $game->economy_rules = ['production' => ProductionEconomySeason::defaults(), 'lender_founding_cash' => '1000000',
                'desertion_rate' => .35, 'food_shortage_growth_penalty' => 3]; $game->save();
            $turn = $game->getCurrentTurn();
            foreach (TerritoryDetail::where('turn_id', $turn->id)->get() as $t) {
                $t->economy_state = self::seed(false, $t->population_size); $t->save();
            }
            app(ProductionStateStore::class)->initializeWorld($game, $turn);
            return ['game_id' => $game->id, 'turn' => $turn->number, 'economy_enabled' => true];
        });
    }

    public function initializeNation(Nation $nation, Turn $turn): void {
        $detail = $nation->getDetail($turn);
        if ($detail->economy_state !== null) return;
        $core = TerritoryDetail::where('turn_id', $turn->id)->where('owner_nation_id', $nation->id)->pluck('territory_id')->all();
        app(ProductionStateStore::class)->foundNation($nation, $turn, $core);
        $detail->economy_state = ['debt' => '0', 'lender_cash' => $nation->getGame()->economy_rules['lender_founding_cash'],
            'fiscal' => ['receipts' => [], 'credit_lock' => 0, 'default_episode' => false]];
        $detail->save();
    }

    public function settle(NationDetail $current, NationDetail $next, array $settings): void {
        $result = $this->resolve($current, $settings); $state = $result['state'];
        $next->economy_state = ['debt' => $state['debts']['government']['lender'], 'lender_cash' => $state['accounts']['lender']['cash'], 'fiscal' => $state['fiscal']];
        $next->economy_report = $result['report']; $next->resource_report = $result['resources']; $next->save();
        $cat = $next->resources();
        foreach (['government', 'producer'] as $owner) foreach ($cat->resources as $key => $resource) {
            if ($resource['kind'] === 'capacity' || ($resource['kind'] === 'currency' && $owner !== 'government')) continue;
            $inventory = $state['inventories'][$owner][$key] ?? ['quantity' => '0', 'cost' => '0'];
            $quantity = $resource['kind'] === 'currency' ? $state['accounts']['government']['cash'] : $inventory['quantity'];
            DB::table('nation_resource_stockpiles')->updateOrInsert(['game_id' => $next->game_id, 'turn_id' => $next->turn_id,
                'nation_id' => $next->nation_id, 'resource_id' => $resource['id'], 'owner_kind' => $owner],
                ['available_quantity' => $quantity, 'cost_basis' => $inventory['cost'], 'updated_at' => now(), 'created_at' => now()]);
        }
        foreach ($state['inventories']['household'] ?? [] as $inventory) if (Q::cmp($inventory['quantity'], '0') !== 0) throw new \LogicException('Unexpected unconsumed household inventory.');
        foreach (['producer', 'household'] as $owner) DB::table('nation_economic_accounts')->where('nation_id', $next->nation_id)->where('turn_id', $next->turn_id)->where('account_kind', $owner)->update(['cash' => $state['accounts'][$owner]['cash']]);
        $capacities = [];
        foreach ($state['territories'] as $id => $territory) foreach ($territory['capacity'] as $owner => $resources) foreach ($resources as $key => $capacity)
            $capacities[] = ['game_id' => $next->game_id, 'turn_id' => $next->turn_id, 'territory_id' => $id, 'resource_id' => $cat->get($key)['id'], 'owner_kind' => $owner, 'installed_capacity' => $capacity];
        foreach (array_chunk($capacities, 500) as $chunk) DB::table('territory_production_states')->upsert($chunk, ['turn_id', 'territory_id', 'resource_id', 'owner_kind'], ['installed_capacity']);
    }

    /** Reactive military work occurs after the planned economy; use the same wage/tax accounts. */
    public function settleResponsePayroll(NationDetail $detail, \App\Models\NationResourceStockpile $treasury, string $cost): void {
        $query = DB::table('nation_economic_accounts')->where('nation_id', $detail->nation_id)->where('turn_id', $detail->turn_id)->where('account_kind', 'household');
        $report = $detail->economy_report;
        $accounts = new \App\Domain\Economy\ProductionAccounts([], ['accounts' => [
            'government' => ['kind' => 'government', 'cash' => $treasury->available_quantity, 'tax_rate' => $detail->policy_report['settings']['finance.income_tax']['taxable_income']],
            'household' => ['kind' => 'household', 'cash' => $query->value('cash'), 'treasury' => 'government',
                'taxable_fraction' => Q::sub('1', Q::calculated($report['indicators']['informal']))],
        ]]);
        $accounts->publicPayroll('government', 'household', $cost); $settled = $accounts->close();
        $tax = '0';
        foreach ($settled['events'] as $event) if ($event['type'] === 'wages') $tax = Q::add($tax, $event['tax']);
        $treasury->available_quantity = $settled['state']['accounts']['government']['cash']; $treasury->save();
        $query->update(['cash' => $settled['state']['accounts']['household']['cash']]);
        foreach (['wages', 'earned_income', 'treasury_outflows'] as $field) $report[$field] = Q::add($report[$field], $cost);
        foreach (['tax_receipts', 'treasury_inflows'] as $field) $report[$field] = Q::add($report[$field], $tax);
        $report['response_costs'] = Q::add($report['response_costs'] ?? '0', $cost);
        $report['closing_treasury'] = $treasury->available_quantity;
        if (isset($report['civilian'])) $report['civilian']['household_cash'] = $settled['state']['accounts']['household']['cash'];
        $report['indicators'] = $this->indicators($report['territories'], $report);
        $fiscal = $detail->economy_state;
        $last = array_key_last($fiscal['fiscal']['receipts']);
        $fiscal['fiscal']['receipts'][$last] = Q::add($fiscal['fiscal']['receipts'][$last], $tax);
        $report['fiscal']['receipts'] = $fiscal['fiscal']['receipts'];
        $detail->economy_state = $fiscal; $detail->economy_report = $report; $detail->save();
    }

    public function afterUpkeep(Game $game, Turn $current, Turn $next): void {
        foreach ($game->nations()->get() as $nation) {
            $detail = $nation->getDetail($next); $report = $detail->economy_report;
            foreach ($report['territories'] as $cell) DB::table('territory_details')->where('turn_id', $next->id)->where('territory_id', $cell['id'])
                ->update(['economy_state' => json_encode($cell['state'], JSON_THROW_ON_ERROR)]);
            $deserted = [];
            foreach (DivisionDetail::where('nation_id', $nation->id)->where('turn_id', $next->id)->where('is_active', true)->orderBy('division_id')->get() as $index => $division) {
                // Stable ordinal also covers deployments recreated with new IDs after rollback.
                $draw = hexdec(substr(hash('sha256', "$game->id:$nation->id:{$next->number}:$index:desertion"), 0, 8)) / 4294967296;
                if ($draw >= $report['desertion_risk']) continue;
                $division->disband(); $deserted[] = $division->division_id;
                $type = $division->getDivision()->getDivisionType()->name;
                News::create($next, "$type division #{$division->division_id} in territory #{$division->territory_id} deserted after military funding fell short.");
            }
            $report['deserted_divisions'] = $deserted; $detail->economy_report = $report; $detail->save();
            if ($report['fiscal']['new_default']) News::create($next, News::getNationUsualNameTag($detail) . ' defaulted on interest payments. Debt was restructured and new credit restricted.');
        }
    }
}

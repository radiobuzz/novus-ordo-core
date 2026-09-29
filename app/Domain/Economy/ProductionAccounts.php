<?php

declare(strict_types=1);

namespace App\Domain\Economy;

use App\Domain\Resources\Quantity as Q;
use Brick\Math\{BigDecimal, RoundingMode};
use DomainException;
use Throwable;

/**
 * Exact, in-memory settlement primitives. No DB, policy selection, market clearing or turn runner.
 * Definitions are supplied separately from seasonal state. Amounts are six-place decimal strings.
 * Workforce is measured in worker-equivalent seasons, not the legacy per-million yield unit.
 */
final class ProductionAccounts
{
    private const ZERO = '0.000000';
    private array $state;
    private array $opening;
    private array $resources;
    private array $usedWorkers = [];
    private array $usedCapacity = [];
    private array $services = [];
    private array $holds = [];
    private array $stockHolds = [];
    private array $earnings = [];
    private array $dividends = [];
    private array $events = [];
    private int $phase = 0; // funding -> work -> exchange -> distributions/development -> close
    private array $operatingBudget = [];
    private bool $closed = false;

    public function __construct(array $resources, array $state)
    {
        foreach ($resources as &$resource) {
            if (($resource['kind'] ?? null) !== 'stock') throw new DomainException('Only produced stocks belong in this settlement contract.');
            foreach (['price', 'wage', 'workers', 'capital_cost', 'construction_workers'] as $field) {
                $resource[$field] = self::amount($resource[$field]);
                if (in_array($field, ['price', 'workers', 'capital_cost', 'construction_workers'], true) && Q::cmp($resource[$field], '0') <= 0) {
                    throw new DomainException("$field must be positive.");
                }
            }
        }
        unset($resource);
        $this->resources = $resources;
        $state += ['inventories' => [], 'territories' => [], 'debts' => []];
        foreach ($state['accounts'] as &$account) {
            if (!in_array($account['kind'], ['government', 'producer', 'household', 'lender'], true)) throw new DomainException('Unknown account kind.');
            $account['cash'] = self::amount($account['cash']);
            $account['taxable_fraction'] = self::amount($account['taxable_fraction'] ?? '1');
            if (Q::cmp($account['taxable_fraction'], '1') > 0) throw new DomainException('Invalid taxable fraction.');
            if ($account['kind'] === 'government') {
                $account['tax_rate'] = self::amount($account['tax_rate']);
                if (Q::cmp($account['tax_rate'], '1') > 0) throw new DomainException('Invalid tax rate.');
            }
        }
        unset($account);
        foreach ($state['accounts'] as $id => $account) {
            if (in_array($account['kind'], ['household', 'producer'], true)
                && ($state['accounts'][$account['treasury'] ?? '']['kind'] ?? null) !== 'government') throw new DomainException('Missing domestic treasury.');
        }
        foreach ($state['inventories'] as $owner => &$stocks) {
            if (!isset($state['accounts'][$owner])) throw new DomainException('Unknown inventory owner.');
            if ($state['accounts'][$owner]['kind'] === 'lender') throw new DomainException('External lender has no domestic goods inventory.');
            foreach ($stocks as $key => &$stock) {
                if (!isset($resources[$key])) throw new DomainException('Unknown resource.');
                $stock['quantity'] = self::amount($stock['quantity']);
                $stock['cost'] = self::amount($stock['cost']);
                if (Q::cmp($stock['quantity'], '0') === 0 && Q::cmp($stock['cost'], '0') !== 0) throw new DomainException('Empty inventory cannot retain cost.');
            }
            unset($stock);
        }
        unset($stocks);
        foreach ($state['territories'] as &$territory) {
            if (($state['accounts'][$territory['government']]['kind'] ?? null) !== 'government') throw new DomainException('Unknown territorial government.');
            $territory['workforce'] = self::amount($territory['workforce']);
            $territory['construction_reserve'] = self::amount($territory['construction_reserve'] ?? '0');
            if (Q::cmp($territory['construction_reserve'], $territory['workforce']) > 0) throw new DomainException('Construction reserve exceeds workforce.');
            $territory['taxable_fraction'] = self::amount($territory['taxable_fraction'] ?? '1');
            if (Q::cmp($territory['taxable_fraction'], '1') > 0) throw new DomainException('Invalid territorial taxable fraction.');
            foreach ($territory['workers_per_unit'] ?? [] as $key => $workers) {
                if (!isset($resources[$key]) || Q::cmp(self::amount($workers), '0') <= 0) throw new DomainException('Invalid local productivity.');
            }
            $territory += ['capacity' => [], 'background_capacity' => []];
            foreach ($territory['potential'] as $key => &$potential) {
                if (!isset($resources[$key])) throw new DomainException('Unknown potential resource.');
                $potential = self::amount($potential);
            }
            unset($potential);
            $totals = [];
            foreach ($territory['capacity'] as $owner => &$capacities) {
                if (!in_array($state['accounts'][$owner]['kind'] ?? null, ['producer', 'government'], true)) throw new DomainException('Invalid productive owner.');
                if (($state['accounts'][$owner]['kind'] === 'government' ? $owner : $state['accounts'][$owner]['treasury']) !== $territory['government']) throw new DomainException('Productive assets must reference domestic pools.');
                foreach ($capacities as $key => &$capacity) {
                    if (!isset($territory['potential'][$key])) throw new DomainException('Capacity requires potential.');
                    $capacity = self::amount($capacity);
                    $totals[$key] = Q::add($totals[$key] ?? self::ZERO, $capacity);
                }
                unset($capacity);
            }
            unset($capacities);
            foreach ($totals as $key => $total) if (Q::cmp($total, $territory['potential'][$key]) > 0) throw new DomainException('Owners share one geographic potential.');
            foreach ($territory['background_capacity'] as $owner => &$capacity) {
                if (!in_array($state['accounts'][$owner]['kind'] ?? null, ['producer', 'government'], true)) throw new DomainException('Invalid background owner.');
                if (($state['accounts'][$owner]['kind'] === 'government' ? $owner : $state['accounts'][$owner]['treasury']) !== $territory['government']) throw new DomainException('Background assets must reference domestic pools.');
                $capacity = self::amount($capacity);
            }
            unset($capacity);
        }
        unset($territory);
        foreach ($state['debts'] as $borrower => &$creditors) {
            if (($state['accounts'][$borrower]['kind'] ?? null) !== 'government') throw new DomainException('Only public borrowing is supported.');
            foreach ($creditors as $lender => &$principal) {
                if (($state['accounts'][$lender]['kind'] ?? null) !== 'lender') throw new DomainException('Missing funded lender.');
                $principal = self::amount($principal);
            }
            unset($principal);
        }
        unset($creditors);
        $this->state = $this->opening = $state;
    }

    private static function amount(string|int $value): string
    {
        if (!preg_match('/^\d+(?:\.\d{1,6})?$/D', (string) $value)) throw new DomainException('Expected a nonnegative decimal with at most six places.');
        if (BigDecimal::of($value)->isGreaterThan('99999999999999.999999')) throw new DomainException('Amount exceeds supported precision.');
        return Q::parse($value);
    }

    private function enter(int $phase): void
    {
        if ($phase < $this->phase) throw new DomainException('Cannot restart an earlier seasonal phase.');
        if ($phase === 1 && $this->phase === 0) {
            foreach ($this->state['accounts'] as $id => $_) $this->operatingBudget[$id] = $this->availableCash($id);
        }
        $this->phase = $phase;
    }

    private function operatingCash(string $owner): string
    {
        return Q::min($this->availableCash($owner), $this->operatingBudget[$owner] ?? self::ZERO);
    }

    /** Floor limits before multiplying a price: rounding must never overdraw a cash account. */
    private static function divide(string $amount, string $rate): string
    {
        return (string) BigDecimal::of($amount)->dividedBy($rate, 6, RoundingMode::DOWN);
    }

    private static function lesser(string ...$amounts): string
    {
        return array_reduce($amounts, fn ($a, $b) => Q::min($a, $b), $amounts[0]);
    }

    private function atomic(callable $operation): mixed
    {
        if ($this->closed) throw new DomainException('Season is already closed.');
        $before = clone $this;
        try { return $operation(); }
        catch (Throwable $e) {
            foreach (get_object_vars($before) as $key => $value) $this->$key = $value;
            throw $e;
        }
    }

    private function account(string $id): array
    {
        return $this->state['accounts'][$id] ?? throw new DomainException('Unknown cash account.');
    }

    private function resource(string $key): array
    {
        return $this->resources[$key] ?? throw new DomainException('Unknown produced stock.');
    }

    private function domesticTreasury(string $owner): string
    {
        $account = $this->account($owner);
        return $account['kind'] === 'government' ? $owner : ($account['treasury'] ?? throw new DomainException('Expected a domestic economic account.'));
    }

    private function sameEconomy(string $first, string $second): void
    {
        if ($this->domesticTreasury($first) !== $this->domesticTreasury($second)) throw new DomainException('Cross-border settlement is outside this contract.');
    }

    private function taxDue(string $account): string
    {
        $owner = $this->account($account);
        if ($owner['kind'] !== 'producer') return self::ZERO;
        return Q::mul(Q::mul(Q::max(self::ZERO, $this->earnings[$account] ?? self::ZERO), $owner['taxable_fraction']), $this->account($owner['treasury'])['tax_rate']);
    }

    public function availableCash(string $owner): string
    {
        $amount = Q::sub($this->account($owner)['cash'], $this->closed ? self::ZERO : $this->taxDue($owner));
        foreach ($this->holds as $hold) if ($hold['owner'] === $owner) $amount = Q::sub($amount, $hold['amount']);
        return Q::max(self::ZERO, $amount);
    }

    public function reserve(string $id, string $owner, string $amount): void
    {
        $this->atomic(function () use ($id, $owner, $amount) {
            $this->enter(0);
            $amount = self::amount($amount);
            if (isset($this->holds[$id])) throw new DomainException('Duplicate commitment.');
            if (Q::cmp($this->availableCash($owner), $amount) < 0) throw new DomainException('Commitment exceeds available cash.');
            $this->holds[$id] = compact('owner', 'amount');
        });
    }

    public function release(string $id): void
    {
        $this->atomic(function () use ($id) {
            if (!isset($this->holds[$id])) throw new DomainException('Unknown commitment.');
            unset($this->holds[$id]);
        });
    }

    public function availableStock(string $owner, string $resource): string
    {
        $amount = $this->inventory($owner, $resource)['quantity'];
        foreach ($this->stockHolds as $hold) if ($hold['owner'] === $owner && $hold['resource'] === $resource) $amount = Q::sub($amount, $hold['amount']);
        return $amount;
    }

    /** Preserve owned strategic stocks from ordinary sales/consumption until explicitly released. */
    public function reserveStock(string $id, string $owner, string $resource, string $amount): void
    {
        $this->atomic(function () use ($id, $owner, $resource, $amount) {
            $this->enter(0); $amount = self::amount($amount);
            if (isset($this->stockHolds[$id])) throw new DomainException('Duplicate stock commitment.');
            if (Q::cmp($amount, $this->availableStock($owner, $resource)) > 0) throw new DomainException('Cannot commit unowned stock.');
            $this->stockHolds[$id] = compact('owner', 'resource', 'amount');
        });
    }

    public function releaseStock(string $id): void
    {
        $this->atomic(function () use ($id) {
            if (!isset($this->stockHolds[$id])) throw new DomainException('Unknown stock commitment.');
            unset($this->stockHolds[$id]);
        });
    }

    private function cash(string $from, string $to, string $amount, string $reason): void
    {
        $this->account($to);
        if (Q::cmp($this->availableCash($from), $amount) < 0) throw new DomainException('Insufficient funded cash.');
        if (Q::cmp($amount, '0') === 0 || $from === $to) return;
        $this->state['accounts'][$from]['cash'] = Q::sub($this->account($from)['cash'], $amount);
        $this->state['accounts'][$to]['cash'] = Q::add($this->account($to)['cash'], $amount);
        $this->events[] = ['type' => 'cash', 'from' => $from, 'to' => $to, 'amount' => $amount, 'reason' => $reason];
    }

    /** Non-earned transfer (support/grant), never counted as sales, wages or profit. */
    public function support(string $government, string $household, string $amount): void
    {
        $this->atomic(function () use ($government, $household, $amount) {
            $this->enter(0);
            if ($this->account($government)['kind'] !== 'government' || $this->account($household)['kind'] !== 'household') throw new DomainException('Invalid support counterparties.');
            $this->sameEconomy($government, $household);
            $this->cash($government, $household, self::amount($amount), 'income_support');
        });
    }

    private function wages(string $owner, string $household, string $amount, string $activity, ?string $territory = null): void
    {
        $worker = $this->account($household);
        if ($worker['kind'] !== 'household') throw new DomainException('Wages need a household recipient.');
        $this->sameEconomy($owner, $household);
        $fraction = $territory === null ? $worker['taxable_fraction'] : $this->state['territories'][$territory]['taxable_fraction'];
        $tax = Q::mul(Q::mul($amount, $fraction), $this->account($worker['treasury'])['tax_rate']);
        $this->cash($owner, $household, $amount, 'gross_wages');
        $this->cash($household, $worker['treasury'], $tax, 'wage_tax');
        $this->events[] = ['type' => 'wages', 'owner' => $owner, 'activity' => $activity, 'territory' => $territory, 'gross' => $amount, 'tax' => $tax];
    }

    public function inventory(string $owner, string $resource): array
    {
        $this->account($owner); $this->resource($resource);
        return $this->state['inventories'][$owner][$resource] ?? ['quantity' => self::ZERO, 'cost' => self::ZERO];
    }

    private function addStock(string $owner, string $resource, string $quantity, string $cost): void
    {
        $old = $this->inventory($owner, $resource);
        $this->state['inventories'][$owner][$resource] = ['quantity' => Q::add($old['quantity'], $quantity), 'cost' => Q::add($old['cost'], $cost)];
    }

    /** Weighted-average cost, final withdrawal takes the exact remainder. */
    private function takeStock(string $owner, string $resource, string $quantity): string
    {
        $old = $this->inventory($owner, $resource);
        if (Q::cmp($quantity, $this->availableStock($owner, $resource)) > 0) throw new DomainException('Insufficient uncommitted owned goods.');
        $cost = $quantity === self::ZERO ? self::ZERO : (Q::cmp($quantity, $old['quantity']) === 0 ? $old['cost']
            : (string) BigDecimal::of($old['cost'])->multipliedBy($quantity)->dividedBy($old['quantity'], 6, RoundingMode::DOWN));
        $this->state['inventories'][$owner][$resource] = ['quantity' => Q::sub($old['quantity'], $quantity), 'cost' => Q::sub($old['cost'], $cost)];
        return $cost;
    }

    private function workforce(string $territory): string
    {
        $t = $this->opening['territories'][$territory] ?? throw new DomainException('Unknown territory.');
        return Q::max(self::ZERO, Q::sub(Q::sub($t['workforce'], $this->usedWorkers[$territory] ?? self::ZERO), $this->phase < 3 ? $t['construction_reserve'] : self::ZERO));
    }

    private function work(string $territory, string $workers): void
    {
        if ($this->opening['territories'][$territory]['integer_workers'] ?? false) $workers = (string) BigDecimal::of($workers)->toScale(0, RoundingMode::CEILING)->toScale(6);
        if (Q::cmp($workers, $this->workforce($territory)) > 0) throw new DomainException('Workforce already used.');
        $this->usedWorkers[$territory] = Q::add($this->usedWorkers[$territory] ?? self::ZERO, $workers);
    }

    /** Partial output consumes only its actual labor/cash; no operating credit from future sales. */
    public function productionLimits(string $territory, string $owner, string $resource): array
    {
        $rule = $this->resource($resource);
        $rate = $this->opening['territories'][$territory]['workers_per_unit'][$resource] ?? $rule['workers'];
        $capacity = Q::sub($this->opening['territories'][$territory]['capacity'][$owner][$resource] ?? self::ZERO, $this->usedCapacity[$territory][$owner][$resource] ?? self::ZERO);
        return ['installed_capacity' => $capacity, 'workers' => self::divide($this->workforce($territory), $rate),
            'working_capital' => Q::cmp($rule['wage'], '0') > 0 ? self::divide($this->phase === 0 ? $this->availableCash($owner) : $this->operatingCash($owner), $rule['wage']) : $capacity];
    }

    public function produce(string $territory, string $owner, string $resource, string $requested, string $household): string
    {
        return $this->atomic(function () use ($territory, $owner, $resource, $requested, $household) {
            $this->enter(1);
            if (!in_array($this->account($owner)['kind'], ['producer', 'government'], true)) throw new DomainException('Invalid production owner.');
            $rule = $this->resource($resource);
            $rule['workers'] = $this->opening['territories'][$territory]['workers_per_unit'][$resource] ?? $rule['workers'];
            $capacity = $this->opening['territories'][$territory]['capacity'][$owner][$resource] ?? self::ZERO;
            $left = Q::sub($capacity, $this->usedCapacity[$territory][$owner][$resource] ?? self::ZERO);
            $quantity = self::lesser(self::amount($requested), $left, self::divide($this->workforce($territory), $rule['workers']));
            if (Q::cmp($rule['wage'], '0') > 0) $quantity = Q::min($quantity, self::divide($this->operatingCash($owner), $rule['wage']));
            $cost = Q::mul($quantity, $rule['wage']);
            $this->work($territory, Q::mul($quantity, $rule['workers']));
            $this->wages($owner, $household, $cost, $resource, $territory);
            $this->operatingBudget[$owner] = Q::sub($this->operatingBudget[$owner], $cost);
            $this->usedCapacity[$territory][$owner][$resource] = Q::add($this->usedCapacity[$territory][$owner][$resource] ?? self::ZERO, $quantity);
            $this->addStock($owner, $resource, $quantity, $cost);
            $this->events[] = ['type' => 'production', 'territory' => $territory, 'owner' => $owner, 'resource' => $resource, 'quantity' => $quantity, 'cost' => $cost];
            return $quantity;
        });
    }

    /** Atomic owned-stock purchase. A named commitment bounds spending to its funded amount. */
    public function purchase(string $buyer, string $seller, string $resource, string $requested, ?string $commitment = null): string
    {
        return $this->atomic(function () use ($buyer, $seller, $resource, $requested, $commitment) {
            $this->enter(2);
            if ($buyer === $seller) throw new DomainException('Internal deliveries are not sales.');
            if (!in_array($this->account($seller)['kind'], ['government', 'producer'], true)) throw new DomainException('Invalid seller.');
            $this->sameEconomy($buyer, $seller);
            $price = $this->resource($resource)['price'];
            $budget = $this->availableCash($buyer);
            if ($commitment !== null) {
                $hold = $this->holds[$commitment] ?? throw new DomainException('Unknown commitment.');
                if ($hold['owner'] !== $buyer) throw new DomainException('Foreign commitment.');
                $budget = $hold['amount']; unset($this->holds[$commitment]);
            }
            $quantity = self::lesser(self::amount($requested), $this->availableStock($seller, $resource), self::divide($budget, $price));
            $revenue = Q::mul($quantity, $price);
            $cost = $this->takeStock($seller, $resource, $quantity);
            $this->cash($buyer, $seller, $revenue, 'goods_purchase');
            $this->addStock($buyer, $resource, $quantity, $revenue);
            if ($this->account($seller)['kind'] === 'producer') $this->earnings[$seller] = Q::add($this->earnings[$seller] ?? self::ZERO, Q::sub($revenue, $cost));
            $this->events[] = ['type' => 'sale', 'seller' => $seller, 'buyer' => $buyer, 'resource' => $resource, 'quantity' => $quantity, 'revenue' => $revenue, 'cost' => $cost];
            return $quantity;
        });
    }

    public function consume(string $owner, string $resource, string $quantity, string $purpose): void
    {
        $this->atomic(function () use ($owner, $resource, $quantity, $purpose) {
            $this->enter(2);
            $quantity = self::amount($quantity);
            $cost = $this->takeStock($owner, $resource, $quantity);
            $this->events[] = ['type' => 'consumption', 'owner' => $owner, 'resource' => $resource, 'quantity' => $quantity, 'cost' => $cost, 'purpose' => $purpose];
        });
    }

    /** Military commitments explicitly consume only unspent opening government stock. */
    public function militaryUse(string $government, string $resource, string $quantity): void
    {
        $this->atomic(function () use ($government, $resource, $quantity) {
            $this->enter(0);
            if ($this->account($government)['kind'] !== 'government') throw new DomainException('Military goods must be government owned.');
            $quantity = self::amount($quantity);
            $opening = $this->opening['inventories'][$government][$resource]['quantity'] ?? self::ZERO;
            $outflow = self::ZERO;
            foreach ($this->events as $event) {
                if (($event['resource'] ?? null) !== $resource) continue;
                if (($event['type'] === 'consumption' && $event['owner'] === $government)
                    || ($event['type'] === 'sale' && $event['seller'] === $government)
                    || ($event['type'] === 'release' && $event['owner'] === $government)) $outflow = Q::add($outflow, $event['quantity']);
            }
            if (Q::cmp($quantity, Q::max(self::ZERO, Q::sub($opening, $outflow))) > 0) throw new DomainException('New delivery cannot fund an opening military commitment.');
            $cost = $this->takeStock($government, $resource, $quantity);
            $this->events[] = ['type' => 'consumption', 'owner' => $government, 'resource' => $resource, 'quantity' => $quantity, 'cost' => $cost, 'purpose' => 'military'];
        });
    }

    /** Demand producer/priority selection is caller-owned; this settles an explicit bounded request. */
    public function consumeDemand(string $household, string $resource, string $need, array $sellers, string $government, string $releaseLimit = '0'): array
    {
        return $this->atomic(function () use ($household, $resource, $need, $sellers, $government, $releaseLimit) {
            $this->enter(2);
            if ($this->account($household)['kind'] !== 'household' || $this->account($government)['kind'] !== 'government') throw new DomainException('Invalid consumer/reserve owner.');
            $this->sameEconomy($government, $household);
            if (count(array_unique($sellers)) !== count($sellers)) throw new DomainException('Duplicate supply owner.');
            $need = self::amount($need); $bought = self::ZERO;
            foreach ($sellers as $seller) {
                $remaining = Q::max(self::ZERO, Q::sub($need, $this->availableStock($household, $resource)));
                $bought = Q::add($bought, $this->purchase($household, $seller, $resource, $remaining));
            }
            $remaining = Q::max(self::ZERO, Q::sub($need, $this->availableStock($household, $resource)));
            $released = self::lesser($remaining, self::amount($releaseLimit), $this->availableStock($government, $resource));
            $basis = $this->takeStock($government, $resource, $released);
            $this->addStock($household, $resource, $released, $basis);
            $this->events[] = ['type' => 'release', 'owner' => $government, 'recipient' => $household, 'resource' => $resource, 'quantity' => $released, 'cost' => $basis];
            $fulfilled = Q::min($need, $this->availableStock($household, $resource));
            $this->consume($household, $resource, $fulfilled, 'civilian');
            return ['requested' => $need, 'purchased' => $bought, 'released' => $released, 'fulfilled' => $fulfilled, 'unmet' => Q::sub($need, $fulfilled)];
        });
    }

    /** Residual civilian activity is bounded work with a customer, not an extra income multiplier. */
    public function prepareService(string $territory, string $owner, string $requested, string $wagePerUnit, string $household): string
    {
        return $this->atomic(function () use ($territory, $owner, $requested, $wagePerUnit, $household) {
            $this->enter(1);
            if (!in_array($this->account($owner)['kind'], ['producer', 'government'], true)) throw new DomainException('Invalid background owner.');
            $wage = self::amount($wagePerUnit);
            $capacity = $this->opening['territories'][$territory]['background_capacity'][$owner] ?? self::ZERO;
            $used = $this->services[$territory][$owner]['produced'] ?? self::ZERO;
            $quantity = self::lesser(self::amount($requested), Q::sub($capacity, $used), $this->workforce($territory));
            if (Q::cmp($wage, '0') > 0) $quantity = Q::min($quantity, self::divide($this->operatingCash($owner), $wage));
            $cost = Q::mul($quantity, $wage);
            $this->work($territory, $quantity);
            $this->wages($owner, $household, $cost, 'other_civilian_activity', $territory);
            $this->operatingBudget[$owner] = Q::sub($this->operatingBudget[$owner], $cost);
            $old = $this->services[$territory][$owner] ?? ['produced' => self::ZERO, 'available' => self::ZERO];
            $this->services[$territory][$owner] = ['produced' => Q::add($old['produced'], $quantity), 'available' => Q::add($old['available'], $quantity)];
            if ($this->account($owner)['kind'] === 'producer') $this->earnings[$owner] = Q::sub($this->earnings[$owner] ?? self::ZERO, $cost);
            $this->events[] = ['type' => 'service_work', 'owner' => $owner, 'territory' => $territory, 'quantity' => $quantity, 'cost' => $cost];
            return $quantity;
        });
    }

    public function purchaseService(string $territory, string $buyer, string $seller, string $requested, string $price): string
    {
        return $this->atomic(function () use ($territory, $buyer, $seller, $requested, $price) {
            $this->enter(2);
            if ($buyer === $seller) throw new DomainException('Internal service is not a sale.');
            if (!in_array($this->account($seller)['kind'], ['government', 'producer'], true)) throw new DomainException('Invalid service seller.');
            $this->sameEconomy($buyer, $seller);
            $price = self::amount($price);
            if (Q::cmp($price, '0') <= 0) throw new DomainException('Service price must be positive.');
            $available = $this->services[$territory][$seller]['available'] ?? self::ZERO;
            $quantity = self::lesser(self::amount($requested), $available, self::divide($this->availableCash($buyer), $price));
            $revenue = Q::mul($quantity, $price);
            $this->cash($buyer, $seller, $revenue, 'civilian_service');
            $this->services[$territory][$seller]['available'] = Q::sub($available, $quantity);
            if ($this->account($seller)['kind'] === 'producer') $this->earnings[$seller] = Q::add($this->earnings[$seller] ?? self::ZERO, $revenue);
            $this->events[] = ['type' => 'service_sale', 'seller' => $seller, 'buyer' => $buyer, 'quantity' => $quantity, 'revenue' => $revenue];
            return $quantity;
        });
    }

    public function distributeProfit(string $producer, string $household, string $requested): string
    {
        return $this->atomic(function () use ($producer, $household, $requested) {
            $this->enter(3);
            if ($this->account($producer)['kind'] !== 'producer' || $this->account($household)['kind'] !== 'household') throw new DomainException('Invalid distribution counterparties.');
            $this->sameEconomy($producer, $household);
            $net = Q::max(self::ZERO, Q::sub(Q::sub($this->earnings[$producer] ?? self::ZERO, $this->taxDue($producer)), $this->dividends[$producer] ?? self::ZERO));
            $paid = self::lesser(self::amount($requested), $net, $this->availableCash($producer));
            $this->cash($producer, $household, $paid, 'profit_distribution');
            $this->dividends[$producer] = Q::add($this->dividends[$producer] ?? self::ZERO, $paid);
            return $paid;
        });
    }

    /** Direct construction wages: capitalized investment, not another current operating expense. */
    public function develop(string $territory, string $owner, string $resource, string $requested, string $household): string
    {
        return $this->atomic(function () use ($territory, $owner, $resource, $requested, $household) {
            $this->enter(3);
            if (!in_array($this->account($owner)['kind'], ['government', 'producer'], true)) throw new DomainException('Invalid developer.');
            $rule = $this->resource($resource);
            $t = $this->state['territories'][$territory] ?? throw new DomainException('Unknown territory.');
            $a = $this->account($owner);
            if (($a['kind'] === 'government' ? $owner : $a['treasury']) !== $t['government']) throw new DomainException('Investment requires a domestic owner.');
            $installed = self::ZERO;
            foreach ($t['capacity'] as $capacities) $installed = Q::add($installed, $capacities[$resource] ?? self::ZERO);
            $quantity = self::lesser(self::amount($requested), Q::max(self::ZERO, Q::sub($t['potential'][$resource] ?? self::ZERO, $installed)),
                self::divide($this->workforce($territory), $rule['construction_workers']), self::divide($this->availableCash($owner), $rule['capital_cost']));
            $cost = Q::mul($quantity, $rule['capital_cost']);
            $this->work($territory, Q::mul($quantity, $rule['construction_workers']));
            $this->wages($owner, $household, $cost, 'construction', $territory);
            $this->state['territories'][$territory]['capacity'][$owner][$resource] = Q::add($t['capacity'][$owner][$resource] ?? self::ZERO, $quantity);
            $this->events[] = ['type' => 'investment', 'owner' => $owner, 'territory' => $territory, 'resource' => $resource, 'quantity' => $quantity, 'cost' => $cost];
            return $quantity;
        });
    }

    public function borrow(string $government, string $lender, string $amount): void
    {
        $this->atomic(function () use ($government, $lender, $amount) {
            $this->enter(0);
            if ($this->account($government)['kind'] !== 'government' || $this->account($lender)['kind'] !== 'lender') throw new DomainException('Only explicit funded public loans are supported.');
            $amount = self::amount($amount);
            $this->cash($lender, $government, $amount, 'borrowing');
            $this->state['debts'][$government][$lender] = Q::add($this->state['debts'][$government][$lender] ?? self::ZERO, $amount);
            $this->events[] = ['type' => 'loan', 'government' => $government, 'lender' => $lender, 'amount' => $amount];
        });
    }

    /** Accounting only: fiscal policy decides interest due, credit restriction and relief eligibility. */
    public function serviceDebt(string $government, string $lender, string $interest, string $repayment = '0', string $relief = '0'): array
    {
        return $this->atomic(function () use ($government, $lender, $interest, $repayment, $relief) {
            $this->enter(0);
            $principal = $this->state['debts'][$government][$lender] ?? throw new DomainException('Unknown debt.');
            $due = self::amount($interest);
            $paid = Q::min($due, $this->availableCash($government));
            $this->cash($government, $lender, $paid, 'interest');
            $arrears = Q::sub($due, $paid); $principal = Q::add($principal, $arrears);
            $repaid = self::lesser(self::amount($repayment), $principal, $this->availableCash($government));
            $this->cash($government, $lender, $repaid, 'principal_repayment');
            $principal = Q::sub($principal, $repaid); $writtenOff = Q::min($principal, self::amount($relief));
            $this->state['debts'][$government][$lender] = Q::sub($principal, $writtenOff);
            $result = ['type' => 'debt', 'government' => $government, 'lender' => $lender, 'interest_paid' => $paid, 'arrears' => $arrears, 'repaid' => $repaid, 'relief' => $writtenOff];
            $this->events[] = $result;
            return $result;
        });
    }

    /** Read-only allocator inputs; no money, phase changes or speculative income. */
    public function position(): array
    {
        $cash = $workers = $profits = [];
        foreach ($this->state['accounts'] as $id => $account) {
            $cash[$id] = $this->availableCash($id);
            $profits[$id] = Q::max('0', Q::sub($this->earnings[$id] ?? self::ZERO, $this->taxDue($id)));
        }
        foreach ($this->state['territories'] as $id => $_) $workers[$id] = $this->workforce((string) $id);
        return ['state' => $this->state, 'cash' => $cash, 'workers' => $workers, 'profits' => $profits, 'events' => $this->events];
    }

    /** Existing military/public payroll has a household counterparty, even before civilian work. */
    public function publicPayroll(string $government, string $household, string $amount): void
    {
        $this->atomic(function () use ($government, $household, $amount) {
            $this->enter(0);
            if ($this->account($government)['kind'] !== 'government') throw new DomainException('Payroll requires government funding.');
            $this->wages($government, $household, self::amount($amount), 'public_payroll');
        });
    }

    /** Infrastructure work shares construction labor and pays an actual household recipient. */
    public function publicWorks(string $territory, string $government, string $household, string $requested, string $workersPerCurrency): string
    {
        return $this->atomic(function () use ($territory, $government, $household, $requested, $workersPerCurrency) {
            $this->enter(3);
            if ($this->account($government)['kind'] !== 'government' || $this->state['territories'][$territory]['government'] !== $government) throw new DomainException('Public work requires the territorial government.');
            $rate = self::amount($workersPerCurrency);
            if (Q::cmp($rate, '0') <= 0) throw new DomainException('Public work requires workers.');
            $paid = self::lesser(self::amount($requested), $this->availableCash($government), self::divide($this->workforce($territory), $rate));
            $this->work($territory, Q::mul($paid, $rate));
            $this->wages($government, $household, $paid, 'infrastructure', $territory);
            $this->events[] = ['type' => 'public_works', 'territory' => $territory, 'owner' => $government, 'cost' => $paid];
            return $paid;
        });
    }

    public function close(array $repayments = []): array
    {
        if (!$this->closed) $this->atomic(function () use ($repayments) {
            $this->enter(4);
            foreach ($this->state['accounts'] as $id => $account) {
                $tax = $this->taxDue($id);
                if ($account['kind'] !== 'producer') continue;
                // Release the tax provision before transferring it. Actual earnings stay in the report.
                $profit = $this->earnings[$id] ?? self::ZERO;
                $this->earnings[$id] = self::ZERO;
                $this->cash($id, $account['treasury'], $tax, 'profit_tax');
                $this->events[] = ['type' => 'earnings', 'owner' => $id, 'realized_profit' => $profit, 'tax' => $tax];
            }
            $this->holds = []; // Unused seasonal commitments expire; cash never left the owner.
            $this->stockHolds = []; // Next planning season derives new holds from its own policies/orders.
            foreach ($repayments as $government => $plan) {
                $lender = $plan['lender'];
                if ($this->account($government)['kind'] !== 'government' || $this->account($lender)['kind'] !== 'lender') throw new DomainException('Invalid repayment accounts.');
                $principal = $this->state['debts'][$government][$lender] ?? throw new DomainException('Unknown debt.');
                $repaid = Q::min($principal, Q::max('0', Q::sub($this->availableCash($government), self::amount($plan['reserve']))));
                $this->cash($government, $lender, $repaid, 'principal_repayment');
                $this->state['debts'][$government][$lender] = Q::sub($principal, $repaid);
                $this->events[] = ['type' => 'debt', 'government' => $government, 'lender' => $lender, 'interest_paid' => self::ZERO, 'arrears' => self::ZERO, 'repaid' => $repaid, 'relief' => self::ZERO];
            }
            $this->closed = true;
        });
        $this->assertReconciled();
        return ['state' => $this->state, 'events' => $this->events, 'used_workers' => $this->usedWorkers];
    }

    /** End-of-season territorial transfer, not a sale or a transfer of national pooled cash/stocks. */
    public function capture(string $territory, string $government, string $producer): void
    {
        if (!$this->closed) throw new DomainException('Capture accounting follows economic close.');
        if ($this->account($government)['kind'] !== 'government' || $this->account($producer)['kind'] !== 'producer'
            || $this->account($producer)['treasury'] !== $government) throw new DomainException('Invalid successor pools.');
        $t = $this->state['territories'][$territory] ?? throw new DomainException('Unknown territory.');
        foreach (['capacity', 'background_capacity'] as $field) {
            $mapped = [];
            foreach ($t[$field] as $owner => $value) {
                $destination = $this->account($owner)['kind'] === 'government' ? $government : $producer;
                if ($field === 'background_capacity') $mapped[$destination] = Q::add($mapped[$destination] ?? self::ZERO, $value);
                else foreach ($value as $key => $quantity) $mapped[$destination][$key] = Q::add($mapped[$destination][$key] ?? self::ZERO, $quantity);
            }
            $t[$field] = $mapped;
        }
        $previous = $t['government']; $t['government'] = $government;
        $this->state['territories'][$territory] = $t;
        $this->events[] = ['type' => 'capture', 'territory' => $territory, 'from' => $previous, 'to' => $government];
    }

    /** Independent reconstruction from opening balances and recorded flows. */
    public function assertReconciled(): void
    {
        $cash = array_map(fn ($a) => $a['cash'], $this->opening['accounts']);
        $debts = $this->opening['debts'];
        $goods = $basis = [];
        foreach ($this->opening['inventories'] as $owner => $stocks) foreach ($stocks as $key => $stock) {
            $goods[$owner][$key] = $stock['quantity']; $basis[$owner][$key] = $stock['cost'];
        }
        $move = static function (&$map, $owner, $resource, $delta) { $map[$owner][$resource] = Q::add($map[$owner][$resource] ?? self::ZERO, $delta); };
        foreach ($this->events as $e) {
            if ($e['type'] === 'loan') $debts[$e['government']][$e['lender']] = Q::add($debts[$e['government']][$e['lender']] ?? self::ZERO, $e['amount']);
            if ($e['type'] === 'debt') $debts[$e['government']][$e['lender']] = Q::sub(Q::sub(Q::add($debts[$e['government']][$e['lender']], $e['arrears']), $e['repaid']), $e['relief']);
            if ($e['type'] === 'cash') { $cash[$e['from']] = Q::sub($cash[$e['from']], $e['amount']); $cash[$e['to']] = Q::add($cash[$e['to']], $e['amount']); }
            if ($e['type'] === 'production') { $move($goods, $e['owner'], $e['resource'], $e['quantity']); $move($basis, $e['owner'], $e['resource'], $e['cost']); }
            if ($e['type'] === 'sale') {
                $move($goods, $e['seller'], $e['resource'], Q::sub(self::ZERO, $e['quantity'])); $move($basis, $e['seller'], $e['resource'], Q::sub(self::ZERO, $e['cost']));
                $move($goods, $e['buyer'], $e['resource'], $e['quantity']); $move($basis, $e['buyer'], $e['resource'], $e['revenue']);
            }
            if ($e['type'] === 'consumption') { $move($goods, $e['owner'], $e['resource'], Q::sub(self::ZERO, $e['quantity'])); $move($basis, $e['owner'], $e['resource'], Q::sub(self::ZERO, $e['cost'])); }
            if ($e['type'] === 'release') { // Recipient consumption is recorded separately.
                $move($goods, $e['owner'], $e['resource'], Q::sub(self::ZERO, $e['quantity'])); $move($basis, $e['owner'], $e['resource'], Q::sub(self::ZERO, $e['cost']));
                $recipient = $e['recipient'];
                $move($goods, $recipient, $e['resource'], $e['quantity']); $move($basis, $recipient, $e['resource'], $e['cost']);
            }
        }
        foreach ($cash as $id => $amount) if ($amount !== $this->account($id)['cash'] || Q::cmp($amount, '0') < 0) throw new DomainException('Cash does not reconcile.');
        if ($debts !== $this->state['debts']) throw new DomainException('Debt does not reconcile.');
        foreach ($this->state['inventories'] as $owner => $stocks) foreach ($stocks as $key => $stock) {
            if ($stock['quantity'] !== ($goods[$owner][$key] ?? self::ZERO) || $stock['cost'] !== ($basis[$owner][$key] ?? self::ZERO)
                || Q::cmp($stock['quantity'], '0') < 0 || Q::cmp($stock['cost'], '0') < 0) throw new DomainException('Inventory does not reconcile.');
        }
    }
}

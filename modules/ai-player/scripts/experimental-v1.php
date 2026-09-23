<?php

/** @ai-name Experimental V1 */
// Single-file strategy. No application bootstrap or game models required.
return new class
{
    private const UNIT = 1_000_000;

    public function decide(array $view, array $memory, array $settings, callable $forecast): array {
        $aggression = $settings['aggression'];
        $world = array_column($view['territories'], null, 'id');
        $own = array_filter($world, fn ($t) => $t['owner'] === $view['nation_id']);
        $result = ['bids' => [], 'deployments' => [], 'orders' => [], 'disband' => [], 'memory' => $memory, 'explanation' => 'Developing economy'];
        if (!$own) {
            $result['explanation'] = 'No territory remains; no further orders.';
            $result['memory'] = [...$memory, 'state' => 'Eliminated'];
            return $result;
        }
        $memory = $this->updateConflicts($view, $memory);
        $strategy = $this->strategy($view, $world, $own, $memory, $settings);
        $memory = [...$memory, ...$strategy['memory']];
        $force = $view['divisions'];
        // Only our own recent battle locations are known; never inspect hidden enemy orders.
        $threat = null;
        foreach ($view['recent_attacks'] ?? [] as $id) {
            if (isset($own[$id])) { $threat = $id; break; }
            foreach ($own as $home) if (in_array($id, $home['connections'], true)) { $threat = $home['id']; break 2; }
        }
        $counts = array_count_values(array_column([...$force, ...$view['deployments']], 'type'));
        [$target, $targetReason] = $this->target($view, $world, $own, $memory, $settings, $strategy);
        $conflictScore = $target && $target['owner'] !== null
            ? (int) ($memory['conflicts'][(string) $target['owner']]['score'] ?? 0) : 0;
        $plannedFronts = $this->escalationFronts($target, $targetReason, $conflictScore, $view, $settings);
        $guardCount = $threat ? 2 : ($targetReason === 'conflict' ? 2 : 0);
        if ($plannedFronts > 1) $guardCount = min(4, $plannedFronts + 1);
        $guards = array_slice(array_values(array_filter($force, fn ($d) => $d['type'] === 'Infantry')), 0, $guardCount);
        $guardIds = array_column($guards, 'id');
        $memory = [...$memory, 'retaliation_fronts' => $target ? $plannedFronts : 0,
            'guard_reserve' => count($guards)];
        $failures = ($memory['target'] ?? null) === ($target['id'] ?? null) ? ($memory['failures'] ?? 0) : 0;
        if ($target && ($memory['last_attack_turn'] ?? -1) === $view['turn_number'] - 1 && ($memory['target'] ?? null) === $target['id']) $failures++;
        $requiredPower = $aggression < 35 ? 300 : ($failures >= 3 ? 300 : ($failures ? 210 : 180));
        if ($target && $target['owner'] !== null) {
            // Approximate national army sizes are public, local garrisons are not.
            $enemy = $view['opponents'][$target['owner']] ?? ['army' => 5, 'territories' => 5];
            $garrison = max(1, (int) ceil($enemy['army'] / max(1, $enemy['territories'])));
            $militia = 3 + (int) floor(($target['population'] ?? 0) * ($target['loyalty'] ?? 1) / 2_000_000);
            $requiredPower = max($requiredPower, (int) ceil(($militia + $garrison) * (1.05 - $aggression / 500) * 100));
            $requiredPower += min(3, $failures) * 60;
        }
        $requiredArtillery = $target ? max(5, (int) ceil(($requiredPower - 30) / 30)) : 5;
        $desired = ['Infantry' => max($threat ? 4 : 2, $guardCount + $plannedFronts * 2),
            'Artillery' => $requiredArtillery * $plannedFronts];
        $bids = $this->economy($view, $settings, $forecast, $desired, $counts);
        $result['bids'] = $bids;
        $projection = $forecast($view['planning'], $view['pools'], $bids, $view['production_raw']);
        // Deployment validates the whole batch BEFORE its expenses trigger reallocation.
        // Do not spend output that would only become available after placing the order.
        $remainingAvailable = array_map(fn ($row) => $row['closing'], $projection);
        $planning = $view['planning'];
        $eligible = array_values(array_filter($own, fn ($t) => $t['can_deploy']));
        if ($target) usort($eligible, fn ($a, $b) => $this->distance($a['id'], $target['id'], $world, $view['nation_id']) <=> $this->distance($b['id'], $target['id'], $world, $view['nation_id']));
        $recruitment = $view['budget']['max_recruitement_pool_expansion'];
        $allUnits = count($force) + count($view['deployments']);
        $reserve = max(3, $allUnits * ($aggression < 35 ? 2 : 1));
        for ($i = 0; $i < 3 && $eligible && $recruitment > 0; $i++) {
            $type = ($counts['Infantry'] ?? 0) < $desired['Infantry'] ? 'Infantry' : 'Artillery';
            if (($counts[$type] ?? 0) >= $desired[$type]) break;
            $cost = $view['definitions'][$type]['deployment_costs'];
            foreach ($cost as $resource => $amount) if (($remainingAvailable[$resource] ?? 0) < $amount * self::UNIT) break 2;
            $candidate = $planning;
            foreach ($cost as $resource => $amount) $candidate['resources'][$resource]['expenses'] += $amount * self::UNIT;
            $now = $forecast($candidate, $view['pools'], $bids, $view['production_raw']);
            $affordable = true;
            foreach ($now as $resource => $row) if ($row['closing'] < -0.001) $affordable = false;
            // Reserve recruitment for pending deployments and prove three turns of upkeep.
            $future = $candidate;
            foreach ($future['resources'] as $resource => &$meta) {
                $meta['stock'] = max(0, $now[$resource]['closing']);
                $meta['expenses'] = 0;
            }
            unset($meta);
            $added = count($view['deployments']) + count($result['deployments']) + 1;
            $future['resources']['Capital']['upkeep'] += $added * self::UNIT;
            $future['resources']['RecruitmentPool']['upkeep'] += $added * self::UNIT;
            $futureRows = $now;
            for ($turn = 0; $turn < 3 && $affordable; $turn++) {
                // Conservative: no assumed conquest or population growth to rescue the army.
                $futureRows = $forecast($future, $view['pools'], $bids, $view['production_raw']);
                foreach ($futureRows as $resource => $row) {
                    if ($row['closing'] < -0.001) $affordable = false;
                    $future['resources'][$resource]['stock'] = max(0, $row['closing']);
                }
            }
            if (!$affordable || $now['Capital']['closing'] < $reserve * self::UNIT || $futureRows['Capital']['balance'] < 0) break;
            $result['deployments'][] = ['territory_id' => $eligible[0]['id'], 'division_type' => $type];
            foreach ($cost as $resource => $amount) $remainingAvailable[$resource] -= $amount * self::UNIT;
            $planning = $candidate; $projection = $now;
            $counts[$type] = ($counts[$type] ?? 0) + 1; $recruitment--;
        }
        // Structural trouble: stop growing the army and release a small amount through normal orders.
        if ($projection['Capital']['closing'] < self::UNIT && $projection['Capital']['balance'] < -self::UNIT && $force) {
            $result['disband'] = [$force[array_key_last($force)]['id']];
            $result['memory'] = [...$memory, 'state' => 'Recover economy', 'target' => $target['id'] ?? null,
                'target_reason' => $targetReason];
            $result['explanation'] = $this->strategySummary($strategy) . ' Recovering economy: no recruitment; releasing one unaffordable division.';
            return $result;
        }
        $memory = [...$memory, 'target' => $target['id'] ?? null, 'target_reason' => $targetReason,
            'failures' => $failures, 'state' => 'Develop', 'required_power' => $requiredPower];
        if (!$target) {
            $result['explanation'] = $strategy['home_controlled']
                ? $this->strategySummary($strategy) . ' No active conflict; maintaining economy and reserves.'
                : $this->strategySummary($strategy) . ' No eligible reachable target; maintaining economy and reserves.';
        } else {
            $reachable = []; $power = 0;
            foreach ($force as $division) {
                if (in_array($division['id'], $guardIds, true)) continue;
                if ($this->canAttack($division['territory_id'], $target['id'], $world)) {
                    $reachable[] = $division;
                    $power += $view['definitions'][$division['type']]['attack_power'];
                }
            }
            $available = array_values(array_filter($force, fn ($division) => !in_array($division['id'], $guardIds, true)));
            $campaignTargets = $this->campaignTargets($target, $plannedFronts, $world, $own, $settings);
            $groups = [];
            foreach ($campaignTargets as $campaignTarget) {
                $group = $this->attackGroup($available, $campaignTarget, $requiredPower, $world, $view['definitions']);
                if (!$group) continue;
                $groups[] = ['target' => $campaignTarget, ...$group];
                $used = array_fill_keys(array_column($group['divisions'], 'id'), true);
                $available = array_values(array_filter($available, fn ($division) => !isset($used[$division['id']])));
            }
            if ($groups && $groups[0]['target']['id'] === $target['id']) {
                foreach ($groups as $group) foreach ($group['divisions'] as $division)
                    $result['orders'][] = ['division_id' => $division['id'], 'destination_territory_id' => $group['target']['id'], 'path_territory_ids' => []];
                $fronts = count($groups); $totalPower = array_sum(array_column($groups, 'power'));
                $memory['state'] = $fronts > 1 ? 'Escalate' : 'Attack';
                $memory['last_attack_turn'] = $view['turn_number'];
                $memory['retaliation_fronts'] = $fronts; $memory['guard_reserve'] = count($guards);
                $names = implode(', ', array_column(array_column($groups, 'target'), 'name'));
                $result['explanation'] = $this->strategySummary($strategy) . " {$memory['state']} against $names for "
                    . $this->reasonLabel($targetReason) . ' across ' . $fronts . ' front(s) with '
                    . count($result['orders']) . " divisions ($totalPower combined power; $requiredPower required per front).";
            } else {
                foreach ($force as $division) {
                    if (in_array($division['id'], $guardIds, true)) continue;
                    if ($this->canAttack($division['territory_id'], $target['id'], $world)) continue;
                    $path = $this->rallyPath($division['territory_id'], $target['id'], $world, $view['nation_id']);
                    if ($path) $result['orders'][] = ['division_id' => $division['id'], 'destination_territory_id' => $path[0], 'path_territory_ids' => []];
                }
                $memory['state'] = $result['orders'] ? 'Rally' : ($allUnits ? 'Muster' : 'Develop');
                $memory['retaliation_fronts'] = $plannedFronts; $memory['guard_reserve'] = count($guards);
                $result['explanation'] = $this->strategySummary($strategy) . " {$memory['state']}: preparing for {$target['name']} to "
                    . $this->reasonLabel($targetReason) . "; $power/$requiredPower power in reach. "
                    . "Force " . ($counts['Artillery'] ?? 0) . "/{$desired['Artillery']} Artillery, " . ($counts['Infantry'] ?? 0) . '/2 Infantry. '
                    . ($recruitment < 1 ? 'Waiting for population/recruitment growth.' : (!$result['deployments'] ? 'Saving Capital and growing a sustainable economy.' : 'Recruiting affordable reinforcements.'));
            }
        }
        $guardPost = $threat ?: ($target ? $this->guardPost($target, $own, $world) : null);
        foreach ($guards as $guard) {
            $path = $guardPost ? $this->rallyPath($guard['territory_id'], $guardPost, $world, $view['nation_id'], true) : null;
            if ($path) $result['orders'][] = ['division_id' => $guard['id'], 'destination_territory_id' => $path[0], 'path_territory_ids' => []];
        }
        if ($threat) {
            $memory['state'] = 'Defend';
            $result['explanation'] = "Defending {$world[$threat]['name']} after a recent attack with " . count($guards) . ' Infantry. ' . $result['explanation'];
        } elseif ($guards && $targetReason === 'conflict') {
            $result['explanation'] = 'Expecting retaliation; holding ' . count($guards) . ' Infantry near the contested frontier. ' . $result['explanation'];
        }
        if ($result['deployments']) $result['explanation'] .= ' Queued ' . count($result['deployments']) . ' deployment(s).';
        $result['memory'] = $memory;
        return $result;
    }

    private function economy(array $view, array $settings, callable $forecast, array $desired, array $counts): array {
        $unit = self::UNIT; $resources = $view['planning']['resources'];
        $foodUse = $resources['Food']['upkeep'] / $unit;
        $foodStock = $resources['Food']['stock'] / $unit;
        $oreNeed = max(0, $desired['Artillery'] - ($counts['Artillery'] ?? 0) + 2 - $resources['Ore']['stock'] / $unit);
        $targetFood = max(0, min($foodUse * 1.0, ($foodUse * 3 - $foodStock) / 2));
        $best = []; $score = -INF;
        foreach (array_unique([0, $targetFood * .4, $targetFood]) as $food) {
            foreach (array_unique([0, min(1, $oreNeed), min(3, $oreNeed)]) as $ore) {
                $bids = [];
                foreach (['Food' => $food, 'Material' => 0, 'Ore' => $ore, 'Oil' => 0] as $resource => $amount) $bids[] = [
                    'resource_type' => $resource, 'max_quantity' => (int) round($amount * $unit), 'max_labor_allocation_per_unit' => 2147483647,
                ];
                $rows = $forecast($view['planning'], $view['pools'], $bids, $view['production_raw']);
                $candidateScore = 0;
                foreach ($rows as $row) if ($row['closing'] < 0) $candidateScore -= 10000 + abs($row['closing']) / $unit * 1000;
                $capital = $rows['Capital']['closing'] / $unit;
                $reserve = max(4, count($view['divisions']) * 1.5);
                $candidateScore += min($capital, $reserve) * 8 + max(0, $capital - $reserve) * .25;
                $candidateScore += min($foodUse * 3, $rows['Food']['closing'] / $unit) * 3;
                if ($rows['Food']['balance'] < 0 && $foodStock < $foodUse) $candidateScore -= 20;
                $candidateScore += min($oreNeed + $resources['Ore']['stock'] / $unit, $rows['Ore']['closing'] / $unit) * .8;
                if ($candidateScore > $score) { $score = $candidateScore; $best = $bids; }
            }
        }
        return $best;
    }

    /** Home geography and doctrine are derived from plain observation and persisted in disposable JSON memory. */
    private function strategy(array $view, array $world, array $own, array $memory, array $settings): array {
        $components = []; $members = []; $landGraph = [];
        foreach ($world as $territory) {
            if ($territory['water']) continue;
            foreach ($territory['land_connections'] ?? $territory['connections'] as $neighbor) {
                if (!isset($world[$neighbor]) || $world[$neighbor]['water']) continue;
                $landGraph[$territory['id']][] = $neighbor;
                $landGraph[$neighbor][] = $territory['id'];
            }
        }
        foreach ($world as $territory) {
            if ($territory['water'] || isset($components[$territory['id']])) continue;
            $queue = [$territory['id']]; $components[$territory['id']] = $territory['id'];
            for ($i = 0; $i < count($queue); $i++) {
                $id = $queue[$i];
                foreach ($landGraph[$id] ?? [] as $neighbor) {
                    if (!isset($world[$neighbor]) || $world[$neighbor]['water'] || isset($components[$neighbor])) continue;
                    $components[$neighbor] = $territory['id']; $queue[] = $neighbor;
                }
            }
            sort($queue); $anchor = $queue[0];
            foreach ($queue as $id) $components[$id] = $anchor;
            $members[$anchor] = $queue;
        }
        $anchor = (int) ($memory['home_landmass_anchor'] ?? 0);
        if (!isset($members[$anchor])) {
            $counts = [];
            foreach ($own as $territory) {
                $component = $components[$territory['id']] ?? $territory['id'];
                $counts[$component] = ($counts[$component] ?? 0) + 1;
            }
            $anchor = 0; $best = -1;
            foreach ($counts as $component => $count) if ($count > $best || ($count === $best && $component < $anchor)) {
                $anchor = (int) $component; $best = $count;
            }
        }
        $home = array_fill_keys($members[$anchor] ?? [], true);
        $homeNeutral = 0; $homeEnemy = 0; $homeOwned = 0;
        foreach ($home as $id => $_) {
            if ($world[$id]['owner'] === $view['nation_id']) $homeOwned++;
            elseif ($world[$id]['owner'] === null) $homeNeutral++;
            else $homeEnemy++;
        }
        $landFocus = isset($memory['land_focus']) ? (int) $memory['land_focus']
            : hexdec(substr(hash('sha256', $settings['seed'] . ':land-focus'), 0, 4)) % 100;
        $doctrine = $settings['aggression'] < 35 ? 'regional'
            : ($settings['aggression'] >= 70 ? 'conqueror' : ($landFocus >= 50 ? 'continental' : 'frontier'));
        return ['home' => $home, 'home_owned' => $homeOwned, 'home_neutral' => $homeNeutral,
            'home_enemy' => $homeEnemy, 'home_controlled' => $homeNeutral === 0 && $homeEnemy === 0,
            'land_focus' => $landFocus, 'doctrine' => $doctrine,
            'memory' => ['strategy_version' => 2, 'home_landmass_anchor' => $anchor,
                'land_focus' => $landFocus, 'doctrine' => $doctrine]];
    }

    private function updateConflicts(array $view, array $memory): array {
        $conflicts = $memory['conflicts'] ?? [];
        $elapsed = max(0, $view['turn_number'] - (int) ($memory['conflicts_updated_turn'] ?? $view['turn_number']));
        foreach ($conflicts as $opponent => &$conflict) {
            $conflict['score'] = max(0, (int) ($conflict['score'] ?? 0) - $elapsed * 2);
            if ($conflict['score'] === 0 && $view['turn_number'] - (int) ($conflict['last_turn'] ?? 0) > 12) unset($conflicts[$opponent]);
        }
        unset($conflict);
        $lastBattle = (int) ($memory['last_conflict_battle_id'] ?? 0);
        foreach ($view['conflict_events'] ?? [] as $event) {
            if ((int) $event['id'] <= $lastBattle) continue;
            $opponent = (string) $event['opponent_id'];
            $row = $conflicts[$opponent] ?? ['score' => 0, 'last_turn' => 0, 'attacks_received' => 0, 'battles' => 0];
            $row['score'] = min(100, (int) $row['score'] + ($event['defending'] ? 14 : 3)
                + ($event['won'] ? 2 : (($event['lost'] ?? false) ? 8 : 4)));
            $row['last_turn'] = (int) $event['turn_number'];
            $row['battles'] = (int) $row['battles'] + 1;
            if ($event['defending']) $row['attacks_received'] = (int) $row['attacks_received'] + 1;
            $conflicts[$opponent] = $row;
            $lastBattle = max($lastBattle, (int) $event['id']);
        }
        return [...$memory, 'conflicts' => $conflicts, 'conflicts_updated_turn' => $view['turn_number'],
            'last_conflict_battle_id' => $lastBattle];
    }

    private function escalationFronts(?array $target, ?string $reason, int $score, array $view, array $settings): int {
        if (!$target || $target['owner'] === null || $reason !== 'conflict' || $score < 20) return 1;
        $chance = min(90, $score + (int) floor($settings['aggression'] / 3));
        $roll = hexdec(substr(hash('sha256', $settings['seed'] . ":{$view['turn_number']}:{$target['owner']}:escalate"), 0, 4)) % 100;
        if ($roll >= $chance) return 1;
        return $score >= 65 && $roll < (int) floor($chance / 2) ? 3 : 2;
    }

    private function campaignTargets(array $primary, int $fronts, array $world, array $own, array $settings): array {
        if ($fronts < 2 || $primary['owner'] === null) return [$primary];
        $others = [];
        foreach ($world as $territory) {
            if ($territory['id'] === $primary['id'] || $territory['water'] || $territory['owner'] !== $primary['owner']) continue;
            $reachable = false; $landBorder = false;
            foreach ($own as $origin) {
                if (in_array($territory['id'], $origin['land_connections'] ?? $origin['connections'], true)) $landBorder = true;
                if ($this->canAttack($origin['id'], $territory['id'], $world)) $reachable = true;
            }
            if (!$reachable) continue;
            $score = ($landBorder ? 100 : 0) + (in_array($territory['terrain'], ['Plain', 'River'], true) ? 10 : 0)
                + (hexdec(substr(hash('sha256', $settings['seed'] . ':front:' . $territory['id']), 0, 4)) % 100) / 100;
            $others[] = ['territory' => $territory, 'score' => $score];
        }
        usort($others, fn ($a, $b) => $b['score'] <=> $a['score']);
        return [$primary, ...array_column(array_slice($others, 0, $fronts - 1), 'territory')];
    }

    private function attackGroup(array $available, array $target, int $requiredPower, array $world, array $definitions): ?array {
        $candidates = array_values(array_filter($available,
            fn ($division) => $this->canAttack($division['territory_id'], $target['id'], $world)));
        usort($candidates, fn ($a, $b) => $a['id'] <=> $b['id']);
        $infantry = array_values(array_filter($candidates, fn ($division) => $division['type'] === 'Infantry'));
        $artillery = array_values(array_filter($candidates, fn ($division) => $division['type'] === 'Artillery'));
        if (count($infantry) < 2 || count($artillery) < 5) return null;
        $selected = [...array_slice($infantry, 0, 2), ...array_slice($artillery, 0, 5)];
        $used = array_fill_keys(array_column($selected, 'id'), true);
        $power = array_sum(array_map(fn ($division) => $definitions[$division['type']]['attack_power'], $selected));
        $remaining = array_values(array_filter($candidates, fn ($division) => !isset($used[$division['id']])));
        usort($remaining, fn ($a, $b) => $definitions[$b['type']]['attack_power'] <=> $definitions[$a['type']]['attack_power'] ?: $a['id'] <=> $b['id']);
        foreach ($remaining as $division) {
            if ($power >= $requiredPower) break;
            $selected[] = $division; $power += $definitions[$division['type']]['attack_power'];
        }
        return $power >= $requiredPower ? ['divisions' => $selected, 'power' => $power] : null;
    }

    private function guardPost(array $target, array $own, array $world): ?int {
        $land = []; $reachable = [];
        foreach ($own as $origin) {
            if (in_array($target['id'], $origin['land_connections'] ?? $origin['connections'], true)) $land[] = $origin['id'];
            elseif ($this->canAttack($origin['id'], $target['id'], $world)) $reachable[] = $origin['id'];
        }
        sort($land); sort($reachable);
        return $land[0] ?? $reachable[0] ?? null;
    }

    private function target(array $view, array $world, array $own, array $memory, array $settings, array $strategy): array {
        $candidates = [];
        foreach ($world as $t) {
            if ($t['water'] || $t['owner'] === $view['nation_id']) continue;
            if ($settings['protect_humans'] && $t['owner'] !== null && in_array($t['owner'], $view['human_ids'], true)) continue;
            $reachable = false;
            foreach ($own as $origin) if ($this->canAttack($origin['id'], $t['id'], $world)) { $reachable = true; break; }
            if (!$reachable) continue;
            $neutral = $t['owner'] === null;
            $local = isset($strategy['home'][$t['id']]);
            $hostility = $neutral ? 0 : (int) ($memory['conflicts'][(string) $t['owner']]['score'] ?? 0);
            if ($neutral) {
                if (!$local && $strategy['doctrine'] === 'regional') continue;
                $score = $local ? 240 : 150;
                $reason = $local ? 'local-neutral' : 'neutral-expansion';
            } elseif ($local) {
                // Seeded land focus means completing the home region sometimes outranks an overseas neutral.
                $score = 90 + $strategy['land_focus'] + $settings['aggression'] / 5 + $hostility * 1.5;
                $reason = $hostility >= 10 ? 'conflict' : 'landmass-control';
            } else {
                if ($strategy['doctrine'] === 'regional' && $hostility < 20) continue;
                if (!in_array($strategy['doctrine'], ['conqueror', 'frontier'], true) && $hostility < 10) continue;
                $score = ($strategy['doctrine'] === 'conqueror' ? 130 + $settings['aggression'] * .8 : 65 + $settings['aggression'])
                    + $hostility * 1.5;
                $reason = $hostility >= 10 ? 'conflict' : 'wider-war';
            }
            $score += in_array($t['terrain'], ['Plain', 'River'], true) ? 12 : 0;
            $score += ($memory['target'] ?? null) === $t['id'] ? 15 - ($memory['failures'] ?? 0) * 6 : 0;
            if (in_array($t['id'], $view['recent_attacks'] ?? [], true)) $score += 100;
            $score += (hexdec(substr(hash('sha256', $settings['seed'] . ':' . $t['id']), 0, 4)) % 100) / 100;
            $candidates[] = ['territory' => $t, 'score' => $score, 'reason' => $reason];
        }
        usort($candidates, fn ($a, $b) => $b['score'] <=> $a['score']);
        return isset($candidates[0]) ? [$candidates[0]['territory'], $candidates[0]['reason']] : [null, null];
    }

    private function strategySummary(array $strategy): string {
        $status = $strategy['home_controlled'] ? 'controlled' : "{$strategy['home_owned']} owned, {$strategy['home_neutral']} neutral, {$strategy['home_enemy']} rival";
        return ucfirst($strategy['doctrine']) . " strategy; home landmass $status.";
    }

    private function reasonLabel(?string $reason): string {
        return match ($reason) {
            'local-neutral' => 'local neutral growth', 'neutral-expansion' => 'neutral expansion',
            'landmass-control' => 'home-landmass control', 'conflict' => 'an active conflict',
            'wider-war' => 'a wider campaign', default => 'strategic position',
        };
    }

    private function canAttack(int $from, int $target, array $world): bool {
        return in_array($target, $world[$from]['connections'], true) || ($world[$from]['sea'] && $world[$target]['sea']);
    }

    private function rallyPath(int $from, int $target, array $world, int $nation, bool $exact = false): ?array {
        $queue = [[$from, []]]; $seen = [$from => true];
        for ($i = 0; $i < count($queue); $i++) {
            [$id, $path] = $queue[$i];
            if ($exact ? $id === $target : $this->canAttack($id, $target, $world)) return $path;
            $next = $world[$id]['connections'];
            if ($world[$id]['sea']) foreach ($world as $t) if ($t['sea'] && $t['owner'] === $nation) $next[] = $t['id'];
            foreach ($next as $neighbor) if (!isset($seen[$neighbor]) && !$world[$neighbor]['water'] && $world[$neighbor]['owner'] === $nation) {
                $seen[$neighbor] = true; $queue[] = [$neighbor, [...$path, $neighbor]];
            }
        }
        return null;
    }

    private function distance(int $from, int $target, array $world, int $nation): int {
        $path = $this->rallyPath($from, $target, $world, $nation);
        return $path === null ? PHP_INT_MAX : count($path) + 1;
    }
};


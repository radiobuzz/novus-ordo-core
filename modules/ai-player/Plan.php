<?php

namespace ExperimentalAI;

/** Structural validation shared by the standalone kit and live runner; game legality is server-owned. */
final class Plan
{
    public static function normalize(mixed $plan): array {
        if (!is_array($plan)) throw new \InvalidArgumentException('Decision must be an object.');
        $allowed = ['bids', 'deployments', 'orders', 'disband', 'cancel_orders', 'cancel_deployments', 'memory', 'explanation', 'diplomacy'];
        if (array_diff(array_keys($plan), $allowed)) throw new \InvalidArgumentException('Unknown decision field.');
        foreach (['bids', 'deployments', 'orders', 'disband', 'memory'] as $key) {
            if (!isset($plan[$key]) || !is_array($plan[$key])) throw new \InvalidArgumentException("Decision requires array: $key");
        }
        $plan += ['cancel_orders' => [], 'cancel_deployments' => [], 'diplomacy' => []];
        foreach (['diplomacy' => 20, 'bids' => 4, 'deployments' => 2000, 'orders' => 2000, 'disband' => 2000, 'cancel_orders' => 2000, 'cancel_deployments' => 2000] as $key => $limit) {
            if (!is_array($plan[$key]) || !array_is_list($plan[$key]) || count($plan[$key]) > $limit) throw new \InvalidArgumentException("Invalid list: $key");
        }
        if (!is_string($plan['explanation'] ?? null) || $plan['explanation'] === '' || strlen($plan['explanation']) > 3000)
            throw new \InvalidArgumentException('Explanation must contain 1–3000 bytes.');
        if (strlen(json_encode($plan['memory'], JSON_THROW_ON_ERROR)) > 65536) throw new \InvalidArgumentException('Notes exceed 64 KiB.');
        $id = function ($value) {
            if (!is_int($value) || $value < 1) throw new \InvalidArgumentException('IDs must be positive integers.');
        };
        $messageRecipients = []; $messageCount = 0;
        foreach ($plan['diplomacy'] as $action) {
            if (!is_array($action) || !in_array($action['action'] ?? null,
                ['send_message', 'propose_peace', 'accept_peace', 'decline_peace'], true))
                throw new \InvalidArgumentException('Unsupported diplomacy action.');
            if ($action['action'] === 'send_message') {
                $id($action['nation_id'] ?? null);
                $body = $action['body'] ?? null;
                $length = is_string($body) ? (function_exists('mb_strlen') ? mb_strlen($body) : strlen($body)) : 0;
                if (!is_string($body) || trim($body) === '' || $length > 2000)
                    throw new \InvalidArgumentException('Messages must contain 1–2000 characters.');
                if (isset($messageRecipients[$action['nation_id']]))
                    throw new \InvalidArgumentException('Only one message may be sent to each nation per turn.');
                $messageRecipients[$action['nation_id']] = true;
                if (++$messageCount > 5) throw new \InvalidArgumentException('At most five messages may be sent per turn.');
            } else {
                $id($action[$action['action'] === 'propose_peace' ? 'nation_id' : 'offer_id'] ?? null);
            }
        }
        foreach (['disband', 'cancel_orders', 'cancel_deployments'] as $key) {
            foreach ($plan[$key] as $value) $id($value);
            if (count(array_unique($plan[$key])) !== count($plan[$key])) throw new \InvalidArgumentException("Duplicate IDs: $key");
        }
        foreach ($plan['deployments'] as $row) {
            if (!is_array($row)) throw new \InvalidArgumentException('Invalid deployment.');
            $id($row['territory_id'] ?? null);
            if (!in_array($row['division_type'] ?? null, ['Infantry', 'Artillery', 'Armored', 'Fighter', 'Bomber'], true))
                throw new \InvalidArgumentException('Unknown division type.');
        }
        foreach ($plan['orders'] as $row) {
            if (!is_array($row)) throw new \InvalidArgumentException('Invalid order.');
            $id($row['division_id'] ?? null); $id($row['destination_territory_id'] ?? null);
            if (!is_array($row['path_territory_ids'] ?? null) || !array_is_list($row['path_territory_ids']) || count($row['path_territory_ids']) > 8)
                throw new \InvalidArgumentException('Order requires a path list of at most 8 IDs.');
            foreach ($row['path_territory_ids'] as $value) $id($value);
        }
        $ordered = array_column($plan['orders'], 'division_id');
        if (count(array_unique($ordered)) !== count($ordered) || array_intersect($ordered, $plan['disband']))
            throw new \InvalidArgumentException('A division cannot receive conflicting orders.');
        if ($plan['bids']) {
            $resources = array_column($plan['bids'], 'resource_type'); sort($resources);
            if ($resources !== ['Food', 'Material', 'Oil', 'Ore']) throw new \InvalidArgumentException('Supply all four production bids.');
            foreach ($plan['bids'] as $row) {
                foreach (['max_quantity', 'max_labor_allocation_per_unit'] as $key)
                    if (!is_int($row[$key] ?? null) || $row[$key] < 0) throw new \InvalidArgumentException("Invalid bid: $key");
                if ($row['max_labor_allocation_per_unit'] > 2147483647) throw new \InvalidArgumentException('Bid labor exceeds limit.');
            }
        }
        return $plan;
    }
}

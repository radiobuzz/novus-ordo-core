<?php
/** @ai-name My first bot */
// Rename this file to your own stable lowercase-hyphenated identifier.
return new class {
    public function decide(array $view, array $memory, array $settings, callable $tools): array {
        $plan = $tools->emptyPlan('Holding position while saving resources.');
        $plan['memory'] = $memory;
        $plan['memory']['turns_seen'] = ($memory['turns_seen'] ?? 0) + 1;
        // Reply once to the newest incoming message that this script has not seen before.
        $lastMessageId = (int) ($memory['last_message_id'] ?? 0);
        $replyTo = null;
        foreach ($view['diplomacy']['messages'] ?? [] as $message) {
            if ($message['id'] <= $lastMessageId) continue;
            $plan['memory']['last_message_id'] = max((int) ($plan['memory']['last_message_id'] ?? 0), $message['id']);
            $replyTo = $message['sender_nation_id'] !== $view['nation_id'] ? $message['other_nation_id'] : null;
        }
        if ($replyTo) $plan['diplomacy'][] = [
            'action' => 'send_message',
            'nation_id' => $replyTo,
            'body' => 'Thank you for your message. We will consider it during our planning.',
        ];
        // This example intentionally makes no military/economic changes.
        // Fill bids/deployments/orders using references/api.md and the snapshot.
        // You may use $tools->forecast(...) to evaluate candidate production bids.
        return $plan;
    }
};

<?php
/** @ai-name Messenger fixture */
return new class {
    public function decide(array $view, array $memory, array $settings, callable $tools): array {
        $plan = $tools->emptyPlan('Sending one test message.');
        $plan['memory'] = $memory;
        if ($memory['sent'] ?? false) return $plan;
        $other = null;
        foreach ($view['public_nations'] as $nation) {
            if ($nation['nation_id'] !== $view['nation_id']) { $other = $nation['nation_id']; break; }
        }
        if ($other) {
            $plan['diplomacy'][] = ['action' => 'send_message', 'nation_id' => $other, 'body' => 'Message from fixture bot.'];
            $plan['memory']['sent'] = true;
        }
        return $plan;
    }
};

<?php

namespace App\ReadModels;

readonly class GuardOrderInfo {
    public function __construct(
        public int $division_id,
        public string $order_type,
        public bool $is_operating,
    ) {}
}

<?php

namespace App\ReadModels;

readonly class NewsInfo {
    public function __construct(
        public string $content,
        public ?array $context,
    ) {}
}

<?php

namespace App\Support;

final readonly class VideoRoom
{
    public function __construct(
        public string $proveedor,
        public string $reunionId,
        public string $url,
    ) {
    }
}

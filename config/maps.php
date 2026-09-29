<?php

return [
    // Raise with measured PHP/browser memory and web-server request limits.
    'max_cells' => (int) env('MAP_MAX_CELLS', 50000),
];

import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/app.js',
                'resources/js/client/main.js',
                'resources/js/client/entry.js',
                'resources/js/client/map-generation.js',
                'resources/js/client/ui-foundations.js',
                'resources/js/client/admin.js',
                'resources/js/map-lab/main.js',
                'resources/js/portrait-lab/main.js',
                'resources/js/identity-lab/main.js',
            ],
            refresh: true,
        }),
        tailwindcss(),
    ],
    // Keep older hashed chunks usable by already-open legacy/client tabs.
    build: { emptyOutDir: false },
});

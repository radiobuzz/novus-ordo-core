<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="dark">
    <link rel="icon" type="image/svg+xml" href="{{ asset('res/bundled/novus-icon.svg') }}">
    <title>Novus Ordo · World</title>
    @vite('resources/js/client/main.js')
</head>
<body class="no-client">
    <div id="client-root"><p class="boot-message">Opening the world…</p></div>
    <script id="client-boot" type="application/json">{!! json_encode($boot, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) !!}</script>
    <noscript>Novus Ordo needs JavaScript.</noscript>
</body>
</html>

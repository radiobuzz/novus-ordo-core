<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>Novus Ordo · Map beta</title>
    @vite('resources/js/client/map-generation.js')
</head>
<body class="map-generation-page">
    <main id="map-generation-root"><p>Preparing the world generator…</p></main>
    <script id="map-generation-boot" type="application/json">{!! json_encode($boot, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) !!}</script>
    <noscript>The map generator needs JavaScript.</noscript>
</body>
</html>

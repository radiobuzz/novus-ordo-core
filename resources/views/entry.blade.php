<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="color-scheme" content="dark">
    <title>Novus Ordo</title>
    @vite('resources/js/client/entry.js')
</head>
<body class="no-entry">
    <div id="entry-root"></div>
    <script id="entry-boot" type="application/json">{!! json_encode($boot, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) !!}</script>
    <noscript>Novus Ordo needs JavaScript. / Novus Ordo nécessite JavaScript.</noscript>
</body>
</html>

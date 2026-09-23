<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Novus Ordo · Administration</title>
    @vite('resources/js/client/admin.js')
</head>
<body class="no-admin">
    <main id="admin-root"></main>
    <script id="admin-boot" type="application/json">{!! json_encode($boot, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) !!}</script>
    <noscript>The administration workspace needs JavaScript.</noscript>
</body>
</html>

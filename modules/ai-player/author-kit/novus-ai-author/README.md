# Novus Ordo AI author kit

You can write a new player without the game source, Laravel, Composer, a database or an API subscription. The deliverable is one PHP file. This kit is experimental and intended to be replaceable.

## Start with your coding assistant

Give your assistant this folder (or the documentation, starter and one snapshot if attachments are limited). Paste:

> Use SKILL.md and references/api.md to help me create a Novus Ordo AI player. Start from scripts/my-first-bot.php. Keep the result in one PHP file, compatible with the documented interface. Ask what strategy I want, then implement it. Use the example snapshots to check decisions. Do not invent missing game functions or claim that tests ran if you cannot execute PHP.

SKILL.md is readable instruction text as well as a skill for compatible coding environments. It does not require a particular assistant or special plugin. If your assistant cannot execute PHP, test locally or send the file to the game owner for Preview.

## Local check

Install PHP 8.3 or later, open a terminal in this extracted folder, and run:

```sh
php -l scripts/my-first-bot.php
php runtime/run.php scripts/my-first-bot.php snapshots/opening.json
php runtime/run.php scripts/experimental-v1.php snapshots/opening.json
```

The last command exercises the real existing strategy. Repeat with the other snapshots. Output is JSON; errors go to stderr and exit with code 1. No server or credentials are needed for these examples. The standalone runner has no wall-clock watchdog: interrupt a hung script locally. The game enforces a 20-second decision limit.

Copy the starter to a filename such as `continental-defender.php` and edit its `@ai-name` label. Keep all your strategy helpers inside the anonymous class. Send only that file back to the game owner.

## Installation in the game

The owner copies the file into `modules/ai-player/scripts/`, refreshes Administration and selects it in the AI Player panel. Use **Change AI script** for an existing bot or **Assign AI control** for a manual nation. Existing games default to Experimental V1. A Ready nation's selection takes effect next turn.

The panel also downloads fresh player snapshots, including the selected nation's private data and script notes. Share snapshots deliberately. This archive includes only synthetic test-game snapshots; it contains no real accounts, passwords, provider keys or live player history.

The game validates and commits a complete plan. A failed custom script gets one Experimental V1 fallback for that turn. The custom script remains selected for the next turn. If V1 also fails, the game pauses. Each script has separate notes; switching back restores its notebook. Releasing the controller to manual control deletes that assignment and its notebooks.

## Limits

Snapshots are fixed positions. The runner checks JSON/action structure and uses the actual production forecast, but does not reproduce authoritative ownership validation, movement, battles, turn resolution or opponent reactions. Final testing happens in the game. No LLM integration is bundled.

The available gameplay interface is documented in references/api.md. It does not expose account administration, cosmetics, arbitrary historical queries or a remote game API. Scripts run as trusted local code.

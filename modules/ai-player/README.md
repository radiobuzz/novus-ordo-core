# Passive automated players

Temporary pass-only participants used while the strategic AI is retired during the resource-system rebuild.

Each automated nation participates in readiness and turn completion but makes no policy, production, deployment, movement, attack or diplomacy decisions. The ordinary seasonal simulation still runs for its nation after all participants are ready.

The retained surface is intentionally small:

- `Setup.php` creates ordinary nations and records which are passive.
- `Runner.php` marks exactly one passive nation ready under the shared game lock and records completion once.
- `app/Integrations/AIPlayers/GameAdapter.php` handles readiness gates, pause/resume, assignment/release and rollback context.
- `app:ai-play GAME_ID --turns=N` is a bounded local driver; it never readies a human.

There is no strategy loader, custom script execution, observation payload, forecast, memory, preview or author kit. Administration states this temporary behavior explicitly.

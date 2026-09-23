# ADR 0018 — Selectable local AI scripts and an author kit

Status: Accepted and implemented (2026-09-22)

## Decision

The user extended the disposable AI experiment to support trusted, single-file PHP decision makers written by friends without the application source. This supersedes ADR 0015's initial single-strategy scope, not its removal requirement.

- Discover files in `modules/ai-player/scripts/` without executing them. The filename is the stable script identifier; Administration selects one per nation. V1 remains the default. No provider registry, remote transport, model integration or background daemon.
- Pass a serializable player observation, script-specific notebook, settings and local read-only helpers. Reuse the HTTP client's owner workspace exporter and authoritative command services. Scripts return one shared action plan; they never need Laravel or direct game mutations. Strategy-specific tools, summaries and optional provider calls belong in the script.
- Run decisions in a bounded PHP child process, outside game mutation locks. This contains hangs and fatal errors, but is **not a security sandbox** for untrusted code. Keep a per-nation decision lease to avoid duplicate concurrent decisions.
- Try V1 once if the selected script crashes, times out or returns an invalid/illegal plan. Roll back all candidate actions before fallback. Retain the selection and separate notebooks; do not retry stale contexts. If V1 fails, preserve the existing pause/recovery behavior.
- Preserve orders/readiness when switching scripts, rotate the existing generation fence, and apply the selection to the next uncommitted decision. Store the identifier in one additive assignment column and notebooks in the existing JSON memory field. Release deletes the assignment/notebooks, not the nation.
- Provide an admin snapshot download and a standalone author kit: skill, contract, starter, actual V1, synthetic snapshots, structural validator and exact production forecast helpers. Preview/offline checks do not prove game legality or strategic viability. No live data or credentials are bundled.

## Consequences and limits

The supported interface covers current player gameplay information, public map/nations, participant battle logs for a bounded 20-turn window, production forecasting and economy/military plans. It is not the complete account/admin/cosmetics API or arbitrary historical access. No LLM-specific configuration or cost controls are added. Preview may incur a cost if a future script itself calls a provider.

Administration's existing AI-enabled-game scope and ten-controller limit remain. An open participating client (including an account whose nation is AI-controlled) can drive sequential decisions. Human Auto-ready remains independent. The experiment and wiring remain removable using the [module inventory](../../../modules/ai-player/README.md#complete-removal-inventory).

## Verification

Isolated database checks cover discovery, timeout/structural errors, fallback after rollback, separate notebooks, stale selection and turn rollback. A real admin browser journey covers selection/cancel, preserved readiness, snapshot/kit downloads, release/reassign and fallback reporting. The extracted kit runs without the application autoloader. Long-match strategy balance remains playtesting.

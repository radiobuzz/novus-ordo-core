# Novus Ordo client planning

Living plans and architectural decisions for the new game client.

Start here when resuming work. This folder records accepted decisions, implementation evidence, and remaining work.

## Current position

As of 2026-09-23, [all five multi-game and retirement stages](multi-game-plan.md) are delivered: independent active games, explicit request/game context, scoped turns/AI, disposable selected-game instances, Games/Administration/Tools navigation, accepted gameplay additions and final legacy-interface removal. `/` and retired screen bookmarks now enter the new client. The follow-up header uses icon workspace navigation with Games in its menu; compact unit stacks and a mobile destination-picking state reduce command-panel obstruction. Nation colours are selected during nation creation rather than edited from a gameplay setting. [ADR 0017](decisions/0017-multiple-active-games.md) supersedes the earlier single-current-game/replacement assumption.

`/client` is the default playable interface, with generated-map beta support and the map-first military UI. See [the gameplay handoff](gameplay-experiment.md), [game UI pass 1](game-ui-pass-1.md) and [map beta notes](../game-design/map-beta.md) for delivered scope, tests and limits. Earlier phase documents describe their original authorization, not the current delivery status; any fallback references in those historical records are superseded by the retirement plan.

Start with the [phase 1–2 handoff](phase-1-2-handoff.md) for how to use/build/test it and the [integration contracts](integration-contracts.md) for verified data shapes. Real-phone and cross-browser verification remain open.

The direction is a plain-JavaScript client inspired by Sproutflix Core's instances, hosts, components, lifecycle, traits, ownership, and state. We will not import Core wholesale. Laravel remains the authoritative game backend.

Current review focus: [shared game data and persistent views](live-data-plan.md). The shared-data/World implementation and subsequent dedicated-player-panel/inspector persistence pass are delivered; the durable backend turn-context revision remains open. Shared `?` help and compact error details reduce permanent explanatory text. The experimental administration replacement remains at `/client/admin`, including original-admin capabilities and the integrated saved-map workspace; see [the admin handoff](admin-experiment.md). The [living foundation catalog](ui-foundations.md) records shared components and deferred contracts; preview them at `/dev-panel/ui-foundations`. Entry/login/nation creation remain at `/client/entry`; see the [entry handoff](entry-experience-handoff.md).

World rankings in Reports now use current bar charts plus a lazy History tab derived from retained turn snapshots. History preserves public approximation, gaps for not-yet-existing nations and an exact table alternative; no historical backfill or chart dependency was required.

## Documents

| Document | Purpose | Status |
| --- | --- | --- |
| [Decision 0016](decisions/0016-geographic-feature-atlas.md) | One overlapping geographic-feature registry, separate from terrain and politics | Accepted; Map Lab prototype |
| [AI Player V1 plan](../game-design/ai-nations-plan.md) | Temporary V1Experimental, viable economy/combat, sequential turns and watching options | Implemented; experimental; complete future removal required |
| [AI Player handoff](../../modules/ai-player/README.md) | Script selection, author kit, setup, watching, verification and removal inventory | Current implementation evidence |
| [Local AI script decision](decisions/0018-local-ai-scripts.md) | Single-file strategies, shared player operations, notebooks and V1 fallback | Accepted and implemented |
| [Decision 0015](decisions/0015-ai-player-boundary.md) | Disposable local AI implementation and a small game adapter; future API direction | Accepted and implemented |
| [National production planner](decisions/0014-national-production-planner.md) | Centred compact planner, joint territorial forecast and atomic batch save | Implemented; experimental; economic map deferred |
| [Game UI pass 4](game-ui-pass-4.md) | Nation colours/borders/markings, icons, optional sound and map-side existing production | Implemented; experimental |
| [Game UI pass 3](game-ui-pass-3.md) | Zoom-aware units, rectangle selection, right-drag pan, recolourable sprites and deployment ghosts | Implemented; experimental |
| [Game UI pass 2](game-ui-pass-2.md) | Compact status header, resource breakdowns, turn briefing, menu and collapsible minimap | Implemented; experimental |
| [Shared game data plan](live-data-plan.md) | Observable stores, coordinated reads, persistent views, command safety and staged migration | World and player-panel persistence delivered; backend checkpoint open |
| [Game UI pass 1](game-ui-pass-1.md) | Map-first modes, minimap, contextual controls and existing military workflows | First military slice implemented and tested; experimental |
| [Portrait laboratory](../game-design/portrait-lab.md) | Modular painted portraits, separate pools, landmark fitting, comparison, stable definitions and provisional asset-authoring instructions | Local-only fitted proof of concept at `/dev-panel/portrait-lab` |
| [Identity Lab — Flag Editor](../game-design/identity-lab.md) | Independent randomizers, colour harmonies, layered 3:2 flags, symbols, editable JSON and flattened PNG | Implemented experimental Lab; two future tabs disabled; no gameplay integration |
| [Identity Lab implementation plan](../game-design/identity-lab-plan.md) | Original staged flag-only acceptance scope and passed visual proof | Implemented; retained planning record |
| [Deferred emblem and coat of arms research](../game-design/identity-lab-heraldry-research.md) | Armoria/Heraldicon references, artwork and font sources, traditional/modern templates and future composition notes | Retained research; both editors deferred and disabled |
| [Administration experiment](admin-experiment.md) | Original capability checklist, game scope, saved maps, access, deployment and verification | F2 implemented; experimental |
| [UI foundations](ui-foundations.md) | Extraction path, token model, component inventory, usage, custom-component criteria and deferred controls | F1/F2 implemented; further controls as needed |
| [Game UI skill](../../skills/novus-game-ui/SKILL.md) | Project-specific reuse and maintenance guidance for UI tasks | Created; maintained alongside this plan |
| [Client data skill](../../skills/novus-client-data/SKILL.md) | Shared-data ownership, safe refresh/commands and evidence-based evolution | Created; current APIs and migration status remain in the live-data plan |
| [Gameplay experiment](gameplay-experiment.md) | Current gameplay port, isolated verification and remaining limits | Experimental implementation delivered |
| [Technical baseline](technical-baseline.md) | Accepted boundaries, V1 defaults, and deferred choices | Accepted for phases 1–2 |
| [Implementation plan](implementation-plan.md) | Phases, deliverables, safety limits, and acceptance gates | Read-only slice implemented; later phases pending |
| [Entry-experience proposal](entry-experience-proposal.md) | Reuse inventory, ownership, login/wizard integration, EN/FR and staged acceptance | Accepted; initial implementation delivered |
| [Entry handoff](entry-experience-handoff.md) | Try the new entry, contracts, checks and remaining polish | Current implementation evidence |
| [Phase 1–2 handoff](phase-1-2-handoff.md) | Usage, tests, backup/release notes and known limits | Current implementation evidence |
| [Integration contracts](integration-contracts.md) | First-slice read contracts and narrow backend changes | Verified |
| [Current-game parity](current-game-parity.md) | Feature entry points and remaining integration gaps | Main loop ported experimentally; documented gaps remain |
| [Pre-plan](pre-plan.md) | Original scope/aspect inventory | Historical planning input; baseline takes precedence |
| [Decision 0001](decisions/0001-scope-and-principles.md) | Confirmed scope and constraints | Accepted direction; not implementation approval |
| [Decision 0002](decisions/0002-feature-loading.md) | Native modules, Vite, and on-demand feature loading | Accepted; implemented |
| [Decision 0003](decisions/0003-map-and-adaptive-shell.md) | Map concepts, adaptive shell, dark mode, SCSS, and dedicated views | Accepted direction; detailed design proposed |
| [Decision 0004](decisions/0004-ui-api-separation.md) | Generated API preservation with clean presentation/service/transport boundaries | Accepted direction |
| [Decision 0005](decisions/0005-entry-experience.md) | Shared entry shell, wizard processes, audio and localization | Accepted; initial implementation delivered |
| [Decision 0006](decisions/0006-game-ui-foundations.md) | Shared game UI vocabulary and evidence-based extraction | Accepted direction; APIs/sequence remain revisable |
| [Decision 0007](decisions/0007-administration-experiment.md) | Explicit game scope, original-admin parity, independent saved maps and existing-access boundary | Accepted; experimental implementation |
| [Decision 0008](decisions/0008-portrait-fitting.md) | Separate portrait pools, landmark/collar fitting and explicit legacy conversion | Accepted; first lab implementation |
| [Decision 0009](decisions/0009-map-first-gameplay.md) | Map-first modes, direct unit selection and contextual commands | Accepted; first military slice implemented |
| [Decision 0010](decisions/0010-shared-game-data.md) | Shared confirmed data, service ownership and refresh independent of view lifetime | Accepted; first World slice implemented |
| [Decision 0011](decisions/0011-compact-game-hud.md) | Compact gameplay status and once-per-turn briefing | Accepted; experimental implementation |
| [Decision 0013](decisions/0013-nation-identity-feedback.md) | Persistent national identity, optional local feedback and unchanged production rules | Accepted; experimental implementation |
| [Decision 0019](decisions/0019-experimental-flag-editor.md) | Isolated Flag Editor, resolved recipes/PNG pairs and algorithmic colour harmonies | Accepted; experimental implementation |
| [Progress journal](progress.md) | Work actually completed and the next discussion | Current |

## Maintenance rules

Related game-design evidence: [Historical Novus Ordo feature inventory (2010 backup)](../game-design/historical-novus-ordo-2010-features.md). It documents the old game's mechanics, especially nation economics; it is not an accepted V1 feature list.

1. Read this index and the progress journal before continuing architecture work.
2. Put stable constraints and tradeoffs in numbered decision records. Each record needs a status, date, context, decision/proposal, consequences, and alternatives where relevant.
3. Use `Proposed`, `Accepted`, `Rejected`, or `Superseded` for decisions. Do not turn an assistant recommendation into an accepted decision without agreement.
4. Keep the pre-plan editable. When implementation is approved, add narrowly scoped phase plans with deliverables, dependencies, acceptance checks, and exclusions. Do not convert this inventory into a promise to build every subsystem immediately.
5. If an accepted decision changes, add a new record and mark the old one superseded with a link. Preserve the original reasoning.
6. After meaningful work, update the journal with the date, changed artifacts, checks performed, unresolved questions, and next step. Distinguish planned, implemented, and verified.
7. Put durable conclusions here rather than relying on chat history. Record uncertainties and evidence, not just conclusions.
8. Keep credentials, tokens, private game data, and environment secrets out of these documents. Keep the folder with the project source and include it in normal source-control/backups when available; creating it does not itself establish a backup.

## Next discussion

Playtest World rankings in Reports: compare the five Current bar charts, switch History indices, filter nations and inspect exact turn values. The history endpoint is intentionally lazy and currently returns the complete confirmed timeline; the active 502-turn game remains within the measured first-pass envelope. Range/downsampling should follow evidence rather than be added speculatively.

Playtest [unit control](game-ui-pass-3.md): zoom-aware miniatures/flat counters, local material palettes, right-drag panning, rectangle selection and mixed deployment previews. [ADR 0012](decisions/0012-unit-control.md) records the accepted experimental direction. These do not change territory-based rules or complete the remaining shared-data backend checkpoints.

Playtest [the compact HUD and turn briefing](game-ui-pass-2.md): module/settings navigation now lives in the hamburger menu, resources open exact breakdowns, Ready is one click, and News reopens the current bulletin. The minimap can collapse without changing the main camera. This does not replace the remaining shared-data checkpoints below.

Review the delivered [persistent player panels](live-data-plan.md) and shared contextual help. Player workspaces and inspectors now update within their instances; routine polling retains command availability. The durable turn-context backend proposal and remaining D4 verification remain open. Administration/map preparation tools remain available. Default-client cutover, production permissions and new game mechanics remain separate decisions.

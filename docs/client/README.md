# Novus Ordo client planning

## Playable civilian economy — 2026-10-01

The authorized [civilian integration](../game-design/civilian-economy-live-integration.md) extends the existing transactional resolver and fresh-game catalogue. Budget & Policies now shows civilian needs, worker use, upkeep and optional accounting details through the existing shared owner snapshot and retained tables. Twenty real turns, replay and EN/FR Chromium checks pass. This does not select the indicator-led replacement discussed below.

## Economy alternatives — decision open (2026-09-30)

The [indicator-led alternative](../game-design/indicator-economy-alternative.md) preserves the revised design as a possibility, including ten territorial indicators, public/private development and conditional packages I1–I4. The user has not decided to replace the current economy; improving the existing system remains an option. The live production system below remains the working baseline. Do not start the alternative's replacement, retirement or migrations without a subsequent decision. UI design is deferred to the user's later brief; the earlier sketch is not an accepted layout.

## Production cleanup — Package F (2026-09-29)

The superseded economic calculators, bid/facility models and placeholder effects are retired. Generic acquisitions, funded production, owned stocks and the Package E UI remain the active path. Useful catalogue/policy/accounting checks now target that path; passive seasons and rollback remain covered. No application database changes or Git publication. See [results and rollout](../game-design/production-retirement-results.md).

2026-09-29: **Production/development Packages A–D are implemented.** Fresh games now use the coordinated economy for founding, turns, opening-owned actions, grants and shared previews. Policies and acquisitions save as one seasonal package. [Runtime contract and verification](../game-design/production-lifecycle-contract.md); fuller player presentation and retirement work remain Packages E–F. No additional migration beyond Package B.

Living plans and architectural decisions for the new game client.

Start here when resuming work. This folder records accepted decisions, implementation evidence, and remaining work.

## Current position

2026-09-29: [production accounting Package A](../game-design/production-accounting-contract.md) is implemented as pure PHP settlement primitives and fixtures, with 264 checks including four consecutive household seasons and replay. Public/private ownership, funded exchange, explicit nutrition support, shared labor, inventory cost, delayed investment and debt/capture accounting have executable contracts. No live economic resolver, schema or UI changed. [Package B](../game-design/production-state-contract.md) now adds configuration and seasonal persistence; [Package C](../game-design/production-resolver-contract.md) implements the pure coordinated resolver; Package D connects live turns and workspace data.

2026-09-29 planning: [generic production, ownership and development](../game-design/production-development-implementation-plan.md) turns the reviewed resource UI sketch into ordered accounting, catalogue/state, shared resolver, lifecycle, UI and retirement packages. It requires all produced resources to use one configured pipeline while currency/capacity keep distinct semantics. Pricing, household funding, ownership transfers and military acquisition timing are explicitly identified contract decisions. Documentation only; no economic cutover or live reset has occurred.

2026-09-29: [admin maintenance and logout](admin-maintenance.md) are delivered. Overview offers confirmed world reset and orphan status-file cleanup; the header includes Sign out, and the logout 500 is fixed.

2026-09-29: [agriculture and food security are delivered](../game-design/agriculture-and-food-security-first-pass.md) for fresh games: three policies, developed agricultural capacity, automatic food reserves, consumption-based shortage consequences and existing-screen forecasts. No migration required; balance remains provisional.

2026-09-29: [game map layer integration is delivered](map-layer-integration-results.md). World and Homeland share the compact bottom dock, honest data-backed layers, independent display controls and domain palettes. The old World header menu is retired. No new simulation, old-save conversion or live-game reset.

2026-09-28 planning: [game map layer integration](map-layer-integration-plan.md) audits the existing geographic, economic and military payloads and defines the World/Homeland cutover. Only data-backed layers are included; synthetic lab values and future simulation layers are excluded. The plan records territorial versus microcell precision, Food/agricultural-potential naming, contextual resource filtering, the density field mismatch, ordered work packages and verification. Documentation only; production integration has not started.

2026-09-28 UI experiment: the [map layer menu prototype and complete layer catalogue](map-layer-menu-experiment.md) are available at `/dev-panel/ui-foundations#map-layers`. Seven bottom-dock categories expose 33 views with a persistent legend and independent annotations. Geography is generated; economic/military examples are explicitly synthetic. Focused checks pass; production adoption awaits review.

2026-09-28 planning: [persistent microcell geography and the updated map workspace](../game-design/map-v2-implementation-plan.md) now have an ordered implementation plan and [ADR 0032](decisions/0032-persistent-microcell-world.md). Configurable region dimensions, 7/19/37 resolution, complete saved geography, named features, coastal data and selectable resource profiles are the target. The final rollout discards previous games and saved maps; no reset or implementation was performed in this planning step. This supersedes saved-map preservation for that future rollout and incorporates the outstanding resource Package C release journey.

2026-09-28 resource foundation: [Packages A and B are implemented](../game-design/resource-system-first-pass.md) with game-owned catalogue tables, exact quantities, shared server allocation/preview, current unit costs, grants, Guard and dynamic client controls. The retired enum runtime and strategic AI were removed; automated nations now only submit Ready while ordinary simulation continues. The breaking schema and forward strategic-field cleanup are installed in development after disposable games were removed, while accounts and saved maps were preserved. Rolled-back creation checks passed for all four saved maps with a passive player. [Package C's](../game-design/resource-system-implementation-handoff.md#c-fresh-game-release-and-review) final browser journey and release review remain.

2026-09-28: [Budget & Policies and the first seasonal economy](decisions/0031-seasonal-economy-workspace.md) are implemented for new games. Taxes, infrastructure, informal activity, local reinvestment, debt/default and underfunded-unit desertion now resolve through policies. The player workspace offers editable pending choices, approximate forecasts and national indicators; existing non-money production remains available. Start a fresh game; old-save compatibility is outside this pass. See [rules and verification](../game-design/seasonal-economy-first-playable.md).

2026-09-27: [ADR 0030](decisions/0030-generated-world-only-runtime.md) makes generated geography and the current client the sole 7.1 runtime. Classic game creation, rectangular/raster rendering, implicit single-game selection, retired screen redirects and preserved Vite chunks are removed. The `v7.0.0` tag plus a compatible database backup remains the Version 7 recovery path.

2026-09-26: the [Map Lab scale checkpoint study](decisions/0029-map-lab-development-scale.md) adds fixed-camera Current / Half / Quarter comparisons, separate structure-size/spacing controls and editable synthetic microcell allowance/intensity. The previous artwork remains restorable; projected clearing and parcels stay coordinated. This is lab-only visual evaluation, not real population or production.

2026-09-26: the [Map Lab development art pass](decisions/0028-map-lab-development-art.md) adds transparent painted structures/quarries, resource-constrained compounds and independent Town / City / Metropolis intensity previews. Existing geography, Terrain V2 and other experiments remain independent; no production economics or live-game renderer changes.

2026-09-26: the [Map Lab integrated-landscape study](decisions/0027-map-lab-integrated-landscape.md) makes Terrain V2 the lab baseline and couples development's visible ground/forest clearing. A focused riverside settlement/farmland scene uses the existing preview controls; no live-game renderer, generator or economic rule is changed.

2026-09-26: optional [primitive Guard orders](decisions/0025-guard-orders.md) are implemented. Existing games opt in through `games.guard_enabled`; new games enable the rule. Guard reserves one-quarter operation cost while waiting and tops up to the full cost before responding, preallocates one response per unit across all attacks before randomized sequential combat, and requires a full Stand Down turn to release. Ground responders persist at the defended territory; aircraft return to base after combat. Multi-turn queued orders remain deferred.

2026-09-25: [military order overhead](decisions/0024-order-submission-performance.md) is reduced through grouped validation/exports, shared preview routes and fewer client round trips. Existing combat behavior and server context checks remain. Main regression/HTTP checks passed; an extended disband HTTP check is pending because the approval reviewer failed authentication. Guard was implemented separately in ADR 0025; queued orders remain deferred.

2026-09-25: the news section now offers one button for a world [ownership comparison](decisions/0023-news-ownership-comparison.md) from the briefing and Reports. All previous/current ownership changes fade together in an independent map dialog fitted to the world with manual controls and reduced-motion support. It uses retained public snapshots and needs no migration. Full turn-by-turn map history remains a separate feature.

2026-09-26: [primitive diplomacy](../game-design/primitive-diplomacy-plan.md) now lets custom AI scripts read a bounded private conversation history and send text replies during their normal decision turn. Peace support remains; AI alliances and grants remain unavailable. [ADR 0020](decisions/0020-primitive-diplomacy.md) records the boundary.

As of 2026-09-27, [all five multi-game and retirement stages](multi-game-plan.md) are delivered: independent active games, explicit request/game context, scoped turns/AI, disposable selected-game instances, Games/Administration/Tools navigation, accepted gameplay additions and final legacy-interface removal. Retired screen URLs are absent; only `/` and `/login` retain canonical entry redirects. The follow-up header uses icon workspace navigation with Games in its menu; compact unit stacks and a mobile destination-picking state reduce command-panel obstruction. Nation colours are selected during nation creation rather than edited from a gameplay setting. [ADR 0017](decisions/0017-multiple-active-games.md) supersedes the earlier single-current-game/replacement assumption, and [ADR 0030](decisions/0030-generated-world-only-runtime.md) removes its temporary compatibility paths.

`/client` is the playable interface, with generated geography and the map-first military UI. See [the gameplay handoff](gameplay-experiment.md), [game UI pass 1](game-ui-pass-1.md) and [generated-world notes](../game-design/map-beta.md) for delivered scope, tests and limits. Earlier phase documents describe their original authorization, not the current delivery status; classic-map and fallback references in those historical records are superseded by ADR 0030.

Start with the [phase 1–2 handoff](phase-1-2-handoff.md) for how to use/build/test it and the [integration contracts](integration-contracts.md) for verified data shapes. Real-phone and cross-browser verification remain open.

The direction is a plain-JavaScript client inspired by Sproutflix Core's instances, hosts, components, lifecycle, traits, ownership, and state. We will not import Core wholesale. Laravel remains the authoritative game backend.

Current review focus: [shared game data and persistent views](live-data-plan.md). The shared-data/World implementation and subsequent dedicated-player-panel/inspector persistence pass are delivered; the durable backend turn-context revision remains open. Shared `?` help and compact error details reduce permanent explanatory text. The experimental administration replacement remains at `/client/admin`, including original-admin capabilities and the integrated saved-map workspace; see [the admin handoff](admin-experiment.md). The [living foundation catalog](ui-foundations.md) records shared components and deferred contracts; preview them at `/dev-panel/ui-foundations`. Entry/login/nation creation remain at `/client/entry`; see the [entry handoff](entry-experience-handoff.md).

World rankings in Reports now use current bar charts plus a lazy History tab derived from retained turn snapshots. History preserves public approximation, gaps for not-yet-existing nations and an exact table alternative; no historical backfill or chart dependency was required.

## Documents

| Document | Purpose | Status |
| --- | --- | --- |
| [Decision 0030](decisions/0030-generated-world-only-runtime.md) | One generated-world runtime, explicit game identity and retired classic interface | Accepted and implemented for 7.1 |
| [Primitive Guard orders](decisions/0025-guard-orders.md) | Persistent reserve duty, threat preallocation and mandatory Stand Down | Implemented; migration/operator opt-in pending for existing games |
| [Nation flag editor](decisions/0021-nation-flag-editor.md) | Identity-step dialog, matched recipe/PNG drafts and transactional persistence | Implemented; flag-design migration still requires operator application |
| [Primitive diplomacy implementation plan](../game-design/primitive-diplomacy-plan.md) | Private conversations, bilateral treaties, stockpiled resource grants, limited AI peace and a separate flag-editor release item | Implemented for new games; isolated checks passed; running-database migration and release playtest pending |
| [Economy Lab](../game-design/economy-lab.md) | Browser-only copper market, delayed private investment, controlled on/off stories and visible accounts | Final experiment for this theme; rules provisional |
| [Decision 0016](decisions/0016-geographic-feature-atlas.md) | One overlapping geographic-feature registry, separate from terrain and politics | Accepted; Map Lab prototype |
| [AI Player V1 plan](../game-design/ai-nations-plan.md) | Historical strategic experiment and original removal requirement | Retired by resource Package B |
| [Passive-player boundary](../../modules/ai-player/README.md) | Pass-only setup, readiness, lifecycle and administration | Current implementation evidence |
| [Local AI script decision](decisions/0018-local-ai-scripts.md) | Historical single-file strategy decision | Retired by resource Package B |
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

Review the delivered [persistent player panels](live-data-plan.md) and shared contextual help. Player workspaces and inspectors now update within their instances; routine polling retains command availability. The durable turn-context backend proposal and remaining D4 verification remain open. Administration/map preparation tools remain available. Production permissions and new game mechanics remain separate decisions.

Production/development Package B: [definitions and seasonal state](../game-design/production-state-contract.md). Run `php8.3 tests/client/production-state.php` only through the guarded disposable MariaDB bootstrap (`NO7_ENTRY_TEST_ROOT`); it creates and deletes fixture games. Live economic cutover remains Packages C–F.

Production/development Package C: run `php8.3 tests/client/production-economy.php`, `php8.3 tests/client/production-accounting.php` and `php8.3 tests/client/peaceful-economy.php` without a database. [Contract and live-integration boundary](../game-design/production-resolver-contract.md).

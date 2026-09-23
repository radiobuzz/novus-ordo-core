# 0005 — Shared entry experience, wizard processes and localization

Status: Accepted

Date: 2026-09-19

## Context

The user supplied a background image and soundtrack, requested a cinematic login and nation wizard, and agreed to reusable components, explicit instances/processes and English/French strings. The user clarified that the soundtrack is only for initial loading/login, not nation creation or gameplay. After reading the proposal, the user explicitly accepted it and authorized implementation on 2026-09-19. The initial implementation is delivered; see the [handoff](../entry-experience-handoff.md).

Phases 1–2 already provide Instance, Component, Host, Scope, loader, saved-state, generated API and shared styling. Login and full nation creation still use legacy Blade forms. The current JSON nation flow lacks full form parity. Replacing these pages cosmetically would leave lifecycle, state and integration gaps unresolved.

## Decision

1. Preserve the existing runtime and source conventions. Components render; running instances own their state and cleanup; hosts present them; feature/app processes coordinate workflows without rendering or duplicating lifecycle infrastructure.
2. Add an opt-in `/client/entry` application with one persistent atmospheric shell and app-owned audio, localization, device preferences and session services. Playback eligibility belongs to the loading/login screens and ends on entering the wizard/game; remembered mute/volume are independent. Keep the existing authenticated game entry and legacy routes.
3. Compose nation creation from one owning feature/process and a reusable Wizard hosting identity, leadership, homeland and review steps. Store the draft and File references in memory above step lifetimes. Submit only at final review.
4. Extend the existing Laravel login/full-form operation with explicit JSON contracts and multipart support, preserving HTML callers. Verify consistency/recovery and full upload/identity parity before connecting the wizard to mutations.
5. Introduce central English/French tables, shared translation/formatting service and remembered locale/audio preferences. Include existing new-client UI text; leave legacy pages and player-authored content outside that translation migration.
6. Bring onboarding work forward as stages E0–E4, independently of military workflows or full client replacement. Detailed ownership, routes, contracts, acceptance and evidence are in the [entry proposal](../entry-experience-proposal.md).

## Consequences

The shell preserves background and preferences across login and wizard steps, and the same UI blocks can serve later features. The soundtrack ends at the login boundary. Small backend integration changes are necessary; the frontend alone cannot fix redirects, refreshed CSRF, upload parity or partial submission recovery. Existing instance/host teardown behavior remains authoritative, so draft ownership must live above disposable steps.

Plain JavaScript, native DOM, SCSS, current Laravel authority, explicit generation and legacy fallback remain accepted constraints. No new framework, universal workflow engine, historical game mechanics or default-interface cutover is proposed here.

This decision supersedes the baseline's timing for onboarding and practical localization: the onboarding portion of Phase 4 is brought forward and EN/FR tables are implemented now. A translation platform remains deferred. The phases 1–2 runtime/stack and separate-entry/legacy-fallback boundaries remain accepted and unchanged.

## Alternatives considered

- Restyle the two Blade pages independently: smaller first patch, but duplicates presentation and complicates consistent state, validation and language behavior across transitions.
- Use the existing two JSON nation endpoints unchanged: does not preserve full identity/leader/upload capabilities; inspection also found an incompatible finalization call signature.
- Rebuild the entire client as one application first: expands beyond entry/setup and delays the reusable slice.
- Add a general Process runtime or schema-driven form engine: no demonstrated requirement beyond two explicit workflows; existing Scope and Host are sufficient starting points.

## Evidence and verification status

The original proposal followed read-only source inspection. Subsequent implementation passed source/build checks, fixture browser regression, and isolated real HTTP/backend creation and rollback tests. See the [handoff](../entry-experience-handoff.md) for exact evidence and limits. The production game was not mutated for verification.

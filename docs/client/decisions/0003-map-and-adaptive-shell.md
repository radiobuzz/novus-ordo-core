# 0003 — Map-centered play, adaptive shell, and theme contracts

Status: Accepted direction; concrete layout and visual styling remain proposals

Date: 2026-09-18

## Context

The user endorsed the distinction between map layers, modes, and interaction tools, and clarified the shell vision. Product experience should guide the runtime contracts; the user is not expected to decide low-level technical details first.

## Confirmed direction

- The map is the central gameplay workspace, with natural pointer-centered zoom, panning, and centering as the intended V1 experience.
- Layers determine what is visible. Modes determine the activity and configure useful information/controls. Interaction tools determine the meaning of the next action within a mode.
- The map is a subsystem with separated responsibilities, not a single large component carrying all game behavior.
- The interface defaults to dark mode and should feel like a game interface, not Core's large Bootstrap dialogs.
- Use SCSS, consistent shared design tokens, and component-local styles that consume those tokens. Visual redesign should not require rewriting feature logic.
- The shell adapts to mobile. Layout/host components own sidebar, sheet, modal-panel, toolbar, and navigation adaptation; feature instances do not branch on a global mobile flag.
- Provide dedicated Nation, Economy, Diplomacy, and News views as well as World/map. Nation includes flag and leader choices, with other positions potentially later. Economy includes report-oriented presentation. Diplomacy includes alliance/war information. News is organized around turns.
- LLM-enriched news is a future intention, not a current implementation requirement. The user's description was unfinished; editorial details and behavior remain open.

## Proposed interpretation, not yet a binding implementation contract

- Keep global views (World/Nation/Economy/Diplomacy/News) separate from map modes (for example Overview/Military/Economy), and those separate from tools (for example Select/Move/Inspect).
- Keep one primary world-map session/camera state across views. A full-width report or nation view can replace the visible workspace without forcing the map to remain visible or continue rendering in the background. Exact suspension policy is undecided.
- A territory inspector is a side panel on desktop and an expandable bottom sheet on narrow screens. Preserve the same feature instance/state through layout changes where practical; do not reload its data merely because the viewport changed.
- Components may respond to available container space. They need not be ignorant of size, but should not decide application-wide device layout.
- Hosts supply title/action/close/focus chrome; contained features supply content and semantic actions. Modal behavior is reserved for tasks that actually require it, not every inspector.
- Swipe gestures have visible button/keyboard alternatives. A sheet gesture must not also pan the map. Reflow, focus, scrolling, virtual keyboard, and safe-area behavior need explicit design/testing.
- Prefer semantic theme tokens such as surface, text, border, accent, spacing, radius, elevation, and typography. Use SCSS for organization/mixins and propose CSS custom properties for theme values consumed by local styles. Exact token names/scales remain open.
- Map/canvas colors must use the same theme contract through an explicit palette adapter; changing stylesheet values alone does not repaint canvas pixels.
- If news is later enriched by an LLM, factual turn events remain authoritative. Generated prose should not invent game outcomes or reveal information outside the reader's permissions. Generation timing, review, and fallback remain future product decisions.

## Visual exploration

A generated desktop/mobile shell mockup was presented as a discussion image. It explores charcoal surfaces, restrained brass/teal accents, a dominant world map, a desktop inspector, and a mobile bottom sheet. Colors, fictional geography, numbers, text, and depicted mechanics are illustrative, not accepted specifications or evidence of implemented features.

## Consequences

This refines the initial desktop-first assumption: adaptive layout is part of the shell's design from the outset. Map-centered does not mean map-visible on every screen. No map engine, rendering library, detailed interaction contract, or production theme is selected here.

No application code or dependencies were changed. The native-module loader in decision 0002 remains proposed independently.

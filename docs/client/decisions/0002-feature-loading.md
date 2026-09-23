# 0002 — On-demand feature loading with native JavaScript modules

Status: Accepted

Date: 2026-09-18

Implementation status: Implemented for World and Territory in phases 1–2; accepted through the user's implementation authorization on 2026-09-18. The proposal text below preserves the reasoning; see the current handoff for evidence.

## Context

The old Core loaded everything. The new client should start with a small shell and load a feature when it is needed. The project already declares ES modules and configures Vite with Laravel integration. The user requires plain JavaScript, not TypeScript.

## Proposal

Use standard ES module imports inside a feature, native dynamic `import()` at selected feature boundaries, and the existing Vite toolchain for development/build output. Laravel would serve a separate client entry through its Vite integration. This requires a later, explicitly scoped Blade/entry integration change; none has been made.

Vite supports splitting asynchronously loaded code and its CSS. Laravel provides the entry/manifest integration. These mechanisms do not require a frontend framework or TypeScript. See [Vite features](https://vite.dev/guide/features.html#build-optimizations) and [Laravel 12 Vite integration](https://laravel.com/docs/12.x/vite).

The existing project declares Vite 7. Current upstream documentation can describe newer releases; verify exact build behavior against the lockfile/toolchain when implementing. This proposal does not require a toolchain upgrade or experimental bundler features.

### Three different responsibilities

1. **Module loader:** obtain a known feature's code and validate its exported factory/constructor contract.
2. **Instance factory:** create a fresh feature instance with inputs, services, and a lifecycle scope.
3. **Host:** mount that instance, present its state, handle replacement/close, and dispose it.

Loading code must not automatically open a screen, fetch private data, start timers, or create a singleton instance. Feature modules should avoid such top-level side effects.

### Explicit feature registry

Illustrative plain JavaScript, not implemented files:

```js
export const featureRegistry = new Map([
    ['territory.details', {
        load: () => import('../features/territory/details.feature.js'),
    }],
    ['military.deployment', {
        load: () => import('../features/military/deployment.feature.js'),
    }],
]);
```

Each entry uses a literal import path, so dependencies can be analyzed during the build. Routes/actions request a known feature ID, never an arbitrary script URL or user-provided class name. Metadata such as labels and suggested host can remain lightweight and separate from feature implementations.

Start explicit. If the registry later becomes repetitive, review build-time discovery of a tightly scoped set of feature descriptors; do not eagerly import all feature modules merely to discover their metadata.

### Loading policy

| Boundary | Proposed behavior |
| --- | --- |
| Shell, essential runtime, basic error/loading controls | Startup dependencies |
| Initial workspace/map | Requested immediately when needed for the first screen; lazy syntax does not make first-screen code optional |
| Inspectors, editors, reports | Import on first use |
| Components used within a feature | Normal imports within that feature; avoid one network boundary for each small widget |
| Large optional tabs/rendering engines | Additional lazy boundary only if usage/size measurements justify it |
| Shared dependencies | Let the build handle shared code initially; inspect output before manual chunk tuning |
| Forum | Add a lazy registry entry when implementation exists, not a broken placeholder import now |

A small feature loader may memoize in-flight requests and normalized feature definitions. It must not cache live instances as if they were modules. Two hosts can request the same code and receive separate instances.

Automatic prefetch of the entire feature graph is excluded. Any later intent/idle prefetch must be bounded and measured, or it defeats the loading policy.

### Loading, replacement, and failure behavior

- Hosts own visible loading, retry, and failure presentation. Define whether replacement keeps the previous body visible until the new one is ready.
- Reject unknown feature IDs and invalid feature exports with useful diagnostics.
- Use per-host generation/operation tokens so a late import or initialization cannot replace a newer selection. Do not construct an instance if its request is already obsolete; dispose one that becomes obsolete during initialization.
- Native `import()` has no AbortSignal cancellation interface. Abandoning the UI request does not imply the module download stops. Abort instance-owned data requests separately.
- Keep import failure, initialization failure, permission/session failure, and data failure distinct. A code-load retry must never replay a submitted command.
- A rejected loader-level promise should not permanently poison the registry. However, clearing that promise is not a guarantee that the browser retries every module failure: module evaluation failures may remain cached. Avoid retry loops and use a controlled reload when appropriate. Native module caching and evaluation behavior are documented in [MDN import()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import).
- Destroying an instance releases its resources, not its imported JavaScript module. Do not promise code unloading or append random query strings to force repeated module evaluation.

### CSS, assets, and deployment

Keep shared tokens/base styles with the shell and feature styles with their feature entry. Namespace styles so both clients and multiple loaded features can coexist. Once loaded, do not assume feature CSS disappears when an instance closes.

Map geometry, images, and API data need their own loading/cache policies; code splitting alone does not control their size or lifetime.

Production release planning must cover hashed assets, entry HTML caching, and long-lived tabs requesting older chunks after a deployment. Prefer coherent releases with previous assets retained for an agreed grace period; on unrecoverable version mismatch offer a guarded reload that respects unsaved work. Vite documents this failure class in [its production build guide](https://vite.dev/guide/build.html#load-error-handling).

Do not include private data or secrets in feature bundles. Loader allowlisting is a code-organization boundary, not server authorization.

## Alternatives considered

- **Load every feature at startup:** simple, but repeats the behavior the user wants to change.
- **Hand-written script injection, globals, and class-name lookup:** introduces a separate dependency/load-order system; not recommended.
- **Browser-native modules without a build:** possible with suitable URLs and assets, but production dependency handling/versioning would need additional decisions while Vite is already present.
- **Feature registry plus native imports/Vite:** recommended balance of explicit code organization and on-demand delivery.

## Acceptance checks for a later implementation

1. A production build boots the new shell without loading unopened editor/report/forum code.
2. First feature use loads its necessary code/styles; repeat use does not trigger a duplicate instance or unnecessary module fetch.
3. Two simultaneous consumers can share code while owning independent instances.
4. Rapid selection changes, close-during-load, and failed initialization leave no stale mount or leaked resources.
5. Failed code loading has a usable recovery path; mutations are not retried implicitly.
6. A stale tab after deployment either still obtains its chunks or presents a safe update/reload path.
7. The legacy interface remains available and unaffected by the new entry.

## Consequences

There will still be multiple source files, but source-file count is not the same as startup request count or production chunk count. We design feature boundaries; the build determines the concrete output graph. The loader stays a small adapter around standard modules, not a new package-management framework.

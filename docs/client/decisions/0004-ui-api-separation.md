# 0004 — Separate presentation, game services, generated API, and transport

Status: Accepted direction

Date: 2026-09-18

Implementation status: Separate generated ESM definitions, injected fetch transport and WorldService implemented in phases 1–2. Legacy output preserved. See the phase handoff for tests and limitations.

## Context and agreement

The user explicitly requested good separation between UI and backend and accepted the assessment of the current generated JavaScript client. Keep the generated endpoint knowledge; improve the client rather than adopt its current jQuery coupling unchanged.

The current generator derives methods from named GET/POST routes and produces documentation from annotations. A companion generator exposes game enums, constants, and metadata. The inspected generated asset has 31 endpoint methods. It passes JavaScript syntax checking. Isolated, mocked-transport checks confirmed representative URL construction, caller-payload mutation by POST, and direct return of the transport object. Those checks sent no game requests and were not an endpoint integration test.

## Decision

Dependency direction:

```text
Presentation: components, hosts, feature instances
                        ↓
Client game services and shared game state
                        ↓
Generated endpoint client and shared definitions
                        ↓
Replaceable request transport
                        ↓
Existing Laravel game
```

- Preserve route-derived endpoint methods and backend-derived enums/metadata.
- Provide explicit module exports for the new client.
- Give the generated client an injected transport rather than embedding jQuery calls in every method.
- Return plain asynchronous results and structured failures, not raw jQuery request objects to features.
- Do not mutate caller payloads to attach CSRF information.
- Keep URLs, encoding, session/CSRF handling, response parsing, and HTTP mechanics below presentation.
- Keep endpoint-specific response adaptation and data invalidation in client services; do not blindly unwrap every response as `.data`.
- The transport must not render messages, open dialogs, navigate, or edit shared gameplay state. The app/feature decides how to present failures.
- Keep Laravel authoritative for rules, permissions, and mutations. Local previews are advisory and must reconcile with server results.
- Preserve the legacy dashboard contract during migration, for example with a separate output mode from the shared generator. Never hand-edit generated output as the source of truth.
- Same-origin Laravel hosting/authentication can remain. Separate deployment, cross-origin credentials, and a new auth system are not requirements.

## Required hardening before relying on it

Audit route coverage, parameter encoding/multiple placeholders, JSON versus form payloads, empty responses, malformed/non-JSON errors, annotation/schema completeness, generated-output versioning, and lifecycle cancellation. Provide tests for generated method contracts and the underlying transport.

The current generator's single-placeholder extraction is a future limitation; it is not evidence that current one-placeholder routes are broken. jQuery requests can be aborted, but their current API is not the standard lifecycle-facing cancellation contract we want.

## Consequences and limits

This accepts separation and preservation of generation, not a particular HTTP library or every internal method signature. The proposed native-fetch implementation and output-generation timing are recorded as explicit defaults in the baseline.

Only narrow integration changes belong to this work: generator output, entry/bootstrap, response documentation, and any proven missing read contract. New game rules, database mechanics, or permission expansions require separate scope.

Sources inspected: `app/Services/JavascriptClientServicesGenerator.php`, `JavascriptStaticServicesGenerator.php`, `StaticJavascriptResource.php`, `routes/web.php`, controller/request/read-model declarations, and actual dashboard call sites.

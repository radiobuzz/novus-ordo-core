# Version 7.1 foundation

Date: 2026-09-27. Status: established.

## Product boundary

Version 7.1 continues the Novus Ordo development history from the playable Version 7 checkpoint `6f19853`, published as the `v7.0.0` tag.

Version 7 can be recovered from that tag when needed. Version 7.1 may replace its domain model, database schema, APIs and user experience as required by the political system, microcell world model, revised economy and commerce. Those systems will be introduced in planned increments rather than one combined rewrite.

## Repository policy

- Novus Ordo uses one continuous repository. A new product version does not require a new repository.
- Release tags preserve recoverable source checkpoints. `v7.0.0` identifies the Version 7 source; a future `v7.1.0` tag will identify the completed Version 7.1 release.
- Current 7.1 development continues after `v7.0.0` on the repository's main development line.
- If an older release ever needs a maintenance fix, branch from its release tag and deliberately port the fix forward when applicable.
- Shared history does not require Version 7.1 to retain obsolete Version 7 interfaces, data formats or compatibility paths.

## Runtime and recovery boundary

The active development installation remains `/var/www/no7`. Its directory name is not a version contract; Git commits and release tags identify source versions.

Before incompatible migrations or destructive release work, retain a matching application backup and database dump. Restoring Version 7 requires both the `v7.0.0` source and a database compatible with that release. Application keys, sessions, caches, storage, schedulers, workers, logs and deployment configuration remain environment state rather than Git version markers.

# Railway package configuration upload repair

Production run33955656749 passed release gates and migration parity but its CLI API build failed because /.npmrc was missing. Railway CLI applies .gitignore even to this tracked file; the Git-source deployment of the same SHA succeeded.

Allow only the tracked root .npmrc through Git-ignore upload filtering. It contains auto-install-peers=false and engine-strict=true, no registry credentials. Nested .npmrc and all environment secrets remain ignored. A regression test reproduced the missing input before this change and verifies both upload inclusion and secret exclusions afterward.

No application, schema, provider credentials, or approval gate changes. Release through a normal PR, then rerun the guarded production workflow. Rollback is reverting this narrow ignore exception; prior provider artifacts remain available. No database restoration is involved.

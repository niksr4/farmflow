# Drafted migrations, deliberately outside the runner's path

`scripts/migrate.mjs` reads `readdirSync(scripts/)` and runs **every** file matching
`/^\d{2,}-.*\.sql$/` that is not yet in `schema_migrations`. It does not read comments, so a
"DRAFTED — DO NOT APPLY" header in the file body stops nothing: the next `pnpm migrate` would
execute it.

Anything in here is designed but not agreed, or agreed but not sequenced. The directory name
does not match that regex, and the readdir is not recursive, so nothing here can run by
accident. Renumber to the next free number when moving a file back up to `scripts/`.

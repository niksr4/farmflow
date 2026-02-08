# Module Template (Copy & Rename)

Files in this folder are meant to be copied into your app when you add a new module.

Suggested mapping:

- `module-tab.tsx` -> `components/<module>-tab.tsx`
- `route.ts` -> `app/api/<module>/route.ts`
- `schema.sql` -> `scripts/<xx>-<module>-schema.sql`

After copying:

- Update `<module>` placeholders.
- Add the module to `lib/modules.ts`.
- Wire it into `components/inventory-system.tsx`.
- Add RLS and indexes as needed.

# suaveplan-skills

Claude Code plugin marketplace for the [Suaveplan](https://github.com/SuavePlan) monorepo. Each plugin corresponds 1:1 to a domain folder under `genesis/packages/<plugin>/`. Skills inside each plugin are generated from on-disk package READMEs and co-located `.md` files.

## Install

```bash
# In Claude Code, add this marketplace:
/plugin marketplace add SuavePlan/suaveplan-skills

# Then install plugins individually:
/plugin install suaveplan-foundation@suaveplan
/plugin install suaveplan-crypto@suaveplan
# ...etc
```

## What's where

- **`plugins/suaveplan-architect/`** — start here. The `pick-plugins` skill interrogates your use case and recommends the right plugin set (one of ~10 archetypes: password manager, multiplayer game, SaaS web app, logistics platform, decentralised app, observatory tool, etc.).
- **`plugins/suaveplan-<domain>/`** — one plugin per domain folder in `genesis/packages/`. Each contains one `SKILL.md` per `@suaveplan/<package>`.
- **`archetypes.yml`** — recipe data: which plugins to install for each project archetype. Read by `pick-plugins`.
- **`scripts/generate-marketplace.ts`** — regenerates `.claude-plugin/marketplace.json` from `genesis/scripts/folder-reorg/assignment.yml`.
- **`scripts/generate-skills.ts`** — regenerates every `SKILL.md` from on-disk package READMEs.

## Regeneration

Skills and the marketplace manifest are generated, not hand-written (the `suaveplan-architect` plugin is the one exception). Whenever genesis ships a package or changes its README, regenerate:

```bash
bun scripts/generate-marketplace.ts
bun scripts/generate-skills.ts
```

CI on this repo runs both with `--check` and fails on drift.

## Plugin → package count

54 plugins, 403 packages (current + Vaulted future + universe family). See `.claude-plugin/marketplace.json` for the live list.

## License

MIT, matching genesis.

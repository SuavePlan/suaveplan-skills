---
name: pick-plugins
description: Use when starting a new project, scaffolding a Suaveplan-based codebase, or asking "which plugins do I need". Interrogates the user's use case (password manager, multiplayer game, SaaS, logistics, P2P app, email platform, DMX, astronomy, API service, CLI), matches it to a project archetype, and outputs the recommended `suaveplan-*` plugin install commands plus a build-order hint.
---

# Pick the right Suaveplan plugins for your project

The Suaveplan marketplace ships ~50 plugins covering everything from cryptographic primitives to 3D game physics. Most projects need 10–20 of them, not all 50. This skill asks what you're building, matches it against the archetype recipes in `data/archetypes.yml`, and produces a curated install list.

## When to invoke

- User says "I want to build X" and X involves the Suaveplan stack.
- User asks "which plugins do I need for Y".
- User is scaffolding a new app, service, or game.
- After installing the marketplace and before installing individual plugins.

## Fast path: deterministic CLI matcher

If the marketplace repo is checked out locally, prefer running the matcher and presenting its output verbatim:

```bash
bun /path/to/suaveplan-skills/scripts/match-archetype.ts "<the user's description>"
# JSON form (if you want to compose with other tools):
bun /path/to/suaveplan-skills/scripts/match-archetype.ts --json "<...>"
```

The matcher implements the algorithm in this skill. If the user says "I'm building a password manager", running it returns the password-manager archetype with its install commands ready to paste. Use the output directly; do not re-derive.

If the matcher is not available (the user hasn't cloned the marketplace repo, or only has the plugin installed), fall back to the manual procedure below.

## Manual procedure

1. **Read** `data/archetypes.yml` (sibling of this file via `${CLAUDE_PLUGIN_ROOT}/data/archetypes.yml`).
2. **Ask the user** in one short turn: "What are you building?" Give them the archetype names from the YAML as a menu but accept free text.
3. **Match** the user's answer to one or more archetypes:
   - Free text matches via the `signals` field of each archetype (case-insensitive substring match on any signal phrase).
   - Menu pick matches by archetype key directly.
   - If multiple archetypes match (e.g. "SaaS with email marketing"), union the `core` lists.
4. **Output** in this exact order:
   - **Recommended plugins** — bulleted list of `suaveplan-<plugin>` for every plugin in `core`, with the plugin's marketplace description.
   - **Optional extras** — bulleted list from `optional`, prefixed with "consider if:" hint where the YAML's `notes` field calls them out.
   - **Install commands** — a copy-pastable block:
     ```
     /plugin install suaveplan-<core-1>@suaveplan
     /plugin install suaveplan-<core-2>@suaveplan
     ...
     ```
   - **Notes** — verbatim from the archetype's `notes` field, if present.
   - **Build order hint** — order the plugins by dependency layer (foundation → observability → primitives → domain plugins → UI/api → dev). The order in `core` lists is already roughly correct; preserve it.
5. **Offer to refine**: "Anything in this list you don't need?" / "Anything missing? Tell me more about the project."

## Matching rules

- **Free text → archetype**: lowercase the user's answer, lowercase each signal, substring match. Sum match counts per archetype; pick the highest. Tie → ask the user to disambiguate.
- **No match**: don't guess. Say "I don't have an archetype for that yet — tell me what categories your project touches (auth, data, network, UI, gaming, payment, comms, media, geo, dev) and I'll assemble a plugin set from those."
- **Multi-archetype**: if signals from two archetypes both match strongly (≥2 each), confirm with the user before unioning.

## What this skill does NOT do

- It does not run `/plugin install` for the user. It produces the commands; the user executes them.
- It does not read the user's existing codebase. If the user has an existing project, ask them to describe it rather than scanning files.
- It does not modify `data/archetypes.yml`. New archetypes are added by editing the YAML in this plugin and committing.

## Example interaction

> **User:** I'm building a password manager
>
> **You:** That matches the **password-manager** archetype. You'll want these plugins:
>
> - `suaveplan-foundation` — error hierarchy, types, tsconfig
> - `suaveplan-crypto` — hash, curve, cipher, AEAD, signing
> - `suaveplan-vaulted` — SRP, OTP, WebAuthn, vault orchestration
> - `suaveplan-drive` — encrypted file attachments
> - … (full list)
>
> ```
> /plugin install suaveplan-foundation@suaveplan
> /plugin install suaveplan-crypto@suaveplan
> /plugin install suaveplan-vaulted@suaveplan
> ...
> ```
>
> **Notes from the recipe:** `vaulted` depends on `crypto` — install both. `drive` carries encrypted file attachments and sharing.
>
> Anything you'd like to drop or add?

## Reference

- `data/archetypes.yml` — recipe data
- `../../README.md` (marketplace root) — how to add the marketplace and install plugins
- `genesis/openspec/changes/folder-reorg-by-domain/proposal.md` — full plugin → package mapping

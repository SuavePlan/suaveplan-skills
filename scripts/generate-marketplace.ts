#!/usr/bin/env bun
/**
 * Generates .claude-plugin/marketplace.json from genesis assignment.yml.
 *
 * Marketplace schema reference: https://code.claude.com/docs/en/plugin-marketplaces
 *
 * Usage:
 *   bun scripts/generate-marketplace.ts          # write
 *   bun scripts/generate-marketplace.ts --check  # exit 1 on drift
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(here, "..");
const manifestPath = resolve(skillsRoot, ".claude-plugin", "marketplace.json");
const assignmentPath = resolve(skillsRoot, "..", "genesis", "scripts", "folder-reorg", "assignment.yml");

interface Plugin {
	name: string;
	source: string;
	description: string;
	category: string;
	keywords?: string[];
}

interface Marketplace {
	name: string;
	owner: { name: string; url?: string };
	plugins: Plugin[];
}

const DESCRIPTIONS: Record<string, { description: string; category: string; keywords: string[] }> = {
	foundation: { description: "Error hierarchy, shared types, TypeScript config presets", category: "core", keywords: ["error", "types", "typescript-config"] },
	observability: { description: "Logger, OpenTelemetry, profiler, audit logging, analytics", category: "core", keywords: ["logging", "otel", "tracing"] },
	primitives: { description: "Bytes, timing, datetime, MIME, serialize, diff, templates, bitpacker", category: "core", keywords: ["primitives", "datetime", "serialize"] },
	i18n: { description: "Internationalisation core, locale data, React translation components", category: "core", keywords: ["i18n", "locale"] },
	validation: { description: "Runtime schema validation and registry", category: "core", keywords: ["validation", "zod", "schema"] },
	"control-flow": { description: "Retry strategies, idempotency, FSM, undo/redo", category: "core", keywords: ["retry", "fsm", "idempotency"] },
	config: { description: "Environment loading, layered config, feature flags", category: "core", keywords: ["config", "env", "feature-flags"] },
	events: { description: "Event bus, sourcing, OTel/metrics/schema bridges, transport", category: "core", keywords: ["events", "pubsub", "event-sourcing"] },
	streams: { description: "Stream processing, queues, chunked pipelines", category: "core", keywords: ["streams", "queue"] },
	random: { description: "Seeded PRNGs, CSPRNG utilities, noise fields", category: "core", keywords: ["random", "noise", "prng"] },

	crypto: { description: "Hash, curve, cipher, AEAD, signing, key agreement, vaults", category: "crypto", keywords: ["crypto", "aead", "ed25519", "argon2"] },
	auth: { description: "Auth, permissions, JWT, OAuth, SLSA, server keys, sandbox", category: "auth", keywords: ["auth", "jwt", "rbac", "oauth"] },
	vaulted: { description: "Password manager toolkit: SRP, OTP, WebAuthn, CBOR, vault orchestration", category: "auth", keywords: ["password-manager", "webauthn", "srp", "vault"] },

	database: { description: "DB adapters (SQLite, SurrealDB), cache, migrations, seeding", category: "data", keywords: ["database", "sqlite", "surrealdb", "cache"] },
	storage: { description: "Key-value storage backends: file, S3, IndexedDB, OPFS", category: "data", keywords: ["storage", "s3", "opfs"] },
	drive: { description: "Encrypted virtual filesystem, sharing, P2P sync, file upload", category: "data", keywords: ["drive", "filesystem", "encryption"] },
	data: { description: "ETL, CRDT, dedup, pagination, masking, A/B testing, GraphQL", category: "data", keywords: ["etl", "crdt", "graphql"] },
	search: { description: "Full-text search client and API plugin", category: "data", keywords: ["search", "fts"] },

	"network-core": { description: "Networking primitives: protocol, quality, failover, websockets, discovery", category: "network", keywords: ["network", "websocket"] },
	"network-p2p": { description: "P2P: WebRTC, libp2p, hyperswarm, gossip discovery", category: "network", keywords: ["p2p", "webrtc", "libp2p"] },

	api: { description: "API framework, gateway, plugins (rate-limit, audit, SSE, webhook, GraphQL)", category: "api", keywords: ["api", "rest", "gateway"] },
	platform: { description: "CLI, Electrobun, PWA, web workers, clipboard, iconz", category: "platform", keywords: ["cli", "electrobun", "pwa"] },
	"react-ui": { description: "React component library: tables, modals, charts, command palette, kanban", category: "ui", keywords: ["react", "components", "ui"] },
	workflow: { description: "Workflow/saga orchestration, rules, form builder, wizard", category: "workflow", keywords: ["workflow", "rules", "forms"] },

	email: { description: "Email parsing, templates, campaigns, suppression, DMARC, deliverability", category: "comms", keywords: ["email", "dmarc", "campaigns"] },
	messaging: { description: "SMS providers, notification routing, message channels", category: "comms", keywords: ["sms", "notifications"] },
	social: { description: "Slack, Discord, Telegram, iMessage clients and React social UI", category: "comms", keywords: ["slack", "discord", "telegram"] },

	payment: { description: "Payment intents, providers (Stripe/PayPal/Square), banking, subscriptions, store", category: "commerce", keywords: ["payment", "stripe", "subscription"] },
	currency: { description: "Currency conversion, money math, cryptocurrency wallets", category: "commerce", keywords: ["currency", "money", "crypto"] },
	booking: { description: "Resource booking engine + 3D venue maps", category: "commerce", keywords: ["booking", "scheduling"] },
	logistics: { description: "Shipments, customs, procurement, warehouse, port tracking", category: "commerce", keywords: ["logistics", "warehouse", "shipping"] },

	geo: { description: "Geometry (Earth + arbitrary planets), buildings, heightmap tiles, 3D globe", category: "geo", keywords: ["geo", "geospatial", "earth"] },
	astronomy: { description: "Universe observer, solar system, stars, tides", category: "geo", keywords: ["astronomy", "stars", "tides"] },

	"media-core": { description: "Media metadata, EXIF reader/writer", category: "media", keywords: ["media", "exif"] },
	image: { description: "Image processing: format detection, quantisation, compression", category: "media", keywords: ["image", "compress"] },
	svg: { description: "SVG compression and pixel-art conversion", category: "media", keywords: ["svg"] },
	fonts: { description: "Font subsetting, conversion, BTF compression", category: "media", keywords: ["fonts", "ttf", "woff2"] },
	video: { description: "Video metadata, thumbnails, React player", category: "media", keywords: ["video"] },
	audio: { description: "Web Audio engine, FX plugins, controllers, voice, fingerprinting", category: "media", keywords: ["audio", "voice", "midi"] },
	pdf: { description: "PDF generation and React viewer", category: "media", keywords: ["pdf"] },
	dmx: { description: "DMX512 lighting control engine + 3D visualisation", category: "media", keywords: ["dmx", "lighting"] },
	codes: { description: "Barcode and QR code generation/scanning", category: "media", keywords: ["barcode", "qrcode"] },

	dev: { description: "Test utilities: vitest fixtures, DOM helpers, Playwright E2E, integration containers", category: "dev", keywords: ["testing", "playwright", "vitest"] },
	mcp: { description: "Model Context Protocol server/client", category: "dev", keywords: ["mcp"] },

	"gaming-engine": { description: "ECS, game loop, spatial hash, persistence, server, controllers", category: "gaming", keywords: ["ecs", "game-loop", "gaming"] },
	"gaming-rigs": { description: "Character/vehicle physics, IK, animation, Mixamo, R3F characters", category: "gaming", keywords: ["character", "vehicle", "rigging"] },
	"gaming-combat": { description: "Damage, weapons, hitboxes, destructibles, R3F combat FX", category: "gaming", keywords: ["combat", "weapons"] },
	"gaming-ai": { description: "Behaviour trees, NPCs, fauna, R3F pathfinding", category: "gaming", keywords: ["ai", "behavior-tree", "navmesh"] },
	"gaming-narrative": { description: "Dialogue, quests, crafting, progression, economy", category: "gaming", keywords: ["dialogue", "quest", "crafting"] },
	"gaming-world": { description: "Building, weather, world simulation, R3F terrain/water/vegetation, day-night replacement", category: "gaming", keywords: ["world", "weather", "terrain"] },
	"gaming-multiplayer": { description: "Lobby, party, chat, emotes, leaderboard, matchmaking, anti-cheat, virtual currency", category: "gaming", keywords: ["multiplayer", "matchmaking"] },
	"gaming-ui": { description: "HUD, map, settings, R3F UI/minimap/inventory", category: "gaming", keywords: ["hud", "minimap", "inventory"] },
	"gaming-effects": { description: "Particles, shaders, parallax, 3D audio, LOD, performance, XR, emulator", category: "gaming", keywords: ["particles", "shaders", "xr"] },
	"gaming-physics": { description: "R3F physics core + Rapier + Cascade", category: "gaming", keywords: ["physics", "rapier"] },
};

function loadAssignment(): Record<string, string[]> {
	const raw = readFileSync(assignmentPath, "utf8");
	const parsed = parseYaml(raw) as Record<string, unknown>;
	const out: Record<string, string[]> = {};
	for (const [k, v] of Object.entries(parsed)) {
		if (k === "__retired__") continue;
		if (Array.isArray(v)) out[k] = v as string[];
	}
	return out;
}

function buildMarketplace(): Marketplace {
	const assignment = loadAssignment();
	const plugins: Plugin[] = [];

	plugins.push({
		name: "suaveplan-architect",
		source: "./plugins/suaveplan-architect",
		description: "Start here — interrogates your use case and recommends the right Suaveplan plugins for it (password manager, multiplayer game, SaaS, logistics, etc.)",
		category: "meta",
		keywords: ["architect", "scaffold", "recommend"],
	});

	for (const plugin of Object.keys(assignment).sort()) {
		const meta = DESCRIPTIONS[plugin];
		if (meta === undefined) {
			throw new Error(`Missing description metadata for plugin "${plugin}". Update DESCRIPTIONS in generate-marketplace.ts.`);
		}
		plugins.push({
			name: `suaveplan-${plugin}`,
			source: `./plugins/suaveplan-${plugin}`,
			description: meta.description,
			category: meta.category,
			keywords: meta.keywords,
		});
	}

	return {
		name: "suaveplan",
		owner: { name: "Suaveplan", url: "https://github.com/SuavePlan" },
		plugins,
	};
}

function main(): void {
	const checkMode = process.argv.includes("--check");
	if (!existsSync(assignmentPath)) {
		console.error(`✗ Cannot find genesis assignment.yml at: ${assignmentPath}`);
		console.error("  Expected layout: /mnt/s/web/{genesis,suaveplan-skills}/");
		process.exit(1);
	}
	const generated = `${JSON.stringify(buildMarketplace(), null, 2)}\n`;

	if (checkMode) {
		const onDisk = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
		if (onDisk === generated) {
			console.log("✓ marketplace.json is up to date.");
			process.exit(0);
		}
		console.error("✗ marketplace.json is stale. Re-run: bun scripts/generate-marketplace.ts");
		process.exit(1);
	}

	writeFileSync(manifestPath, generated);
	const m = JSON.parse(generated) as Marketplace;
	console.log(`✓ Wrote ${manifestPath} (${m.plugins.length} plugins).`);
}

main();

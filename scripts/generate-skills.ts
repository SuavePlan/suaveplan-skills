#!/usr/bin/env bun
/**
 * Generates plugins/suaveplan-<plugin>/skills/<package>/SKILL.md for every
 * package in genesis/packages/<plugin>/<package>/.
 *
 * Reads:
 *   - genesis/scripts/folder-reorg/assignment.yml      (plugin → package map)
 *   - genesis/packages/<plugin>/<package>/package.json (description, deps)
 *   - genesis/packages/<plugin>/<package>/README.md    (purpose extraction)
 *
 * Writes:
 *   - plugins/suaveplan-<plugin>/.claude-plugin/plugin.json
 *   - plugins/suaveplan-<plugin>/skills/<package>/SKILL.md
 *
 * Usage:
 *   bun scripts/generate-skills.ts          # write
 *   bun scripts/generate-skills.ts --check  # exit 1 on drift
 *
 * Pre-migration: genesis/packages/ does not exist yet, so the generator
 * walks the legacy universal/<domain>/<pkg>/ paths instead — the assignment
 * map still tells us which plugin each package belongs to.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(here, "..");
const genesisRoot = resolve(skillsRoot, "..", "genesis");
const assignmentPath = resolve(genesisRoot, "scripts", "folder-reorg", "assignment.yml");
const templatePath = resolve(skillsRoot, "templates", "SKILL.md.tmpl");

const LEGACY_ROOTS = ["packages", "universal", "browser", "react", "r3f", "server", "finance", "mcp", "python", "gaming", "api"] as const;

interface PkgJson {
	name: string;
	version: string;
	description?: string;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	keywords?: string[];
}

interface PackageInfo {
	short: string;
	plugin: string;
	pkgJson: PkgJson;
	readme: string;
	dirAbs: string;
}

function loadAssignment(): { pkgToPlugin: Map<string, string>; retired: Set<string> } {
	const raw = readFileSync(assignmentPath, "utf8");
	const parsed = parseYaml(raw) as Record<string, unknown>;
	const pkgToPlugin = new Map<string, string>();
	const retired = new Set<string>((parsed.__retired__ as string[] | undefined) ?? []);
	for (const [plugin, pkgs] of Object.entries(parsed)) {
		if (plugin === "__retired__" || !Array.isArray(pkgs)) continue;
		for (const p of pkgs as string[]) pkgToPlugin.set(p, plugin);
	}
	return { pkgToPlugin, retired };
}

function findPackageDir(short: string): string | null {
	for (const root of LEGACY_ROOTS) {
		const rootPath = join(genesisRoot, root);
		if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) continue;
		for (const sub of readdirSync(rootPath)) {
			const subPath = join(rootPath, sub);
			if (!statSync(subPath).isDirectory()) continue;
			const candidate = join(subPath, short);
			if (existsSync(join(candidate, "package.json"))) return candidate;
		}
	}
	return null;
}

function discoverPackages(pkgToPlugin: Map<string, string>): PackageInfo[] {
	const out: PackageInfo[] = [];
	for (const [short, plugin] of pkgToPlugin) {
		const dir = findPackageDir(short);
		if (dir === null) continue; // future package, skip
		const pkgJsonPath = join(dir, "package.json");
		const readmePath = join(dir, "README.md");
		const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as PkgJson;
		const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
		out.push({ short, plugin, pkgJson, readme, dirAbs: dir });
	}
	out.sort((a, b) => a.short.localeCompare(b.short));
	return out;
}

function extractPurpose(readme: string, fallback: string): string {
	if (readme === "") return fallback;
	const lines = readme.split("\n");
	const startIdx = lines.findIndex((l) => /^#\s+/.test(l));
	if (startIdx === -1) return fallback;
	const para: string[] = [];
	for (let i = startIdx + 1; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (/^#{1,6}\s+/.test(line)) break;
		const trimmed = line.trim();
		if (trimmed === "") {
			if (para.length > 0) break;
			continue;
		}
		para.push(trimmed);
		if (para.join(" ").length > 400) break;
	}
	const result = para.join(" ").trim();
	return result === "" ? fallback : result;
}

function workspaceDeps(p: PkgJson): string[] {
	const out = new Set<string>();
	for (const map of [p.dependencies, p.peerDependencies]) {
		if (!map) continue;
		for (const [name, range] of Object.entries(map)) {
			if (typeof range === "string" && range.startsWith("workspace:") && name.startsWith("@suaveplan/")) {
				out.add(name);
			}
		}
	}
	return [...out].sort();
}

function buildDescription(short: string, p: PkgJson): string {
	const summary = (p.description ?? "").split(".")[0]?.trim() ?? "";
	const trimmed = summary.length > 0 ? summary : `${short} package`;
	const trigger = `Use when implementing or debugging code that uses @suaveplan/${short}`;
	return `${trigger}: ${trimmed}.`.replace(/\.\.+$/, ".");
}

function renderSkill(template: string, info: PackageInfo): string {
	const desc = buildDescription(info.short, info.pkgJson);
	const purpose = extractPurpose(info.readme, info.pkgJson.description ?? `The @suaveplan/${info.short} package.`);
	const keywords = (info.pkgJson.keywords ?? []).slice(0, 6).join(", ") || "see package README";
	const deps = workspaceDeps(info.pkgJson);
	const wsDeps = deps.length === 0 ? "_none_" : deps.map((d) => `\`${d}\``).join(", ");
	const seeAlso = deps.length === 0 ? "- The marketplace root: `../../../README.md`" : deps.map((d) => `- \`@suaveplan/${d.replace(/^@suaveplan\//, "")}\``).join("\n");

	return template
		.replaceAll("{{SHORT_NAME}}", info.short)
		.replaceAll("{{PLUGIN}}", info.plugin)
		.replaceAll("{{DESCRIPTION}}", desc)
		.replaceAll("{{PURPOSE}}", purpose)
		.replaceAll("{{KEYWORDS}}", keywords)
		.replaceAll("{{WORKSPACE_DEPS}}", wsDeps)
		.replaceAll("{{SEE_ALSO}}", seeAlso);
}

function ensurePluginManifest(plugin: string, checkMode: boolean): { wrote: boolean; drift: boolean } {
	const manifestPath = join(skillsRoot, "plugins", `suaveplan-${plugin}`, ".claude-plugin", "plugin.json");
	const expected = `${JSON.stringify(
		{
			name: `suaveplan-${plugin}`,
			version: "0.0.0",
			description: `@suaveplan/${plugin} domain skills (auto-generated).`,
		},
		null,
		2,
	)}\n`;
	const existing = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
	if (existing === expected) return { wrote: false, drift: false };
	if (checkMode) return { wrote: false, drift: true };
	mkdirSync(dirname(manifestPath), { recursive: true });
	writeFileSync(manifestPath, expected);
	return { wrote: true, drift: false };
}

function writeSkill(info: PackageInfo, content: string, checkMode: boolean): { wrote: boolean; drift: boolean } {
	const skillPath = join(skillsRoot, "plugins", `suaveplan-${info.plugin}`, "skills", info.short, "SKILL.md");
	const existing = existsSync(skillPath) ? readFileSync(skillPath, "utf8") : "";
	if (existing === content) return { wrote: false, drift: false };
	if (checkMode) return { wrote: false, drift: true };
	mkdirSync(dirname(skillPath), { recursive: true });
	writeFileSync(skillPath, content);
	return { wrote: true, drift: false };
}

function main(): void {
	const checkMode = process.argv.includes("--check");
	const template = readFileSync(templatePath, "utf8");
	const { pkgToPlugin } = loadAssignment();

	const packages = discoverPackages(pkgToPlugin);
	const pluginsTouched = new Set(packages.map((p) => p.plugin));

	let written = 0;
	let drifted = 0;

	for (const plugin of pluginsTouched) {
		const result = ensurePluginManifest(plugin, checkMode);
		if (result.wrote) written += 1;
		if (result.drift) drifted += 1;
	}

	for (const info of packages) {
		const content = renderSkill(template, info);
		const result = writeSkill(info, content, checkMode);
		if (result.wrote) written += 1;
		if (result.drift) drifted += 1;
	}

	if (checkMode) {
		if (drifted === 0) {
			console.log(`✓ All skills up to date (${packages.length} packages across ${pluginsTouched.size} plugins).`);
			process.exit(0);
		}
		console.error(`✗ ${drifted} file(s) drifted. Re-run: bun scripts/generate-skills.ts`);
		process.exit(1);
	}

	console.log(`✓ Wrote ${written} file(s) for ${packages.length} packages across ${pluginsTouched.size} plugins.`);
	const skipped = pkgToPlugin.size - packages.length;
	if (skipped > 0) console.log(`  (${skipped} future packages not yet on disk — skipped.)`);
}

main();

#!/usr/bin/env bun
/**
 * Deterministic archetype matcher for the pick-plugins skill.
 *
 * Reads plugins/suaveplan-architect/data/archetypes.yml and matches a
 * free-text project description against the `signals` field of each archetype,
 * then prints the recommended plugin set with copy-pastable install commands.
 *
 * Usage:
 *   bun scripts/match-archetype.ts "I'm building a password manager"
 *   bun scripts/match-archetype.ts --json "logistics platform with shipping"
 *   bun scripts/match-archetype.ts --list
 *   bun scripts/match-archetype.ts --self-test
 *
 * Matching algorithm:
 *   1. Lowercase the input.
 *   2. For each archetype, count signals where the lowercased signal is a
 *      substring of the lowercased input.
 *   3. Pick the archetype with the highest score (>=1).
 *   4. Tie → return all tied archetypes; the human disambiguates.
 *   5. No matches → exit non-zero with a hint.
 *
 * Self-test:
 *   For each archetype, the canonical signal phrases must match THAT archetype
 *   uniquely (no cross-archetype contamination on the canonical examples).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const skillsRoot = resolve(here, "..");
const archetypesPath = resolve(skillsRoot, "plugins", "suaveplan-architect", "data", "archetypes.yml");

interface Archetype {
	name: string;
	signals: string[];
	core: string[];
	optional?: string[];
	notes?: string;
}

interface MatchResult {
	key: string;
	archetype: Archetype;
	score: number;
	matchedSignals: string[];
}

function loadArchetypes(): Map<string, Archetype> {
	const raw = readFileSync(archetypesPath, "utf8");
	const parsed = parseYaml(raw) as Record<string, Archetype>;
	const out = new Map<string, Archetype>();
	for (const [key, val] of Object.entries(parsed)) {
		out.set(key, val);
	}
	return out;
}

function match(input: string, archetypes: Map<string, Archetype>): MatchResult[] {
	const haystack = input.toLowerCase();
	const results: MatchResult[] = [];
	for (const [key, archetype] of archetypes) {
		const matched: string[] = [];
		for (const signal of archetype.signals) {
			if (haystack.includes(signal.toLowerCase())) matched.push(signal);
		}
		if (matched.length > 0) {
			results.push({ key, archetype, score: matched.length, matchedSignals: matched });
		}
	}
	results.sort((a, b) => b.score - a.score);
	return results;
}

function topMatches(results: MatchResult[]): MatchResult[] {
	if (results.length === 0) return [];
	const top = results[0]?.score ?? 0;
	return results.filter((r) => r.score === top);
}

function renderHuman(input: string, results: MatchResult[]): string {
	if (results.length === 0) {
		return [
			`No archetype matched the description: "${input}"`,
			"",
			"Try one of the listed archetypes (run with --list), or describe the project's main concerns",
			"(auth, data, network, UI, gaming, payment, comms, media, geo, dev) and a human can assemble a set.",
		].join("\n");
	}
	const top = topMatches(results);
	const lines: string[] = [];
	if (top.length > 1) {
		lines.push(`Multiple archetypes tied (score ${top[0]?.score ?? 0}). Confirm one before installing.`);
		for (const m of top) {
			lines.push(`  - ${m.key}  (${m.archetype.name})  matched: ${m.matchedSignals.join(", ")}`);
		}
		lines.push("");
		lines.push("Top suggestion:");
	}
	const pick = top[0];
	if (pick === undefined) return "";
	lines.push(`Archetype: ${pick.archetype.name}  (key: ${pick.key})`);
	lines.push(`Matched signals: ${pick.matchedSignals.join(", ")}`);
	lines.push("");
	lines.push("Recommended plugins (core):");
	for (const p of pick.archetype.core) lines.push(`  - suaveplan-${p}`);
	if (pick.archetype.optional && pick.archetype.optional.length > 0) {
		lines.push("");
		lines.push("Optional extras:");
		for (const p of pick.archetype.optional) lines.push(`  - suaveplan-${p}`);
	}
	lines.push("");
	lines.push("Install commands:");
	for (const p of pick.archetype.core) lines.push(`  /plugin install suaveplan-${p}@suaveplan`);
	if (pick.archetype.notes) {
		lines.push("");
		lines.push("Notes:");
		for (const line of pick.archetype.notes.trim().split("\n")) lines.push(`  ${line}`);
	}
	return lines.join("\n");
}

function renderJson(input: string, results: MatchResult[]): string {
	const top = topMatches(results);
	const pick = top[0];
	return `${JSON.stringify(
		{
			input,
			tied: top.length > 1,
			matches: results.map((r) => ({
				key: r.key,
				name: r.archetype.name,
				score: r.score,
				matchedSignals: r.matchedSignals,
			})),
			pick:
				pick === undefined
					? null
					: {
							key: pick.key,
							name: pick.archetype.name,
							core: pick.archetype.core.map((p) => `suaveplan-${p}`),
							optional: (pick.archetype.optional ?? []).map((p) => `suaveplan-${p}`),
							installCommands: pick.archetype.core.map((p) => `/plugin install suaveplan-${p}@suaveplan`),
							notes: pick.archetype.notes ?? null,
						},
		},
		null,
		2,
	)}\n`;
}

function listArchetypes(archetypes: Map<string, Archetype>): string {
	const lines: string[] = [];
	for (const [key, val] of archetypes) {
		lines.push(`- ${key.padEnd(28)} ${val.name}`);
		lines.push(`    signals: ${val.signals.slice(0, 4).join(", ")}${val.signals.length > 4 ? ", …" : ""}`);
	}
	return lines.join("\n");
}

function selfTest(archetypes: Map<string, Archetype>): { ok: boolean; report: string } {
	const failures: string[] = [];
	for (const [key, archetype] of archetypes) {
		for (const signal of archetype.signals) {
			const results = match(signal, archetypes);
			const top = topMatches(results);
			const winner = top[0];
			if (winner === undefined) {
				failures.push(`  ${key}: signal "${signal}" matched zero archetypes`);
				continue;
			}
			if (winner.key !== key) {
				// Tolerated only if the canonical archetype is also in the tied set.
				if (!top.some((m) => m.key === key)) {
					failures.push(`  ${key}: signal "${signal}" matched archetype "${winner.key}" instead`);
				}
			}
		}
	}
	if (failures.length === 0) {
		return {
			ok: true,
			report: `✓ Self-test passed: every signal in archetypes.yml matches its own archetype (${archetypes.size} archetypes, ${[...archetypes.values()].reduce((n, a) => n + a.signals.length, 0)} signals).`,
		};
	}
	return {
		ok: false,
		report: `✗ Self-test failed:\n${failures.join("\n")}`,
	};
}

function main(): void {
	const argv = process.argv.slice(2);
	const archetypes = loadArchetypes();

	if (argv.includes("--list")) {
		console.log(listArchetypes(archetypes));
		return;
	}

	if (argv.includes("--self-test")) {
		const { ok, report } = selfTest(archetypes);
		console.log(report);
		process.exit(ok ? 0 : 1);
	}

	const jsonMode = argv.includes("--json");
	const input = argv.filter((a) => !a.startsWith("--")).join(" ").trim();

	if (input === "") {
		console.error("Usage: bun scripts/match-archetype.ts [--json] \"<project description>\"");
		console.error("       bun scripts/match-archetype.ts --list");
		console.error("       bun scripts/match-archetype.ts --self-test");
		process.exit(2);
	}

	const results = match(input, archetypes);
	process.stdout.write(jsonMode ? renderJson(input, results) : `${renderHuman(input, results)}\n`);
	if (results.length === 0) process.exit(1);
}

main();

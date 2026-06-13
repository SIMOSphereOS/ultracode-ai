/**
 * `ultracode skills list|show <name>|create|test|upgrade`
 *
 * Skill authoring commands backed by the facade's `authoring` sub-API
 * (Module B). `create`/`upgrade` build an {@link AuthoringProposal} from
 * knowledge material (a JSON file or inline `--topic`/`--catalog` flags),
 * `test` validates a proposal/skill, and `persist` is gated behind `--yes`
 * (no implicit writes).
 *
 * Every subcommand supports `--json`.
 */

import path from "node:path";
import process from "node:process";
import { promises as fs } from "node:fs";
import type { Command } from "commander";
import { ValidationError } from "ultracode-shared";
import type { CliContext } from "../context.js";
import { authoringOf, withExtFacade } from "./ext-helpers.js";
import { formatBlock, formatSkillList, formatTestResult } from "./ext-format.js";
import type { AuthoringProposal, KnowledgeMaterial } from "ultracode-core";

interface JsonOption {
  json?: boolean;
}

interface MaterialOptions extends JsonOption {
  file?: string;
  topic?: string;
  catalog?: string;
  summary?: string;
  yes?: boolean;
}

/** Build {@link KnowledgeMaterial} from a JSON file or inline flags. */
async function loadMaterial(ctx: CliContext, opts: MaterialOptions): Promise<KnowledgeMaterial> {
  if (opts.file !== undefined) {
    const target = path.resolve(ctx.cwd, opts.file);
    let raw: string;
    try {
      raw = await fs.readFile(target, "utf8");
    } catch (cause) {
      throw new ValidationError(`Cannot read material file: ${target}`, { cause });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/^﻿/, "")) as unknown;
    } catch (cause) {
      throw new ValidationError(`Invalid JSON in material file: ${target}`, { cause });
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ValidationError(`Material file must contain a JSON object: ${target}`);
    }
    return parsed as KnowledgeMaterial;
  }
  if (opts.topic === undefined || opts.catalog === undefined) {
    throw new ValidationError(
      "Provide --file <material.json>, or both --topic and --catalog to create skill material inline.",
    );
  }
  return {
    catalog: opts.catalog,
    topic: opts.topic,
    summary: opts.summary ?? "",
    facts: [],
    codeSnippets: [],
    sources: [],
  };
}

/** Print a proposal in either JSON or human form. */
function writeProposal(ctx: CliContext, proposal: AuthoringProposal, json: boolean): void {
  if (json) {
    ctx.stdout.write(`${JSON.stringify(proposal)}\n`);
    return;
  }
  ctx.stdout.write(`Proposal (${proposal.kind}): ${proposal.name}\n`);
  ctx.stdout.write(formatBlock("Rationale", proposal.rationale));
  if (proposal.diffFromExisting !== undefined) {
    ctx.stdout.write(formatBlock("Diff", proposal.diffFromExisting));
  }
}

async function createOrUpgrade(ctx: CliContext, opts: MaterialOptions): Promise<void> {
  await withExtFacade(ctx, async (facade) => {
    const material = await loadMaterial(ctx, opts);
    const proposal = await authoringOf(facade).createSkill(material);
    writeProposal(ctx, proposal, opts.json === true);
    if (opts.yes === true) {
      await authoringOf(facade).persist(proposal, { approved: true });
      if (opts.json !== true) ctx.stdout.write(`✓ skill "${proposal.name}" persisted\n`);
    } else if (opts.json !== true) {
      ctx.stdout.write("Run again with --yes to persist this skill.\n");
    }
  });
}

/** Register the `skills` command group on `program`. */
export function registerSkillsCommands(program: Command, ctx: CliContext): void {
  const skills = program.command("skills").description("author and inspect skills");

  skills
    .command("list")
    .description("list authored skills")
    .argument("[catalog]", "restrict to a catalog")
    .option("--json", "output as JSON")
    .action(async (catalog: string | undefined, opts: JsonOption) =>
      withExtFacade(ctx, async (facade) => {
        const list = await authoringOf(facade).skills.list(catalog);
        ctx.stdout.write(opts.json ? `${JSON.stringify(list)}\n` : formatSkillList(list));
      }),
    );

  skills
    .command("show")
    .description("print a single skill (frontmatter + body)")
    .argument("<name>", "skill name")
    .option("--json", "output as JSON")
    .action(async (name: string, opts: JsonOption) =>
      withExtFacade(ctx, async (facade) => {
        const skill = await authoringOf(facade).skills.get(name);
        if (skill === null) throw new ValidationError(`Unknown skill: "${name}"`);
        if (opts.json) {
          ctx.stdout.write(`${JSON.stringify(skill)}\n`);
          return;
        }
        ctx.stdout.write(`# ${skill.name} v${skill.version} [${skill.status}]\n`);
        ctx.stdout.write(`catalog: ${skill.catalog}\n`);
        ctx.stdout.write(`triggers: ${skill.triggers.join(", ")}\n`);
        ctx.stdout.write(`score: ${authoringOf(facade).scoreSkill(skill)}\n\n`);
        ctx.stdout.write(`${skill.body}\n`);
      }),
    );

  skills
    .command("create")
    .description("create a new skill from knowledge material (proposal only unless --yes)")
    .option("--file <path>", "knowledge material JSON file")
    .option("--topic <topic>", "skill topic (inline material)")
    .option("--catalog <catalog>", "skill catalog (inline material)")
    .option("--summary <text>", "skill summary (inline material)")
    .option("--yes", "persist the proposal instead of only printing it")
    .option("--json", "output as JSON")
    .action(async (opts: MaterialOptions) => createOrUpgrade(ctx, opts));

  skills
    .command("upgrade")
    .description("upgrade an existing skill from new material (proposal only unless --yes)")
    .option("--file <path>", "knowledge material JSON file")
    .option("--topic <topic>", "skill topic (inline material)")
    .option("--catalog <catalog>", "skill catalog (inline material)")
    .option("--summary <text>", "skill summary (inline material)")
    .option("--yes", "persist the proposal instead of only printing it")
    .option("--json", "output as JSON")
    .action(async (opts: MaterialOptions) => createOrUpgrade(ctx, opts));

  skills
    .command("test")
    .description("test a skill proposal built from material, without persisting")
    .option("--file <path>", "knowledge material JSON file")
    .option("--topic <topic>", "skill topic (inline material)")
    .option("--catalog <catalog>", "skill catalog (inline material)")
    .option("--summary <text>", "skill summary (inline material)")
    .option("--json", "output as JSON")
    .action(async (opts: MaterialOptions) =>
      withExtFacade(ctx, async (facade) => {
        const material = await loadMaterial(ctx, opts);
        const proposal = await authoringOf(facade).createSkill(material);
        const result = await authoringOf(facade).test(proposal);
        ctx.stdout.write(opts.json ? `${JSON.stringify(result)}\n` : formatTestResult(result));
        if (!result.passed) process.exitCode = 1;
      }),
    );
}

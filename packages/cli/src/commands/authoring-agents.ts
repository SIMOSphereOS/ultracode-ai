/**
 * `ultracode agents create|evolve|test`
 *
 * Agent authoring commands backed by the facade's `authoring` sub-API
 * (Module B). These extend the existing `agents list` group (registered by
 * `./list.ts`) with proposal-generating subcommands. Generated agents never
 * escalate tool permissions; `persist` is gated behind `--yes`.
 *
 * Material is supplied via `--file <material.json>` or inline
 * `--topic`/`--catalog` flags (same convention as `skills create`).
 */

import path from "node:path";
import process from "node:process";
import { promises as fs } from "node:fs";
import type { Command } from "commander";
import { ValidationError } from "@ultracode/shared";
import type { CliContext } from "../context.js";
import { authoringOf, withExtFacade } from "./ext-helpers.js";
import { formatBlock, formatTestResult } from "./ext-format.js";
import type { AuthoringFacade, AuthoringProposal, KnowledgeMaterial } from "@ultracode/core";

interface AgentMaterialOptions {
  file?: string;
  topic?: string;
  catalog?: string;
  summary?: string;
  yes?: boolean;
  json?: boolean;
}

async function loadMaterial(ctx: CliContext, opts: AgentMaterialOptions): Promise<KnowledgeMaterial> {
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
      "Provide --file <material.json>, or both --topic and --catalog to create agent material inline.",
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

/** Resolve the create/evolve method, failing clearly when core lacks it. */
function agentMethod(
  authoring: AuthoringFacade,
  which: "create" | "evolve",
): (material: KnowledgeMaterial) => AuthoringProposal | Promise<AuthoringProposal> {
  const fn = which === "create" ? authoring.createAgent : authoring.evolveAgent;
  if (typeof fn !== "function") {
    throw new ValidationError(
      `Agent ${which} is not available in this build of @ultracode/core.`,
    );
  }
  return fn.bind(authoring);
}

async function proposeAgent(
  ctx: CliContext,
  which: "create" | "evolve",
  opts: AgentMaterialOptions,
): Promise<void> {
  await withExtFacade(ctx, async (facade) => {
    const authoring = authoringOf(facade);
    const material = await loadMaterial(ctx, opts);
    const proposal = await agentMethod(authoring, which)(material);
    writeProposal(ctx, proposal, opts.json === true);
    if (opts.yes === true) {
      await authoring.persist(proposal, { approved: true });
      if (opts.json !== true) ctx.stdout.write(`✓ agent "${proposal.name}" persisted\n`);
    } else if (opts.json !== true) {
      ctx.stdout.write("Run again with --yes to persist this agent.\n");
    }
  });
}

const materialOptions = (cmd: Command): Command =>
  cmd
    .option("--file <path>", "knowledge material JSON file")
    .option("--topic <topic>", "agent topic (inline material)")
    .option("--catalog <catalog>", "agent catalog (inline material)")
    .option("--summary <text>", "agent summary (inline material)");

/**
 * Register agent-authoring subcommands. Must be called AFTER
 * `registerListCommands` so it attaches to the existing `agents` group.
 */
export function registerAuthoringAgentCommands(program: Command, ctx: CliContext): void {
  const agents =
    program.commands.find((c) => c.name() === "agents") ??
    program.command("agents").description("inspect and author agents");

  materialOptions(
    agents
      .command("create")
      .description("create a new agent from knowledge material (proposal only unless --yes)"),
  )
    .option("--yes", "persist the proposal instead of only printing it")
    .option("--json", "output as JSON")
    .action(async (opts: AgentMaterialOptions) => proposeAgent(ctx, "create", opts));

  materialOptions(
    agents
      .command("evolve")
      .description("evolve an existing agent from new material (proposal only unless --yes)"),
  )
    .option("--yes", "persist the proposal instead of only printing it")
    .option("--json", "output as JSON")
    .action(async (opts: AgentMaterialOptions) => proposeAgent(ctx, "evolve", opts));

  materialOptions(
    agents.command("test").description("test an agent proposal built from material, without persisting"),
  )
    .option("--json", "output as JSON")
    .action(async (opts: AgentMaterialOptions) =>
      withExtFacade(ctx, async (facade) => {
        const authoring = authoringOf(facade);
        const material = await loadMaterial(ctx, opts);
        const proposal = await agentMethod(authoring, "create")(material);
        const result = await authoring.test(proposal);
        ctx.stdout.write(opts.json ? `${JSON.stringify(result)}\n` : formatTestResult(result));
        if (!result.passed) process.exitCode = 1;
      }),
    );
}

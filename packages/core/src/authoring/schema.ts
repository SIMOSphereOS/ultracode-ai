/**
 * Zod schemas for validating authoring artefacts offline.
 *
 * Used by {@link import("./Authoring.js").Authoring.test} to structurally
 * validate a proposed skill or agent before it can be persisted.
 */

import { z } from "zod";

/** Schema for {@link import("./types.js").SkillFrontmatter} + body. */
export const skillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  catalog: z.string().min(1),
  triggers: z.array(z.string().min(1)).min(1),
  tools: z.array(z.string().min(1)).optional(),
  sources: z.array(z.string()),
  status: z.enum(["draft", "active", "deprecated"]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  body: z.string(),
});

/** Schema for {@link AgentDefinition}. */
export const agentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["default", "subagent", "specialized", "custom"]),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  systemPromptId: z.string().min(1).optional(),
  enabledTools: z.array(z.string().min(1)).optional(),
  disabledTools: z.array(z.string().min(1)).optional(),
});

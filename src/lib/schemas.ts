import { z, ZodType } from "zod";

/**
 * @file src/lib/schemas.ts
 * @description Defines Zod schemas for structured data generation by the AI.
 */

export type RouterDecision = {
  decision: "PLAN" | "CODE";
  reason: string;
  next_prompt_input: string;
  templateId?: "react-vite-basic";
  customInstructions?: string;
  packageManager?: "npm" | "pnpm" | "yarn";
};

export const RouterDecisionSchema: ZodType<RouterDecision> = z.object({
  decision: z
    .enum(["PLAN", "CODE"])
    .describe(
      "Based on the user's request and context, decide whether to 'PLAN' first or to 'CODE' directly."
    ),
  reason: z
    .string()
    .describe("A brief, one-sentence justification for your decision."),
  next_prompt_input: z
    .string()
    .describe(
      "The precise input for the next stage. If the decision is 'CODE' because of a plan approval, this MUST be the full text of the approved plan. Otherwise, it should be the user's core instruction."
    ),
  templateId: z
    .enum(["react-vite-basic"])
    .optional()
    .describe(
      "If the user's request clearly matches a known project template, provide its ID here. Otherwise, leave it empty."
    ),
  customInstructions: z
    .string()
    .optional()
    .describe(
      "If a template is matched, extract any additional user requirements that are NOT covered by the template's standard scope into this field. For example, if the request is 'create a beautiful blog', and a 'blog' template is matched, this field should contain 'make it beautiful'."
    ),
  packageManager: z
    .enum(["npm", "pnpm", "yarn"])
    .default("npm")
    .describe(
      "Detect the package manager (npm, pnpm, yarn) from the user's request. Default to 'npm' if not specified."
    ),
});

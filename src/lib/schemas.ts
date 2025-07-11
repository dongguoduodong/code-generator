import { z, ZodType } from "zod";

/**
 * @file src/lib/schemas.ts
 * @description Defines Zod schemas for structured data generation by the AI.
 */

export type RouterDecision = {
  decision: "PLAN" | "CODE";
  reason: string;
  next_prompt_input: string;
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
});

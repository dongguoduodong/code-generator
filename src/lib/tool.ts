import { tool } from "ai";
import { z } from "zod";

export const codeGenerationTools = {
  generate_plan: tool({
    description: `Generate a step-by-step natural language plan for a complex task for the user to review and approve. 
Use this for complex, multi-step, or ambiguous tasks. This includes:
- Initial project creation from scratch.
- Large-scale refactoring.
- Investigating and fixing complex bugs described by the user.
- Implementing new features that likely involve multiple files.`,
    parameters: z.object({
      taskDescription: z
        .string()
        .describe(
          "A concise summary of the complex task that requires a plan."
        ),
    }),
  }),
  generate_code: tool({
    description: `Directly generate the executable XML code for a simple task or for a plan that has already been approved by the user.
Use this for simple, direct, and unambiguous tasks that can be completed in a single step. This includes:
- Minor text or code changes to an existing file.
- Executing a plan that the user has just approved in the previous turn.`,
    parameters: z.object({
      taskDescription: z
        .string()
        .describe(
          "A concise summary of the simple task or the user's approval message."
        ),
      approvedPlan: z
        .array(z.string())
        .optional()
        .describe(
          "The plan that was previously approved by the user, if any. This is crucial for execution."
        ),
    }),
  }),
};

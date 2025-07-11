import type { RenderNode } from "@/types/ai";
import type { ExecutionContext, ExecutionResult } from "@/types/executors";

type TerminalInstruction = Extract<RenderNode, { type: "terminal" }>;
type TerminalExecutionContext = Pick<
  ExecutionContext,
  "webcontainer" | "terminal"
>;

/**
 * 执行终端命令指令。
 * @param instruction - 要执行的终端指令。
 * @param context - 执行所需的依赖。
 * @returns {Promise<ExecutionResult>} 命令成功或失败的结果。
 */
export async function executeTerminalInstruction(
  instruction: TerminalInstruction,
  context: TerminalExecutionContext
): Promise<ExecutionResult> {
  const { webcontainer, terminal } = context;
  const { command } = instruction;

  try {
    const [cmd, ...args] = command.split(/\s+/).filter(Boolean);
    if (!cmd) {
      return { success: true };
    }

    terminal.write(`\r\n\x1b[1;32m$ \x1b[0m${command}\r\n`);
    const process = await webcontainer.spawn(cmd, args);

    let combinedOutput = "";
    process.output.pipeTo(
      new WritableStream({
        write(data) {
          combinedOutput += data;
          terminal.write(data);
        },
      })
    );

    const exitCode = await process.exit;

    if (exitCode !== 0) {
      const errorMessage = `Command failed with exit code ${exitCode}.\n--- OUTPUT ---\n${combinedOutput}`;
      terminal.write(`\r\n\x1b[1;31mError: ${errorMessage}\x1b[0m\r\n`);
      throw new Error(errorMessage);
    }

    terminal.write(
      `\r\n\x1b[1;33mProcess exited with code ${exitCode}\x1b[0m\r\n`
    );
    return { success: true };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`TerminalExecutor failed for command "${command}":`, error);
    return { success: false, error };
  }
}

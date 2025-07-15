import type { WebContainerProcess } from "@webcontainer/api";
import type { Terminal } from "xterm";
import stripAnsi from "strip-ansi";

export interface ProcessErrorCheckOptions {
  regex: RegExp;
  onDetection: (cleanedLog: string) => void;
}

export interface ProcessHandlerOptions {
  terminal?: Terminal;
  errorCheck?: ProcessErrorCheckOptions;
}

export async function handleProcess(
  process: WebContainerProcess,
  options: ProcessHandlerOptions = {}
): Promise<{ exitCode: number; output: string }> {
  let accumulatedOutput = "";
  const { terminal, errorCheck } = options;
  let currentLine = "";

  const processLine = (line: string) => {
    const cleanedLine = stripAnsi(line);
    if (errorCheck && errorCheck.regex.test(cleanedLine)) {
      // 一旦检测到错误行，立即调用回调
      errorCheck.onDetection(cleanedLine);
    }
  };

  process.output.pipeTo(
    new WritableStream({
      write(data) {
        if (terminal) {
          terminal.write(data);
        }
        accumulatedOutput += data;

        const newLines = (currentLine + data).split(/\r\n|\n|\r/);
        currentLine = newLines.pop() || ""; // 最后一部分可能是不完整的行，留待下次处理

        newLines.forEach(processLine);
      },
    })
  );

  const exitCode = await process.exit;

  // 确保最后剩余的行也被处理
  if (currentLine) {
    processLine(currentLine);
  }

  return { exitCode, output: accumulatedOutput };
}

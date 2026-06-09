import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getLogger(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("VSCode Levelups");
  }
  return channel;
}

export function logInfo(message: string): void {
  getLogger().appendLine(`[info] ${message}`);
}

export function logError(message: string): void {
  getLogger().appendLine(`[error] ${message}`);
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = undefined;
}

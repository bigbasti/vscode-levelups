import * as vscode from "vscode";

export interface WatchHandlers {
  onChange: (uri: vscode.Uri) => void;
  onDelete: (uri: vscode.Uri) => void;
}

export function createWatcher(
  glob: string,
  handlers: WatchHandlers
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(glob);
  watcher.onDidCreate(handlers.onChange);
  watcher.onDidChange(handlers.onChange);
  watcher.onDidDelete(handlers.onDelete);
  return watcher;
}

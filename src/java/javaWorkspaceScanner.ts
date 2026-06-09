import * as vscode from "vscode";

export async function findJavaFiles(): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles("**/*.java", "**/node_modules/**");
}

export async function readFile(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString("utf8");
}

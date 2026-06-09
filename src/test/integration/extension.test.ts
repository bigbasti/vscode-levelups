import * as assert from "assert";
import * as vscode from "vscode";

async function openFixture(rel: string): Promise<vscode.TextDocument> {
  const folder = vscode.workspace.workspaceFolders![0].uri;
  const uri = vscode.Uri.joinPath(folder, rel);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  return doc;
}

async function waitForCommand(
  command: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cmds = await vscode.commands.getCommands(true);
    if (cmds.includes(command)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

describe("Integration", () => {
  it("activates and registers executeSql command", async () => {
    // Opening a java fixture triggers the onLanguage:java / workspaceContains
    // activation events. Activation (and command registration) is async, so
    // poll until the command appears rather than asserting immediately.
    await openFixture("src/UseValue.java");
    const found = await waitForCommand("vscodeLevelups.executeSql", 10000);
    assert.ok(found, "vscodeLevelups.executeSql command was not registered");
  });

  it("navigates @Value property to definition", async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const doc = await openFixture("src/UseValue.java");
    const text = doc.getText();
    const offset = text.indexOf("retry");
    const pos = doc.positionAt(offset);
    const defs = (await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      doc.uri,
      pos
    )) as vscode.Location[];
    assert.ok(defs && defs.length >= 1);
    assert.ok(defs[0].uri.fsPath.endsWith("application.properties"));
  });

  it("navigates a Liquibase <include file> to the referenced file", async () => {
    const doc = await openFixture("master.xml");
    const text = doc.getText();
    const offset = text.indexOf("changelogs/child.xml");
    const pos = doc.positionAt(offset);
    const defs = (await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      doc.uri,
      pos
    )) as (vscode.Location | vscode.LocationLink)[];
    assert.ok(defs && defs.length >= 1, "expected a definition for the include");
    const first = defs[0] as vscode.Location & vscode.LocationLink;
    const targetPath = (first.targetUri ?? first.uri).fsPath;
    assert.ok(
      targetPath.endsWith("changelogs/child.xml"),
      `expected child.xml, got ${targetPath}`
    );
  });

  it("navigates @Qualifier to the bean definition", async () => {
    const doc = await openFixture("src/BatchConfig.java");
    const text = doc.getText();
    const offset = text.indexOf('@Qualifier("tamTkg46NeLiItemWriter")') +
      '@Qualifier("'.length + 3;
    const pos = doc.positionAt(offset);
    const defs = (await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      doc.uri,
      pos
    )) as (vscode.Location | vscode.LocationLink)[];
    assert.ok(defs && defs.length >= 1, "expected a definition for @Qualifier");
    const first = defs[0] as vscode.Location & vscode.LocationLink;
    const targetPath = (first.targetUri ?? first.uri).fsPath;
    assert.ok(targetPath.endsWith("BatchConfig.java"), targetPath);
  });

  it("navigates jobParameters['KEY'] to where it is set", async () => {
    const doc = await openFixture("src/BatchConfig.java");
    const text = doc.getText();
    // The @Value reference (second occurrence), not the addString definition.
    const valueRef = text.indexOf(
      "#{jobParameters['MQ_MESSAGE_INCOMING.ID']}"
    );
    const offset = text.indexOf("MQ_MESSAGE_INCOMING.ID", valueRef);
    const pos = doc.positionAt(offset);
    const defs = (await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      doc.uri,
      pos
    )) as (vscode.Location | vscode.LocationLink)[];
    assert.ok(defs && defs.length >= 1, "expected a job-parameter definition");
    const first = defs[0] as vscode.Location & vscode.LocationLink;
    const targetRange = (first.targetRange ?? (first as vscode.Location).range);
    // The set-location is the addString("MQ_MESSAGE_INCOMING.ID", ...) line.
    const setLine = doc.positionAt(text.indexOf('.addString("MQ_MESSAGE_INCOMING.ID"')).line;
    assert.strictEqual(targetRange.start.line, setLine);
  });
});

import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");
    // Fixtures are not compiled by tsc (they are .java/.xml/.properties), so
    // they never land in out/. Point at the source location directly.
    const fixtures = path.resolve(__dirname, "../../src/test/fixtures");
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [fixtures, "--disable-extensions"],
    });
  } catch (err) {
    console.error("Integration tests failed", err);
    process.exit(1);
  }
}

main();

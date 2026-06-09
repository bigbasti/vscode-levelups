import type * as vscode from "vscode";
import { JobParameterIndex } from "./jobParameterIndex";

export interface JobParameterReference {
  key: string;
  start: number; // document offset of the key's first character
  end: number; // document offset just past the key's last character
}

// Matches jobParameters['KEY'] or jobParameters["KEY"] (as used in SpEL
// "#{jobParameters['KEY']}"). Double quotes embedded in a Java string literal
// appear escaped (\"), so an optional backslash before each quote is allowed.
// The quote char is captured to match the closing quote, and the key allows
// dots (e.g. MQ_MESSAGE_INCOMING.ID).
const JOB_PARAM_RE = /jobParameters\s*\[\s*\\?(['"])([^'"\\]*)\\?\1\s*\]/g;

/**
 * If `offset` is inside a jobParameters['KEY'] access, return the key and its
 * range. Pure: no vscode access.
 */
export function extractJobParameterKeyAt(
  text: string,
  offset: number
): JobParameterReference | undefined {
  JOB_PARAM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = JOB_PARAM_RE.exec(text)) !== null) {
    const quote = m[1];
    const key = m[2];
    const start = m.index + m[0].indexOf(quote) + 1;
    const end = start + key.length;
    if (offset >= start && offset <= end) {
      return { key, start, end };
    }
  }
  return undefined;
}

/**
 * Navigates from @Value("#{jobParameters['KEY']}") to the location(s) where the
 * job parameter KEY is set via a JobParametersBuilder.
 */
export class JobParameterDefinitionProvider
  implements vscode.DefinitionProvider
{
  constructor(private readonly index: JobParameterIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.LocationLink[] | undefined {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vs: typeof import("vscode") = require("vscode");

    const text = document.getText();
    const offset = document.offsetAt(position);
    const ref = extractJobParameterKeyAt(text, offset);
    if (!ref) return undefined;

    const locs = this.index.get(ref.key);
    if (!locs.length) return undefined;

    const originSelectionRange = new vs.Range(
      document.positionAt(ref.start),
      document.positionAt(ref.end)
    );

    return locs.map((l) => {
      const pos = new vs.Position(l.line, l.column);
      return {
        originSelectionRange,
        targetUri: vs.Uri.file(l.filePath),
        targetRange: new vs.Range(pos, pos),
      };
    });
  }
}

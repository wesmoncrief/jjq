import { ChangeNode, ChangePrefixes, PrefixOnly } from "./graph";
import { JJ } from "./jj";
import { MONO_MAP } from "./mono";

export async function scrapePrefixes(
  changes: Set<ChangeNode>,
  jj: JJ
): Promise<(ChangePrefixes | PrefixOnly)[]> {
  const revisions = new Array(...changes).map((c) => c.changeId).join("|");
  const template = `'change_id.shortest() ++ "\n\n"'`;
  // debug query:
  // jj log --revisions "rt|qx|mn|ln|z|wz|lm|s|qqlu|qy|kl|kx|wv|qn|vl|vl" --template 'change_id.short() ++ "\n\n"' --no-pager
  const { stdout } = await jj.exec([
    "log",
    "--revisions",
    `"${revisions}"`,
    "--template",
    template,
  ]);
  const givenLines = stdout.split("\n");
  const prefixes = new Array<ChangePrefixes | PrefixOnly>();
  const changeIds = new Set<string>();
  changes.forEach((c) => changeIds.add(c.changeId));
  const doesLineHaveAChangeId = (line: string): string | null => {
    const spl = line.split(" ");
    const changeId = spl[spl.length - 1];
    if (changeIds.has(changeId)) {
      return changeId;
    }
    return null;
  };
  for (let i = 0; i < givenLines.length; ++i) {
    const line = givenLines[i];

    const changeId = doesLineHaveAChangeId(line);
    if (!changeId) {
      prefixes.push({
        prefix: toMonoNonChangeLine(line),
        isPrefixOnlyLine: true,
      });
      continue;
    }
    const prefix = toMono(line.substring(0, line.length - changeId.length - 1));
    const lineBelow = toMonoNonChangeLine(givenLines[i + 1]);
    prefixes.push({
      changeId,
      prefix,
      lineBelow,
      isPrefixOnlyLine: false,
    });
    ++i;
  }
  return prefixes;
}

function toMonoNonChangeLine(s: string): string {
  const elidedIndex = s.indexOf("(elided revisions");
  if (elidedIndex === -1) {
    return toMono(s);
  }
  return toMono(s.substring(0, elidedIndex)) + s.substring(elidedIndex);
}

function toMono(s: string): string {
  let mono = "";
  for (let i = 0; i < s.length; ++i) {
    const char = s[i];
    const monoChar = MONO_MAP[char];
    if (monoChar === undefined) {
      console.error("missing mono char:", char);
    }
    mono += monoChar ?? char;
  }
  return mono;
}

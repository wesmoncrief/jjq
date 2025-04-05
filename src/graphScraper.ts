import { ChangePrefixes, PrefixOnly } from "./graph";
import { JJ } from "./jj";
import { MONO_MAP } from "./mono";

const alphabet = "abcdefghijklmnopqrstuvwxyz";
if (alphabet.length !== 26) {
  throw new Error("oop");
}
const alphabetSet = new Set();
for (let i = 0; i < 26; ++i) {
  alphabetSet.add(alphabet[i]);
}

export async function scrapePrefixes(
  jj: JJ
): Promise<(ChangePrefixes | PrefixOnly)[]> {
  const template = `'change_id.shortest() ++ "\n\n"'`;
  const { stdout } = await jj.exec([
    "log",
    // "-r",
    // '"::"',
    "--limit", 
    "500",
    "--template",
    template,
  ]);
  const givenLines = stdout.split("\n");
  givenLines.pop();
  const prefixes = new Array<ChangePrefixes | PrefixOnly>();

  const doesLineHaveAChangeId = (line: string): string | null => {
    const spl = line.split(" ");
    const lastSplit = spl[spl.length - 1];
    for (let i = 0; i < lastSplit.length; ++i) {
      if (!alphabetSet.has(lastSplit[i])) {
        return null;
      }
    }
    return lastSplit;
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

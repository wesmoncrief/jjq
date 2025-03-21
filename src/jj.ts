import ChildProcess from "child_process";
// import spawn from "cross-spawn";
import { promisify } from "util";

export interface Change {
  changeId: string;
  changeMessage: string;
  isEmpty: 'true' | 'false';
  // some things to add: isconflicted, diverges from remote, bookmarks on it, git SHA
}

const changeTemplate = {
  changeId: "change_id.shortest()",
  changeMessage: "description",
  isEmpty: "empty",
};

// todo
const cwd = "/Users/wes/dev/jj-demo-repo";

export async function log(): Promise<Change[]> {
  const separator = "jjqseparator";
  const endEntry = "jjqend";
  const template = `'${Object.values(changeTemplate).join(
    `++ "${separator}" ++`
  )} ++ "${endEntry}"'`;
  const { stdout } = await execArgs(["log", "-T", template, "--no-graph"], cwd);

  const strSplit = stdout.split(endEntry);
  strSplit.pop(); // last item is empty string
  const logs: Change[] = strSplit.map((l) => {
    const spl = l.split(separator);
    const change = {} as any;
    let i = 0;
    for (const key of Object.keys(changeTemplate)) {
      change[key] = spl[i].trimEnd();
      i += 1;
    }
    return change;
  });
  return logs;
}

export async function edit(r: string): Promise<void> {
  await execArgs(["edit", "-r", r], cwd);
}

export async function newChange(r: string): Promise<void> {
  await execArgs(["new", "-r", r], cwd);
}

export async function squash(r: string): Promise<void> {
  await execArgs(["squash", "-r", r], cwd);
}

export async function abandon(r: string): Promise<void> {
  await execArgs(["abandon", "-r", r], cwd);
}

const exec = promisify(ChildProcess.exec);
const execArgs = (args: string[], cwd: string) => {
  const cmd = args.join(" ");
  return exec("jj " + cmd, { cwd });
};

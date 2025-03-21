import ChildProcess from "child_process";
// import spawn from "cross-spawn";
import { promisify } from "util";

export interface Change {
  changeId: string;
  description: string;
  // some thinngs to add: isconflicted, diverges from remote, bookmarks on it, git SHA
}

// todo
const cwd = "/Users/wes/dev/jj-demo-repo";

export async function log(): Promise<Change[]> {
  const separator = "jjqseparator";
  const template = `"change_id.shortest() ++ '${separator}' ++ description"`;
  const { stdout } = await execArgs(["log", "-T", template, "--no-graph"], cwd);

  const strSplit = stdout.split("\n");
  const logs: Change[] = strSplit.map((l) => {
    const spl = l.split(separator);
    return {
      changeId: spl[0],
      description: spl[1],
    };
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


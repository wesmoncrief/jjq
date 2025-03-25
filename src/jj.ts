import ChildProcess from "child_process";
import { promisify } from "util";

const LOG_LIMIT = 20;

export interface Change {
  changeId: string;
  changeMessage: string;
  isEmpty: boolean;
  parents: string[]; // shortest changeId
  localBookmarks: string[];
  remoteBookmarks: string[];
  isImmutable: boolean;
  conflict: boolean;
}

// keep in sync with changeTemplate
interface RawChange {
  changeId: string;
  changeMessage: string;
  isEmpty: string;
  parents: string; // shortest changeId
  bookmarks: string;
  immutable: string;
  conflict: string;
}

const inFieldSeparator1 = "_jjq_";
const inFieldSeparator2 = "_jjq2_";
// doesn't really inherit logically, but should match types
const changeTemplate: RawChange = {
  changeId: "change_id.shortest()",
  changeMessage: "description",
  isEmpty: "empty",
  parents: `parents.map(|c| c.change_id().shortest()).join("${inFieldSeparator1}")`,
  bookmarks: `remote_bookmarks.map(|c| c.name() ++ "${inFieldSeparator2}" ++ c.remote()).join("${inFieldSeparator1}")`,
  immutable: "immutable",
  conflict: "conflict",
};
export const endEntry = "jjqend";

export class JJ {
  rootLocation: string;

  constructor(rootLocation: string) {
    this.rootLocation = rootLocation;
  }

  public async exec(args: string[]): Promise<ExecResult> {
    return await execArgs(args, this.rootLocation);
  }

  public async log(revisions?: string, limit?: number): Promise<Change[]> {
    /*
the default log template is 'present(@) | ancestors(immutable_heads().., 2) | present(trunk())
log search language spec: jj help -k revsets
*/
    const separator = "jjqseparator";
    const template = `'${Object.values(changeTemplate).join(
      `++ "${separator}" ++`
    )} ++ "${endEntry}"'`;
    const revsetArgs = revisions ? ["-r", `"${revisions}"`] : [];
    const limits = limit ? ["--limit", limit.toString()] : [];
    const { stdout } = await execArgs(
      [
        "log",
        ...revsetArgs,
        "--template",
        template,
        ...limits,
        "--no-graph",
      ],
      this.rootLocation
    );

    const strSplit = stdout.split(endEntry);
    strSplit.pop(); // last item is empty string
    const rawChanges: RawChange[] = strSplit.map((l) => {
      const spl = l.split(separator);
      const change = {} as any;
      let i = 0;
      for (const key of Object.keys(changeTemplate)) {
        change[key] = spl[i].trimEnd();
        i += 1;
      }
      return change;
    });
    const changes = rawChanges.map((c) => {
      const remoteBookmarksWithDupes =
        c.bookmarks.split(inFieldSeparator1);
      const allBookmarks = remoteBookmarksWithDupes.map((b) => {
        if (!b) {
          return { name: "", remote: "" };
        }
        const [name, remote] = b.split(inFieldSeparator2);
        return { name, remote };
      });

      const localBookmarks = allBookmarks
        .filter((x) => x.remote === "git")
        .map((x) => x.name);
      const remoteBookmarks = allBookmarks
        .filter((x) => x.remote === "origin")
        .map((x) => x.name);

      const change: Change = {
        changeId: c.changeId,
        changeMessage: c.changeMessage,
        isEmpty: c.isEmpty === "true",
        parents: c.parents.split(inFieldSeparator1),
        localBookmarks: localBookmarks,
        remoteBookmarks: remoteBookmarks,
        isImmutable: c.immutable === "true",
        conflict: c.conflict === "true",
      };
      return change;
    });
    return changes;
  }

  async newChange(r: string): Promise<ExecResult> {
    return await execArgs(["new", r], this.rootLocation);
  }

  async listBookmarks(): Promise<string[]> {
    const template = `'name ++ "${endEntry}"'`;
    const { stdout } = await execArgs(
      ["bookmark", "list", "--template", template],
      this.rootLocation
    );
    const bookmarks = stdout.split(endEntry);
    bookmarks.pop();
    return bookmarks;
  }
  async setBookmark(r: string, bookmark: string): Promise<ExecResult> {
    return await execArgs(
      ["bookmark", "set", `"${bookmark}"`, "-r", r, "--allow-backwards"],
      this.rootLocation
    );
  }

  async deleteBookmark(r: string, bookmark: string): Promise<ExecResult> {
    return await execArgs(
      ["bookmark", "delete", `"${bookmark}"`],
      this.rootLocation
    );
  }

  async pushBookmark(r: string, bookmark: string): Promise<ExecResult> {
    return await execArgs(
      ["git", "push", "--bookmark", `"${bookmark}"`, "--allow-new"],
      this.rootLocation
    );
  }

  async describe(r: string, message: string): Promise<ExecResult> {
    return await execArgs(
      ["describe", "-r", r, "--message", `"${message}"`],
      this.rootLocation
    );
  }

  async edit(r: string): Promise<ExecResult> {
    return await execArgs(["edit", "-r", r], this.rootLocation);
  }

  async squash(r: string): Promise<ExecResult> {
    return await execArgs(["squash", "-r", r], this.rootLocation);
  }

  async abandon(r: string): Promise<ExecResult> {
    return await execArgs(["abandon", "-r", r], this.rootLocation);
  }

  async after(r: string): Promise<ExecResult> {
    return await execArgs(["new", "--after", r], this.rootLocation);
  }

  async before(r: string): Promise<ExecResult> {
    return await execArgs(["new", "--before", r], this.rootLocation);
  }
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

const exec = promisify(ChildProcess.exec);
const execArgs = (args: string[], cwd: string): Promise<ExecResult> => {
  const cmd = args.join(" ");
  return exec("jj " + cmd, { cwd });
};

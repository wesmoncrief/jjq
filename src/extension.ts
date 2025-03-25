// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Change, JJ } from "./jj";
import { Mono } from "./mono";
import { ChangePrefixes, PrefixOnly } from "./graph";
import { clearRepositoryRoot, getRepositoryRoot } from "./repositoryFinder";
import { showMessageWithTimeout } from "./showMessageWithTimeout";
import { scrapePrefixes } from "./scrape_graph";

export function activate(context: vscode.ExtensionContext) {
  const monoTest = vscode.commands.registerCommand("jjq.monoTest", async () => {
    const items = Object.values(Mono).map((c) => {
      return {
        label: c.repeat(10) + "x",
        description: c.repeat(10) + "x",
        detail: c.repeat(10) + "x",
      };
    });
    await vscode.window.showQuickPick(items, {
      placeHolder: "Select a change",
    });
  });

  context.subscriptions.push(monoTest);

  const demoChangesQuickPick = vscode.commands.registerCommand(
    "jjq.demoRepoTest",
    async () => {
      const rawItems = [
        [Mono.dot, Mono.w, "p"],
        [Mono.vertical],
        [Mono.vertical, Mono.w, Mono.hollowDot, Mono.w, "s"],
        [Mono.train3, Mono.horizontal, Mono.train4],
        [Mono.vertical, Mono.w, Mono.hollowDot, Mono.w, "w"],
        [Mono.vertical, Mono.w, Mono.vertical],
        [
          Mono.vertical,
          Mono.w,
          Mono.vertical,
          Mono.w,
          Mono.hollowDot,
          Mono.w,
          "l",
        ],
        [Mono.vertical, Mono.w, Mono.vertical, Mono.w, Mono.vertical],
        [
          Mono.vertical,
          Mono.w,
          Mono.vertical,
          Mono.w,
          Mono.hollowDot,
          Mono.w,
          "o",
        ],
        [
          Mono.vertical,
          Mono.w,
          Mono.train3,
          Mono.horizontal,
          Mono.cornerBottomRight,
        ],
        [
          Mono.vertical,
          Mono.w,
          Mono.vertical,
          Mono.w,
          Mono.hollowDot,
          Mono.w,
          "u",
        ],
        [
          Mono.vertical,
          Mono.horizontal,
          Mono.horizontal,
          Mono.horizontal,
          Mono.cornerBottomRight,
        ],
        [Mono.hollowDot, Mono.w, Mono.vertical, Mono.w, "k"],
        [Mono.train3, Mono.horizontal, Mono.cornerBottomRight],
        [Mono.hollowDot, Mono.w, "t"],
      ];
      const stringJoin = (xs: string[]) => {
        let ans = "";
        for (const x of xs) {
          ans = ans + x;
        }
        return ans;
      };

      const alphabetSet = new Set("abcdefghijklmnopqrstuvwxyz".split(""));
      const items = rawItems.map((m) => {
        const description = alphabetSet.has(m[m.length - 1])
          ? "some details about it"
          : undefined;
        return {
          label: stringJoin(m),
          description,
        };
      });

      const detailedItems = [];
      for (let i = 0; i + 1 < items.length; i += 2) {
        detailedItems.push({
          label: items[i].label,
          description: items[i].description,
          detail: items[i + 1].label,
        });
      }
      await vscode.window.showQuickPick(detailedItems, {
        placeHolder: "Select a change",
      });
    }
  );

  context.subscriptions.push(demoChangesQuickPick);
  /* todos 
  - write logs to the extension log destination
  - support immutable revisions, root revision, 'diverges from remote (for bookmark)', conflict marker
  - add a commit hash/message bar at the very bottom
  - better interaction handling in commit picker
    - on typing a letter, clear our the graph prefixes
    - short/full commit distinction
    - better sorting (it should not do fuzzy searching, but it does)
    - allow searching by commit name/bookmark
    - immediately reload the quickpick, and asynchronously let the repo updates happen
    - probably want a single quickPick instance?
  - between UI screens, propogate the chosen commit (hash+message) as the title
  - first, pull the log with graph. then, get the detail log for each of those revisions. Gives better results b/c of topological sorting from the with-graph command.
  - maybe a separate screen just for bookmarks?
  - don't re-build the graph when just changing the 'edit' - a bit nicer b/c the rebuild can be jarring if a lot change
  */

  const setRepository = vscode.commands.registerCommand(
    "jjq.setRepository",
    async () => {
      await clearRepositoryRoot(context);
      await getRepositoryRoot(context);
    }
  );
  context.subscriptions.push(setRepository);

  const changesQuickPick = vscode.commands.registerCommand(
    "jjq.changes",
    async () => {
      await showRevisions(context);
    }
  );

  context.subscriptions.push(changesQuickPick);
}

async function showRevisions(context: vscode.ExtensionContext) {
  const repoRoot = await getRepositoryRoot(context);
  if (!repoRoot) {
    vscode.window.showErrorMessage("Could not load repository root location");
    return;
  }
  const jj = new JJ(repoRoot);
  let currentHead = (await jj.log("@"))[0].changeId;
  let ungraphedLogs = await jj.log();
  const changeNodes = ungraphedLogs.map((x) => ({
    ...x,
    isHead: x.changeId === currentHead,
  }));
  const prefixes = await scrapePrefixes(new Set(changeNodes), jj);
  const itemFullData: ((Change & ChangePrefixes) | PrefixOnly)[] = prefixes.map(
    (p) => {
      if (p.isPrefixOnlyLine === true) {
        return p;
      }
      return {
        ...p,
        ...changeNodes.find((x) => x.changeId === p.changeId)!,
      };
    }
  );
  const headLog = itemFullData.find(
    (x) => "changeId" in x && x.changeId === currentHead
  ) as Change & ChangePrefixes;

  const quickPickLabelToRevision: { [key: string]: string } = {};
  const items: vscode.QuickPickItem[] = [];
  const headItem = createQuickPickLogItem(headLog!);
  const headItemLabel = "===> @ " + headLog!.changeId;
  items.push({
    ...headItem,
    label: headItemLabel,
    detail: undefined,
  });
  quickPickLabelToRevision[headItemLabel] = headLog?.changeId!;
  items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
  for (const l of itemFullData) {
    if (l.isPrefixOnlyLine) {
      items.push(createQuickPickPrefixOnlyItem(l));
    } else {
      const qpi = createQuickPickLogItem(l);
      items.push(qpi);
      quickPickLabelToRevision[qpi.label] = l.changeId;
    }
  }

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a revision",
  });

  if (selection) {
    const chosenRevisionId = quickPickLabelToRevision[selection.label];
    const chosenRevisionLog = changeNodes.find(
      (x) => x.changeId === chosenRevisionId
    )!;

    const actions = [
      { label: "n", description: "new" },
      { label: "e", description: "edit" },
      { label: "b", description: "bookmarks" },
      { label: "d", description: "describe" },
      { label: "s", description: "squash" },
      { label: "a", description: "abandon" },
      { label: "A", description: "After" },
      { label: "B", description: "before" },
      { label: "D", description: "diff" },
    ];

    const action = await showQuickerPick(actions);
    if (action) {
      const completedScreens = await handleRevisionAction(
        action.description!,
        jj,
        chosenRevisionLog
      );
      if (completedScreens) {
        return showRevisions(context);
      }
    }
  }
}

function showQuickerPick(
  items: vscode.QuickPickItem[],
  opts?: {
    placeholder?: string;
    title?: string;
  }
): Promise<vscode.QuickPickItem | undefined> {
  const qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
  qp.items = items;
  qp.title = opts?.title;
  qp.placeholder = opts?.placeholder;
  const result: Promise<vscode.QuickPickItem> = new Promise(
    (resolve, reject) => {
      qp.onDidChangeValue(async (e) => {
        const selection = items.filter((x) => x.label === e)[0];
        qp.hide();
        resolve(selection);
      });
      qp.onDidAccept((i) => {
        qp.hide();
        resolve(qp.selectedItems[0]);
      });
    }
  );
  qp.show();
  return result;
}

async function handleBookmarkRevisionAction(
  jj: JJ,
  chosenRevisionLog: Change
): Promise<boolean> {
  const actionItem = await showQuickerPick([
    { label: "d", description: "delete" },
    { label: "p", description: "push" },
    { label: "s", description: "set" },
  ]);
  const action = actionItem?.description;
  switch (action) {
    case "delete": {
      const bookmarksAtRevisionLabels = chosenRevisionLog.localBookmarks.map(
        (x) => ({
          label: x,
        })
      );
      const bookmarkToDelete = await vscode.window.showQuickPick(
        bookmarksAtRevisionLabels
      );
      if (!bookmarkToDelete) {
        return false;
      }
      await jj.deleteBookmark(
        chosenRevisionLog.changeId,
        bookmarkToDelete.label
      );
      showMessageWithTimeout(`Deleted bookmark: ${bookmarkToDelete.label}`);
      return true;
    }
    case "push": {
      const bookmarksAtRevisionLabels = chosenRevisionLog.localBookmarks.map(
        (x) => ({
          label: x,
        })
      );
      const bookmark = await vscode.window.showQuickPick(
        bookmarksAtRevisionLabels
      );
      if (!bookmark) {
        return false;
      }
      await jj.pushBookmark(chosenRevisionLog.changeId, bookmark.label);
      showMessageWithTimeout(`Pushed bookmark: ${bookmark.label}`);
    }
    case "set": {
      const newBookmarkLabel = "New Bookmark";
      const existingBookmarks = await jj.listBookmarks();
      const bookmarkItems: vscode.QuickPickItem[] = [
        { label: newBookmarkLabel },
        { label: "", kind: vscode.QuickPickItemKind.Separator },
        ...existingBookmarks.map((x) => ({
          label: x,
        })),
      ];
      const chosenBookmark = await vscode.window.showQuickPick(bookmarkItems);
      if (!chosenBookmark) {
        break;
      }
      let bookmark: string | undefined;
      if (chosenBookmark.label === newBookmarkLabel) {
        const newBookmark = await vscode.window.showInputBox({
          title: "New bookmark",
        });
        bookmark = newBookmark;
      } else {
        bookmark = chosenBookmark.label;
      }
      if (!bookmark) {
        // backout
        return false;
      }
      const msg = await jj.setBookmark(chosenRevisionLog.changeId, bookmark);
      showMessageWithTimeout(msg.stderr);

      const pushBookmark = (
        await showQuickerPick(
          [
            { label: "y" },
            {
              label: "n",
            },
          ],
          {
            placeholder: "Push bookmark to origin?",
            title: "Push bookmark to origin?",
          }
        )
      )?.label;
      if (pushBookmark === "y") {
        await jj.pushBookmark(chosenRevisionLog.changeId, bookmark);
        showMessageWithTimeout("Pushed bookmark: " + bookmark);
        return true;
      }
      if (pushBookmark === "n") {
        return true;
      }

      return false;
    }
  }
  return false;
}

// returns 'true' if the revision selector should be called again
async function handleRevisionAction(
  action: string,
  jj: JJ,
  chosenRevisionLog: Change
): Promise<boolean> {
  switch (action) {
    case "edit": {
      const msg = await jj.edit(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "diff": {
      // vscode.commands.executeCommand("vscode.diff", uri1, uri2)
      throw new Error("nyi");
      break;
    }
    case "bookmarks": {
      return await handleBookmarkRevisionAction(jj, chosenRevisionLog);
    }
    case "new": {
      const msg = await jj.newChange(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "before": {
      const msg = await jj.before(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "After": {
      const msg = await jj.after(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "abandon": {
      const msg = await jj.abandon(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "squash": {
      const msg = await jj.squash(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "describe": {
      return await handleDescribe(chosenRevisionLog, jj);
    }
    case "show": {
      // opens code window with extra details
      throw new Error("nyi");
    }
  }
  throw new Error("nyi: " + action);
}

async function handleDescribe(change: Change, jj: JJ): Promise<boolean> {
  const message = await vscode.window.showInputBox({
    title: "Describe revision " + change.changeId,
    value: change.changeMessage,
  });
  if (message === undefined) {
    return false; // backout
  }
  await jj.describe(change.changeId, message);
  return true;
}
function createQuickPickPrefixOnlyItem(p: PrefixOnly): vscode.QuickPickItem {
  return {
    label: p.prefix,
  };
}

function createQuickPickLogItem(
  l: Change & ChangePrefixes
): vscode.QuickPickItem {
  const emptyNotice = l.isEmpty ? "(empty) " : "";
  const changeMessage =
    l.changeMessage === "" ? "(no description set)" : l.changeMessage;
  const description = emptyNotice + changeMessage;
  const bookmarks = [
    ...l.localBookmarks,
    ...l.remoteBookmarks.map((b) => b + "@origin"),
  ].join(Mono.w);
  return {
    label: l.prefix + Mono.w + l.changeId,
    description: description,
    detail: l.lineBelow + Mono.w + Mono.w + bookmarks,
  };
}

function zipIntersection<A, B>(a: A[], b: B[]): (A & B)[] {
  return a.map((val, idx) => Object.assign({}, val, b[idx]));
}

// This method is called when your extension is deactivated
export function deactivate() {}

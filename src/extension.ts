// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Change, JJ } from "./jj";
import { Mono } from "./mono";
import { ChangePrefixes, PrefixOnly } from "./graph";
import { clearRepositoryRoot, getRepositoryRoot } from "./repositoryFinder";
import { showMessageWithTimeout } from "./showMessageWithTimeout";
import { JJFileSystemProvider } from "./jjFileSystem";
import { revisionsUI } from "./showRevisions";
import { showQuickerPick } from "./showQuickerPick";

let _extensionContext: vscode.ExtensionContext;

/* todos 
  - write logs to the extension log destination
  - add a commit hash/message bar at the very bottom
  - support for opening pull requests
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
  - support 'diverges from remote' type bookmark conflict?
  */
export function activate(context: vscode.ExtensionContext) {
  _extensionContext = context;
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

  const setRepository = vscode.commands.registerCommand(
    "jjq.setRepository",
    async () => {
      await clearRepositoryRoot(context);
      await getRepositoryRoot(context);
    }
  );
  context.subscriptions.push(setRepository);

  const changesCommandId = "jjq.changes";

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.command = changesCommandId;
  context.subscriptions.push(statusBar);

  // update status bar item once at start
  statusBar.text = "test one two three four";
  statusBar.show();
  const changesQuickPick = vscode.commands.registerCommand(
    changesCommandId,
    async () => {
      await setStatusBar(context, statusBar);
      await revisionsUI(context);
      await setStatusBar(context, statusBar);
    }
  );

  setStatusBar(context, statusBar);
  context.subscriptions.push(changesQuickPick);

  const jjFileSystemProvider = new JJFileSystemProvider(context);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "jj",
      jjFileSystemProvider
    )
  );
}

async function setStatusBar(
  context: vscode.ExtensionContext,
  statusBar: vscode.StatusBarItem
) {
  const repoRoot = await getRepositoryRoot(context);
  if (!repoRoot) {
    vscode.window.showErrorMessage("Could not load repository root location");
    return;
  }
  const jj = new JJ(repoRoot);
  const currentHead = (await jj.log("@"))[0];
  const bookmark = currentHead.localBookmarks[0];
  const statusBarText = `${currentHead.changeId} ${
    bookmark ?? currentHead.changeMessage
  }`;
  statusBar.text = statusBarText;
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
export async function handleRevisionAction(
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
      // Get the current working directory files
      const file = "README.md";

      const currentUri = vscode.Uri.file(`${jj.rootLocation}/${file}`);

      // Create a URI for the selected revision's version using the revisionId
      const revisionUri = currentUri.with({
        scheme: "jj",
        query: chosenRevisionLog.changeId,
      });

      await vscode.commands.executeCommand(
        "vscode.diff",
        revisionUri,
        currentUri,
        `this is my changes`
      );

      return false; // Don't reshow the revision selector
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
export function createQuickPickPrefixOnlyItem(
  p: PrefixOnly
): vscode.QuickPickItem {
  return {
    label: p.prefix,
  };
}

export function createQuickPickLogItem(
  l: Change & ChangePrefixes
): vscode.QuickPickItem {
  const emptyNotice = l.isEmpty ? "(empty) " : "";
  const changeMessage =
    l.changeMessage === "" ? "(no description set)" : l.changeMessage;
  const conflictNotice = l.conflict ? " (conflicted) " : "";
  const description = conflictNotice + emptyNotice + changeMessage;
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

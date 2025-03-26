// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { JJ } from "./jj";
import { Mono } from "./mono";
import { clearRepositoryRoot, getRepositoryRoot } from "./repositoryFinder";
import { JJFileSystemProvider } from "./jjFileSystem";
import { revisionsUI } from "./showRevisions";

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

// This method is called when your extension is deactivated
export function deactivate() {}

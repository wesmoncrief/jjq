// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { JJ } from "./jj";
import { Mono } from "./mono";
import { clearRepositoryRoot, getRepositoryRoot } from "./repositoryFinder";
import { JJFileSystemProvider, JJQ_URI_SCHEME } from "./jjFileSystem";
import { generateFriendlyNames, revisionsUI } from "./revisionsUI";

let _extensionContext: vscode.ExtensionContext;

export async function activate(context: vscode.ExtensionContext) {
  _extensionContext = context;
  const monoTest = vscode.commands.registerCommand("jjq.monoTest", async () => {
    const items = Object.values(Mono).map((c) => {
      return {
        label: c.repeat(10) + " x",
        detail: " "
      };
    });
    await vscode.window.showQuickPick(items);
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

  const jjFileSystemProvider = new JJFileSystemProvider(context);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      JJQ_URI_SCHEME,
      jjFileSystemProvider
    )
  );

  const changesCommandId = "jjq.changes";

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100_000
  );
  statusBar.command = changesCommandId;
  context.subscriptions.push(statusBar);

  const changesQuickPick = vscode.commands.registerCommand(
    changesCommandId,
    async () => {
      await setStatusBar(context, statusBar);
      await revisionsUI(context);
      await setStatusBar(context, statusBar);
    }
  );
  context.subscriptions.push(changesQuickPick);

  await setStatusBar(context, statusBar);
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
  const statusBarText = generateFriendlyNames(
    currentHead,
    30
  ).changeIdAndDescription;
  statusBar.text = statusBarText;
  statusBar.show();
}

// This method is called when your extension is deactivated
export function deactivate() {}

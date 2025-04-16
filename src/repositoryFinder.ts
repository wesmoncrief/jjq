import * as vscode from "vscode";

const REPO_KEY = "repo_cwd";

export async function clearRepositoryRoot(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.workspaceState.update(REPO_KEY, undefined);
  return;
}

export async function getRepositoryRoot(
  context: vscode.ExtensionContext,
  args: {
    shouldAskIfNotKnown: boolean;
  }
): Promise<string | null> {
  const repo_cwd = context.workspaceState.get(REPO_KEY);
  if (repo_cwd) {
    return repo_cwd as string;
  }
  if (vscode.workspace.workspaceFolders?.length === 1) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }
  if (args.shouldAskIfNotKnown) {
    const input = await vscode.window.showInputBox({
      title: "JJ repository location",
      prompt: "Enter an absolute path for the JJ repository location",
      ignoreFocusOut: true,
    });
    if (!input) {
      return null;
    }
    context.workspaceState.update(REPO_KEY, input);
    return input;
  }
  return null;
}

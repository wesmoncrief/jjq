import * as vscode from "vscode";

const REPO_KEY = "repo_cwd";

export async function getRepositoryRoot(
  context: vscode.ExtensionContext
): Promise<string | null> {
  const repo_cwd = context.workspaceState.get(REPO_KEY);
  if (repo_cwd) {
    return repo_cwd as string;
  }
  const input = await vscode.window.showInputBox({
    title: "JJ repository location",
    prompt: "Enter an absolute path for the JJ repository location",
    ignoreFocusOut: true,
  });
  if (!input) {
    return null;
  }
  if (!input.startsWith("/")) {
    // todo windows / use APIs for paths
    throw new Error("Must be an absolute path - must start with `/`");
  }
  context.workspaceState.update(REPO_KEY, input);
  return input;
}

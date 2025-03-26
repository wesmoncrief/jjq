import * as vscode from "vscode";
import { JJ } from "./jj";
import { getRepositoryRoot } from "./repositoryFinder";

export class JJFileSystemProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  extensionContext: vscode.ExtensionContext;
  constructor(extensionContext: vscode.ExtensionContext) {
    this.extensionContext = extensionContext;
  }

  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    try {
      const filePath = uri.fsPath;
      const revisionId = uri.query;

      const repoRoot = await getRepositoryRoot(this.extensionContext);
      if (!repoRoot) {
        throw new Error("Repository root not found");
      }

      // Create JJ instance
      const jj = new JJ(repoRoot);

      // Get relative path from repository root
      const relativePath = vscode.workspace.asRelativePath(filePath, false);

      // Execute jj cat command to get file content at specific revision
      const { stdout, stderr } = await jj.exec([
        "file",
        "show",
        "-r",
        revisionId,
        relativePath,
      ]);

      if (stderr) {
        throw new Error(stderr);
      }

      return stdout;
    } catch (error) {
      console.error("Error providing content:", error);
      return `Error loading file content: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }
}

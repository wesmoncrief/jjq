import * as vscode from "vscode";
import { JJ } from "./jj";
import { getRepositoryRoot } from "./repositoryFinder";

export const JJQ_URI_SCHEME = "jjq";

export class JJFileSystemProvider
  implements vscode.TextDocumentContentProvider
{
  extensionContext: vscode.ExtensionContext;
  constructor(extensionContext: vscode.ExtensionContext) {
    this.extensionContext = extensionContext;
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    try {
      const filePath = uri.fsPath;
      const revisionId = uri.query;

      const repoRoot = await getRepositoryRoot(this.extensionContext);
      if (!repoRoot) {
        throw new Error("Repository root not found");
      }

      const jj = new JJ(repoRoot);
      const relativePath = vscode.workspace.asRelativePath(filePath, false);

      const content = await jj.showFile(revisionId, relativePath);
      return content.stdout;
    } catch (error) {
      console.error("Error providing content:", error);
      return `Error loading file content: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  }
}

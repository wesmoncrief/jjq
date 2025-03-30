import * as vscode from "vscode";


export function showQuickerPick(
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
        resolve(selection);
      });
      qp.onDidAccept((i) => {
        resolve(qp.selectedItems[0]);
      });
    }
  );
  qp.show();
  return result;
}

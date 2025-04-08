import * as vscode from "vscode";
import { ChangePrefixes, PrefixOnly } from "./graph";
import { Change } from "./jj";
import {
  createQuickPickPrefixOnlyItem,
  createQuickPickLogItem,
} from "./revisionsUI";

export async function showRevisionsQuickPick(
  allRevisions: ((Change & ChangePrefixes) | PrefixOnly)[],
  workingCopyChangeId: string
): Promise<string | undefined> {
  const itemLabelWithPrefixToRevision: { [key: string]: string } = {};
  const itemsWithPrefixes: vscode.QuickPickItem[] = [];
  const itemsWithoutPrefixes: vscode.QuickPickItem[] = [];

  let headItem: vscode.QuickPickItem | undefined;

  for (const l of allRevisions) {
    if (l.isPrefixOnlyLine) {
      itemsWithPrefixes.push(createQuickPickPrefixOnlyItem(l));
    } else {
      const qpi = createQuickPickLogItem(l, true);
      itemsWithPrefixes.push(qpi);
      itemLabelWithPrefixToRevision[qpi.label] = l.changeId;

      const qpiWithoutPrefix = createQuickPickLogItem(l, false);
      itemsWithoutPrefixes.push(qpiWithoutPrefix);

      if (l.changeId === workingCopyChangeId) {
        headItem = qpi;
      }
    }
  }

  let itemLabelToRevision = (x: string) => itemLabelWithPrefixToRevision[x];

  const revisionSelector = vscode.window.createQuickPick();
  revisionSelector.items = itemsWithPrefixes;
  revisionSelector.title = "jjq";
  revisionSelector.placeholder = "Select a revision";
  revisionSelector.matchOnDescription = true;
  revisionSelector.matchOnDetail = true;
  revisionSelector.activeItems = headItem ? [headItem] : [];
  revisionSelector.buttons = [
    {
      iconPath: new vscode.ThemeIcon("source-control"),
      tooltip: "Toggle graph",
    },
  ];

  let arePrefixesVisible = true;

  const showGraphPrefixes = () => {
    revisionSelector.items = itemsWithPrefixes;
    itemLabelToRevision = (x: string) => itemLabelWithPrefixToRevision[x];
    arePrefixesVisible = true;
  };
  const hideGraphPrefixes = () => {
    revisionSelector.items = itemsWithoutPrefixes;
    itemLabelToRevision = (x: string) => x;
    arePrefixesVisible = false;
  };
  revisionSelector.onDidTriggerButton((e) => {
    if (arePrefixesVisible) {
      hideGraphPrefixes();
    } else {
      showGraphPrefixes();
    }
  });
  revisionSelector.onDidChangeValue(async (e) => {
    if (e.length === 0) {
      showGraphPrefixes();
    } else {
      hideGraphPrefixes();
    }
  });

  const selectionPromise: Promise<vscode.QuickPickItem> = new Promise(
    (resolve, reject) => {
      revisionSelector.onDidAccept((i) => {
        resolve(revisionSelector.selectedItems[0]);
        revisionSelector.hide();
      });
      revisionSelector.onDidHide(() => {
        reject();
      });
    }
  );
  revisionSelector.show();
  const selection = await selectionPromise.catch((e) => undefined);
  if (!selection) {
    return undefined;
  }
  const chosenRevisionId = itemLabelToRevision(selection.label);
  return chosenRevisionId;
}

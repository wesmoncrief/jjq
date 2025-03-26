import * as vscode from "vscode";
import { createQuickPickLogItem, createQuickPickPrefixOnlyItem, handleRevisionAction } from "./extension";
import { showQuickerPick } from "./showQuickerPick";
import { ChangePrefixes, PrefixOnly } from "./graph";
import { JJ, Change } from "./jj";
import { getRepositoryRoot } from "./repositoryFinder";
import { scrapePrefixes } from "./graphScraper";

export async function revisionsUI(context: vscode.ExtensionContext) {
  const repoRoot = await getRepositoryRoot(context);
  if (!repoRoot) {
    vscode.window.showErrorMessage("Could not load repository root location");
    return;
  }
  const jj = new JJ(repoRoot);
  let currentHead = (await jj.log("@"))[0].changeId;
  const prefixes = await scrapePrefixes(jj);

  const revisionsToPull = prefixes
    .filter((x) => !x.isPrefixOnlyLine)
    .map((c) => c.changeId)
    .join("|");
  let ungraphedLogs = await jj.log(revisionsToPull);
  const changeNodes = ungraphedLogs.map((x) => ({
    ...x,
    isHead: x.changeId === currentHead,
  }));
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

  const quickPickLabelToRevision: { [key: string]: string; } = {};
  const items: vscode.QuickPickItem[] = [];
  const headItem = createQuickPickLogItem(headLog!);
  const headItemLabel = "===> @" + headLog!.changeId;
  items.push({
    ...headItem,
    label: headItemLabel,
    detail: undefined,
  });
  quickPickLabelToRevision[headItemLabel] = (headLog?.changeId)!;
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
        return revisionsUI(context);
      }
    }
  }
}

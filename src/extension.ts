// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as jj from "./jj";
import { Mono } from "./mono";
import { buildPrefixGraph, ChangeWithGraph } from "./graph";

export function activate(context: vscode.ExtensionContext) {
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

  const demoChangesQuickPick = vscode.commands.registerCommand(
    "jjq.demoRepoTest",
    async () => {
      const rawItems = [
        [Mono.dot, Mono.w, "p"],
        [Mono.vertical],
        [Mono.vertical, Mono.w, Mono.hollowDot, Mono.w, "s"],
        [Mono.train3, Mono.horizontal, Mono.train4],
        [Mono.vertical, Mono.w, Mono.hollowDot, Mono.w, "w"],
        [Mono.vertical, Mono.w, Mono.vertical],
        [
          Mono.vertical,
          Mono.w,
          Mono.vertical,
          Mono.w,
          Mono.hollowDot,
          Mono.w,
          "l",
        ],
        [Mono.vertical, Mono.w, Mono.vertical, Mono.w, Mono.vertical],
        [
          Mono.vertical,
          Mono.w,
          Mono.vertical,
          Mono.w,
          Mono.hollowDot,
          Mono.w,
          "o",
        ],
        [
          Mono.vertical,
          Mono.w,
          Mono.train3,
          Mono.horizontal,
          Mono.cornerBottomRight,
        ],
        [
          Mono.vertical,
          Mono.w,
          Mono.vertical,
          Mono.w,
          Mono.hollowDot,
          Mono.w,
          "u",
        ],
        [
          Mono.vertical,
          Mono.horizontal,
          Mono.horizontal,
          Mono.horizontal,
          Mono.cornerBottomRight,
        ],
        [Mono.hollowDot, Mono.w, Mono.vertical, Mono.w, "k"],
        [Mono.train3, Mono.horizontal, Mono.cornerBottomRight],
        [Mono.hollowDot, Mono.w, "t"],
      ];
      const stringJoin = (xs: string[]) => {
        let ans = "";
        for (const x of xs) {
          ans = ans + x;
        }
        return ans;
      };

      const alphabetSet = new Set("abcdefghijklmnopqrstuvwxyz".split(""));
      const items = rawItems.map((m) => {
        const description = alphabetSet.has(m[m.length - 1])
          ? "some details about it"
          : undefined;
        return {
          label: stringJoin(m),
          description,
        };
      });

      const detailedItems = [];
      for (let i = 0; i + 1 < items.length; i += 2) {
        detailedItems.push({
          label: items[i].label,
          description: items[i].description,
          detail: items[i + 1].label,
        });
      }
      await vscode.window.showQuickPick(detailedItems, {
        placeHolder: "Select a change",
      });
    }
  );

  context.subscriptions.push(demoChangesQuickPick);

  const x = vscode.window.createQuickPick();

  const changesQuickPick = vscode.commands.registerCommand(
    "jjq.changes",
    async () => {
      let currentHead = (await jj.log("@"))[0].changeId;
      let ungraphedLogs = await jj.log();
      const changeNodes = ungraphedLogs.map((x) => ({
        ...x,
        isHead: x.changeId === currentHead,
      }));
      const prefixes = buildPrefixGraph(changeNodes);
      const logs = zipIntersection(ungraphedLogs, prefixes);
      const headLog = logs.find((x) => x.changeId === currentHead);
      const quickPickLabelToRevision: { [key: string]: string } = {};
      const items: vscode.QuickPickItem[] = [];
      const headItem = createQuickPickItem(headLog!);
      const headItemLabel = "===> @ " + headLog!.changeId;
      items.push({
        ...headItem,
        label: headItemLabel,
        detail: undefined,
      });
      quickPickLabelToRevision[headItemLabel] = headLog?.changeId!;
      items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
      for (const l of logs) {
        const qpi = createQuickPickItem(l)
        items.push(qpi);
        quickPickLabelToRevision[qpi.label] = l.changeId;
      }

      // todo: use the callbacks to have precedence on the
      // items? and hide the graphs as you start typing?
      // const qp = await vscode.window.createQuickPick();
      // not sure
      // qp.keepScrollPosition = true;
      // the 'label' for kind=separator might be cool for bookmarks? not sure if better or not
      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a revision",
      });

      if (selection) {
        const chosenRevision = quickPickLabelToRevision[selection.label];
        vscode.window.showInformationMessage(
          `You selected: ${JSON.stringify(selection)}`
        );

        const actions = ["edit", "describe", "new", "squash", "abandon", "After", "before", "diff"];
        const action = await vscode.window.showQuickPick(actions);
        switch (action) {
          case "edit":
            await jj.edit(chosenRevision);
            break;
          case "diff":
            // vscode.commands.executeCommand("vscode.diff", uri1, uri2)
            throw new Error("nyi");
            break;
          case "new":
            await jj.newChange(chosenRevision);
            break;
          case "before":
            await jj.before(chosenRevision);
            break;
          case "After":
            await jj.after(chosenRevision);
            break;
          case "abandon":
            await jj.abandon(chosenRevision);
            break;
          case "squash":
            await jj.squash(chosenRevision);
            break;
          case "describe":
            const chosenRevisionLog = logs.find(x => x.changeId === chosenRevision);
            await handleDescribe(chosenRevisionLog!);
            break;
          case "show":
            // opens code window with extra details
            throw new Error("nyi");
        }
      }
    }
  );

  context.subscriptions.push(changesQuickPick);
}

async function handleDescribe(change: jj.Change & ChangeWithGraph){
  const message = await vscode.window.showInputBox({
    title: "Describe revision " + change.changeId,
    value: change.changeMessage,
  });
  if (message === undefined){
    return; // backout
  }
  await jj.describe(change.changeId, message);

}
function createQuickPickItem(
  l: jj.Change & ChangeWithGraph
): vscode.QuickPickItem {
  const emptyNotice = l.isEmpty ? "(empty) " : "";
  const changeMessage =
    l.changeMessage === "" ? "(no description set)" : l.changeMessage;
  const description = emptyNotice + changeMessage;
  return {
    label: l.prefix + Mono.w + l.changeId,
    description: description,
    detail: l.lineBelow,
  };
}

function zipIntersection<A, B>(a: A[], b: B[]): (A & B)[] {
  return a.map((val, idx) => Object.assign({}, val, b[idx]));
}

// This method is called when your extension is deactivated
export function deactivate() {}

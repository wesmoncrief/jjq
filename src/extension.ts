// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as jj from "./jj";
import { Mono } from './mono';

export function activate(context: vscode.ExtensionContext) {
  const monoTest = vscode.commands.registerCommand("jjq.monoTest", async () => {
    const items = Object.values(Mono).map((c) => c.repeat(10) + "x");
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

      await vscode.window.showQuickPick(items, {
        placeHolder: "Select a change",
      });
    }
  );

  context.subscriptions.push(demoChangesQuickPick);

  const changesQuickPick = vscode.commands.registerCommand(
    "jjq.changes",
    async () => {
      const logs = await jj.log();
      const items = logs.map((l: jj.Change) => {
        const emptyNotice = l.isEmpty === "true" ? "(empty) " : "";
        const changeMessage = l.changeMessage === "" ? "(no description set)" : l.changeMessage;
        const description = emptyNotice + changeMessage;
        return {
          label: l.changeId,
          description: description,
        };
      });

      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a change",
      });

      if (selection) {
        vscode.window.showInformationMessage(
          `You selected: ${JSON.stringify(selection)}`
        );

        const actions = ["edit", "new", "abandon", "diff"];
        const action = await vscode.window.showQuickPick(actions);
        switch (action) {
          case "edit":
            await jj.edit(selection.label);
            break;
          case "diff":
            // vscode.commands.executeCommand("vscode.diff", uri1, uri2)
            throw new Error("nyi");
            break;
          case "new":
            await jj.newChange(selection.label);
            break;
          case "abandon":
            await jj.abandon(selection.label);
            break;
          case "squash":
            await jj.squash(selection.label);
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

// This method is called when your extension is deactivated
export function deactivate() {}

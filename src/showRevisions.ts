import * as vscode from "vscode";
import { showQuickerPick } from "./showQuickerPick";
import { ChangePrefixes, PrefixOnly } from "./graph";
import { JJ, Change } from "./jj";
import { getRepositoryRoot } from "./repositoryFinder";
import { scrapePrefixes } from "./graphScraper";
import { Mono } from "./mono";
import { showMessageWithTimeout } from "./showMessageWithTimeout";

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

  const quickPickLabelToRevision: { [key: string]: string } = {};
  const items: vscode.QuickPickItem[] = [];
  const headItem = createQuickPickLogItem(headLog!);
  const headItemLabel = "===> @" + headLog!.changeId;
  items.push({
    ...headItem,
    label: headItemLabel,
    detail: undefined,
  });
  quickPickLabelToRevision[headItemLabel] = headLog?.changeId!;
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

async function handleBookmarkRevisionAction(
  jj: JJ,
  chosenRevisionLog: Change
): Promise<boolean> {
  const actionItem = await showQuickerPick([
    { label: "d", description: "delete" },
    { label: "p", description: "push" },
    { label: "s", description: "set" },
  ]);
  const action = actionItem?.description;
  switch (action) {
    case "delete": {
      const bookmarksAtRevisionLabels = chosenRevisionLog.localBookmarks.map(
        (x) => ({
          label: x,
        })
      );
      const bookmarkToDelete = await vscode.window.showQuickPick(
        bookmarksAtRevisionLabels
      );
      if (!bookmarkToDelete) {
        return false;
      }
      await jj.deleteBookmark(
        chosenRevisionLog.changeId,
        bookmarkToDelete.label
      );
      showMessageWithTimeout(`Deleted bookmark: ${bookmarkToDelete.label}`);
      return true;
    }
    case "push": {
      const bookmarksAtRevisionLabels = chosenRevisionLog.localBookmarks.map(
        (x) => ({
          label: x,
        })
      );
      const bookmark = await vscode.window.showQuickPick(
        bookmarksAtRevisionLabels
      );
      if (!bookmark) {
        return false;
      }
      await jj.pushBookmark(chosenRevisionLog.changeId, bookmark.label);
      showMessageWithTimeout(`Pushed bookmark: ${bookmark.label}`);
    }
    case "set": {
      const newBookmarkLabel = "New Bookmark";
      const existingBookmarks = await jj.listBookmarks();
      const bookmarkItems: vscode.QuickPickItem[] = [
        { label: newBookmarkLabel },
        { label: "", kind: vscode.QuickPickItemKind.Separator },
        ...existingBookmarks.map((x) => ({
          label: x,
        })),
      ];
      const chosenBookmark = await vscode.window.showQuickPick(bookmarkItems);
      if (!chosenBookmark) {
        break;
      }
      let bookmark: string | undefined;
      if (chosenBookmark.label === newBookmarkLabel) {
        const newBookmark = await vscode.window.showInputBox({
          title: "New bookmark",
        });
        bookmark = newBookmark;
      } else {
        bookmark = chosenBookmark.label;
      }
      if (!bookmark) {
        // backout
        return false;
      }
      const msg = await jj.setBookmark(chosenRevisionLog.changeId, bookmark);
      showMessageWithTimeout(msg.stderr);

      const pushBookmark = (
        await showQuickerPick(
          [
            { label: "y" },
            {
              label: "n",
            },
          ],
          {
            placeholder: "Push bookmark to origin?",
            title: "Push bookmark to origin?",
          }
        )
      )?.label;
      if (pushBookmark === "y") {
        await jj.pushBookmark(chosenRevisionLog.changeId, bookmark);
        showMessageWithTimeout("Pushed bookmark: " + bookmark);
        return true;
      }
      if (pushBookmark === "n") {
        return true;
      }

      return false;
    }
  }
  return false;
}
// returns 'true' if the revision selector should be called again

export async function handleRevisionAction(
  action: string,
  jj: JJ,
  chosenRevisionLog: Change
): Promise<boolean> {
  switch (action) {
    case "edit": {
      const msg = await jj.edit(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "diff": {
      const files = await jj.getFilesChangedAtRevision(
        chosenRevisionLog.changeId
      );
      const uris = [];
      for (const file of files) {
        const currentUri = vscode.Uri.file(`${jj.rootLocation}/${file}`);

        const current = currentUri.with({
          scheme: "jj",
          query: chosenRevisionLog.changeId,
        });
        const older = currentUri.with({
          scheme: "jj",
          query: chosenRevisionLog.changeId + "-",
        });
        uris.push([currentUri, older, current]);
      }
      await vscode.commands.executeCommand(
        "vscode.changes",
        `Changes in ${chosenRevisionLog.changeId} - ${chosenRevisionLog.changeMessage}`,
        uris
      );

      return false;
    }
    case "bookmarks": {
      return await handleBookmarkRevisionAction(jj, chosenRevisionLog);
    }
    case "new": {
      const msg = await jj.newChange(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "before": {
      const msg = await jj.before(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "After": {
      const msg = await jj.after(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "abandon": {
      const msg = await jj.abandon(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "squash": {
      const msg = await jj.squash(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "describe": {
      return await handleDescribe(chosenRevisionLog, jj);
    }
    case "show": {
      // opens code window with extra details
      throw new Error("nyi");
    }
  }
  throw new Error("nyi: " + action);
}

async function handleDescribe(change: Change, jj: JJ): Promise<boolean> {
  const message = await vscode.window.showInputBox({
    title: "Describe revision " + change.changeId,
    value: change.changeMessage,
  });
  if (message === undefined) {
    return false; // backout
  }
  await jj.describe(change.changeId, message);
  return true;
}
export function createQuickPickPrefixOnlyItem(
  p: PrefixOnly
): vscode.QuickPickItem {
  return {
    label: p.prefix,
  };
}

export function createQuickPickLogItem(
  l: Change & ChangePrefixes
): vscode.QuickPickItem {
  const description = generateFriendlyNames(l, 100).description;
  const bookmarks = [
    ...l.localBookmarks,
    ...l.remoteBookmarks.map((b) => b + "@origin"),
  ].join(Mono.w);
  return {
    label: l.prefix + Mono.w + l.changeId,
    description: description,
    detail: l.lineBelow + Mono.w + Mono.w + bookmarks,
  };
}

export function generateFriendlyNames(
  change: Change,
  descriptionMaxLength: number
): {
  changeId: string;
  description: string;
} {
  const emptyNotice = change.isEmpty ? "(empty)" : "";
  const changeMessage =
    change.changeMessage === "" ? "(no description set)" : change.changeMessage;
  const conflictNotice = change.conflict ? "(conflicted)" : "";
  let description = [conflictNotice, emptyNotice, changeMessage].join(" ");
  if (description.length > descriptionMaxLength) {
    description = description.substring(0, descriptionMaxLength) + "...";
  }
  return { changeId: change.changeId, description };
}

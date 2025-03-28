import * as vscode from "vscode";
import { showQuickerPick } from "./showQuickerPick";
import { ChangePrefixes, PrefixOnly } from "./graph";
import { JJ, Change } from "./jj";
import { getRepositoryRoot } from "./repositoryFinder";
import { scrapePrefixes } from "./graphScraper";
import { Mono } from "./mono";
import { showMessageWithTimeout } from "./showMessageWithTimeout";

const TITLE_MAX_LENGTH = 50;

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
    title: "JJQ",
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
      { label: "r", description: "rebase" },
      {
        label: "f",
        description: "forget - jj abandon -r '::<theRevisionId> ~ immutable()'",
      },
    ];

    const actionSelectTitle = generateFriendlyNames(
      chosenRevisionLog,
      TITLE_MAX_LENGTH
    );
    const action = await showQuickerPick(actions, {
      title: actionSelectTitle.changeIdAndDescription,
    });
    if (action) {
      const completedScreens = await handleRevisionAction(
        action.label,
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
  const qpTitle = generateFriendlyNames(
    chosenRevisionLog,
    TITLE_MAX_LENGTH
  ).changeIdAndDescription;
  const actionItem = await showQuickerPick(
    [
      { label: "f", description: "forget" },
      { label: "p", description: "push" },
      { label: "s", description: "set" },
    ],
    {
      title: qpTitle,
    }
  );
  const action = actionItem?.description;
  switch (action) {
    case "forget": {
      const bookmarksAtRevisionLabels = chosenRevisionLog.localBookmarks.map(
        (x) => ({
          label: x,
        })
      );
      const bookmarkToDelete = await vscode.window.showQuickPick(
        bookmarksAtRevisionLabels,
        {
          title: qpTitle,
          placeHolder: "Forget bookmark",
        }
      );
      if (!bookmarkToDelete) {
        return false;
      }
      await jj.forgetBookmark(
        chosenRevisionLog.changeId,
        bookmarkToDelete.label
      );
      showMessageWithTimeout(`Forgot bookmark: ${bookmarkToDelete.label}`);
      return true;
    }
    case "push": {
      const bookmarksAtRevisionLabels = chosenRevisionLog.localBookmarks.map(
        (x) => ({
          label: x,
        })
      );
      const bookmark = await vscode.window.showQuickPick(
        bookmarksAtRevisionLabels,
        {
          title: qpTitle,
          placeHolder: "Push bookmark",
        }
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
      const chosenBookmark = await vscode.window.showQuickPick(bookmarkItems, {
        title: qpTitle,
      });
      if (!chosenBookmark) {
        break;
      }
      let bookmark: string | undefined;
      if (chosenBookmark.label === newBookmarkLabel) {
        function generateRandomString() {
          const characters = "hijklmnopqrstuvwxyz";
          let result = "";
          for (let i = 0; i < 10; i++) {
            result += characters.charAt(
              Math.floor(Math.random() * characters.length)
            );
          }
          return result;
        }

        const suggestedName = "push-" + generateRandomString();
        const newBookmark = await vscode.window.showInputBox({
          title: qpTitle,
          value: suggestedName,
          prompt: "Bookmark name",
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
            title: qpTitle,
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
    case "f": {
      await jj.abandon(
        "'" + "::" + chosenRevisionLog.changeId + " ~ immutable()" + "'"
      );
      showMessageWithTimeout(
        `Abandoned between revision and immutable ancestor: ${chosenRevisionLog.changeId}`
      );
      return true;
    }
    case "e": {
      const msg = await jj.edit(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "D": {
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
    case "b": {
      return await handleBookmarkRevisionAction(jj, chosenRevisionLog);
    }
    case "r": {
      const input = await vscode.window.showInputBox({
        title: "rebase",
        value: `-b ${chosenRevisionLog.changeId} -d master@origin`,
      });
      if (input === undefined) {
        return false;
      }
      const msg = await jj.exec(["rebase", input]);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "n": {
      const msg = await jj.newChange(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "B": {
      const msg = await jj.before(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "A": {
      const msg = await jj.after(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "a": {
      const msg = await jj.abandon(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "s": {
      const msg = await jj.squash(chosenRevisionLog.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "d": {
      return await handleDescribe(chosenRevisionLog, jj);
    }
    case "show": {
      // opens code window with extra details
      throw new Error("nyi");
    }
  }
  throw new Error("nyi: " + action);
}

async function handleDescribe(changeLog: Change, jj: JJ): Promise<boolean> {
  const message = await vscode.window.showInputBox({
    title: generateFriendlyNames(changeLog, TITLE_MAX_LENGTH).changeIdAndDescription,
    value: changeLog.changeMessage,
    prompt: "Describe revision",
  });
  if (message === undefined) {
    return false; // backout
  }
  await jj.describe(changeLog.changeId, message);
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
  changeIdAndDescription: string;
} {
  const emptyNotice = change.isEmpty ? "(empty)" : "";
  const changeMessage =
    change.changeMessage === "" ? "(no description set)" : change.changeMessage;
  const conflictNotice = change.conflict ? "(conflicted)" : "";
  let description = [conflictNotice, emptyNotice, changeMessage].join(" ");
  if (description.length > descriptionMaxLength) {
    description = description.substring(0, descriptionMaxLength) + "...";
  }
  return {
    changeId: change.changeId,
    description,
    changeIdAndDescription: change.changeId + ": " + description,
  };
}

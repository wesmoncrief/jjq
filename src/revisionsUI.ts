import * as vscode from "vscode";
import { showQuickerPick } from "./showQuickerPick";
import { ChangePrefixes, PrefixOnly } from "./graph";
import { JJ, Change, exec } from "./jj";
import { getRepositoryRoot } from "./repositoryFinder";
import { scrapePrefixes } from "./graphScraper";
import { Mono } from "./mono";
import { showMessageWithTimeout } from "./showMessageWithTimeout";
import { JJQ_URI_SCHEME } from "./jjFileSystem";
import { showRevisionsQuickPick } from "./revisionsQuickPick";

const TITLE_MAX_LENGTH = 50;

export async function revisionsUI(context: vscode.ExtensionContext) {
  const repoRoot = await getRepositoryRoot(context);
  if (!repoRoot) {
    vscode.window.showErrorMessage("Could not load repository root location");
    return;
  }
  const jj = new JJ(repoRoot);
  let workingCopyChangeId = (await jj.log("@"))[0].changeId;
  const prefixes = await scrapePrefixes(jj);

  const revisionsToPull = prefixes
    .filter((x) => !x.isPrefixOnlyLine)
    .map((c) => c.changeId)
    .join("|");
  let ungraphedLogs = await jj.log(revisionsToPull);
  const changeNodes = ungraphedLogs.map((x) => ({
    ...x,
    isworkingCopy: x.changeId === workingCopyChangeId,
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
  const workingCopyLog = itemFullData.find(
    (x) => "changeId" in x && x.changeId === workingCopyChangeId
  ) as Change & ChangePrefixes;

  const selection = await showRevisionsQuickPick(
    itemFullData,
    workingCopyChangeId
  );
  if (selection) {
    const chosenRevisionLog = changeNodes.find(
      (x) => x.changeId === selection
    )!;

    const actions = [
      { label: "n", description: "new" },
      { label: "e", description: "edit" },
      { label: "c", description: "commit" },
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
      const shouldShowRevisionsUIAgain = await handleRevisionAction(
        action.label,
        jj,
        chosenRevisionLog,
        workingCopyLog
      );
      if (shouldShowRevisionsUIAgain) {
        return revisionsUI(context);
      }
    }
  }
}
async function pickNewBookmark(qpTitle: string): Promise<string | null> {
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
  return newBookmark ?? null;
}

async function pickExistingOrNewBookmark(
  jj: JJ,
  qpTitle: string,
  existingBookmarks: string[]
): Promise<string | null> {
  if (existingBookmarks.length === 0) {
    return await pickNewBookmark(qpTitle);
  }
  const newBookmarkLabel = "New Bookmark";
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
    return null;
  }
  if (chosenBookmark.label === newBookmarkLabel) {
    return await pickNewBookmark(qpTitle);
  }
  return chosenBookmark.label;
}

async function offerToPush(
  jj: JJ,
  bookmark: string,
  qpTitle: string
): Promise<boolean> {
  const pushBookmark = (
    await showQuickerPick(
      [
        { label: "y" },
        {
          label: "n",
        },
      ],
      {
        placeholder: `Push bookmark ${bookmark} to origin?`,
        title: qpTitle,
      }
    )
  )?.label;
  if (pushBookmark === "y") {
    await jj.pushBookmark(bookmark);
    showMessageWithTimeout("Pushed bookmark: " + bookmark);
    return true;
  }
  if (pushBookmark === "n") {
    return true;
  }
  return false;
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
      { label: "s", description: "set" },
      { label: "t", description: "tug" },
      { label: "p", description: "push" },
      { label: "o", description: "open Github PR" },
      { label: "f", description: "forget" },
    ],
    {
      title: qpTitle,
    }
  );
  const action = actionItem?.label;
  switch (action) {
    case "f": {
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
    case "t": {
      const toRev = chosenRevisionLog.isEmpty
        ? chosenRevisionLog.changeId + "-"
        : chosenRevisionLog.changeId;
      await jj.exec([
        "bookmark",
        "move",
        "--from",
        `"closest_bookmark(${chosenRevisionLog.changeId})"`,
        "--to",
        toRev,
      ]);
      const bookmark = await jj.listBookmarks(toRev);
      if (bookmark.length !== 1) {
        return false;
      }
      return await offerToPush(jj, bookmark[0], qpTitle);
    }
    case "o": {
      const branch = await pickExistingOrNewBookmark(
        jj,
        qpTitle,
        chosenRevisionLog.localBookmarks
      );
      if (!branch) {
        return false;
      }
      await jj.setBookmark(chosenRevisionLog.changeId, branch);
      await jj.pushBookmark(branch);
      await exec(
        `cd ${jj.rootLocation} && gh pr create --web --title "${chosenRevisionLog.changeMessage}" --head ${branch}`
      );
      return true;
    }
    case "p": {
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
      await jj.pushBookmark(bookmark.label);
      showMessageWithTimeout(`Pushed bookmark: ${bookmark.label}`);
      return true;
    }
    case "s": {
      const localBookmarks = await jj.listBookmarks();
      const bookmark = await pickExistingOrNewBookmark(
        jj,
        qpTitle,
        localBookmarks
      );
      if (!bookmark) {
        // backout
        return false;
      }
      const msg = await jj.setBookmark(chosenRevisionLog.changeId, bookmark);
      showMessageWithTimeout(msg.stderr);
      return await offerToPush(jj, bookmark, qpTitle);
    }
  }
  return false;
}

// returns 'true' if the revision selector should be called again
export async function handleRevisionAction(
  action: string,
  jj: JJ,
  chosenRevision: Change,
  workingCopy: Change
): Promise<boolean> {
  switch (action) {
    case "f": {
      await jj.abandon(
        "'" + "::" + chosenRevision.changeId + " ~ immutable()" + "'"
      );
      showMessageWithTimeout(
        `Abandoned between revision and immutable ancestor: ${chosenRevision.changeId}`
      );
      return true;
    }
    case "e": {
      const msg = await jj.edit(chosenRevision.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "c": {
      const message = await vscode.window.showInputBox({
        title: generateFriendlyNames(chosenRevision, TITLE_MAX_LENGTH)
          .changeIdAndDescription,
        value: chosenRevision.changeMessage,
        prompt: "Describe revision",
      });
      if (message === undefined) {
        return false;
      }
      await jj.describe(chosenRevision.changeId, message);
      await jj.new(chosenRevision.changeId);

      return true;
    }
    case "D": {
      await handleDiff(jj, chosenRevision, workingCopy);
      return false;
    }
    case "b": {
      return await handleBookmarkRevisionAction(jj, chosenRevision);
    }
    case "r": {
      const input = await vscode.window.showInputBox({
        title: "rebase",
        value: `-b ${chosenRevision.changeId} -d master@origin`,
      });
      if (input === undefined) {
        return false;
      }
      const msg = await jj.exec(["rebase", input]);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "n": {
      const msg = await jj.new(chosenRevision.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "B": {
      const msg = await jj.before(chosenRevision.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "A": {
      const msg = await jj.after(chosenRevision.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "a": {
      const msg = await jj.abandon(chosenRevision.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "s": {
      const msg = await jj.squash(chosenRevision.changeId);
      showMessageWithTimeout(msg.stderr);
      return true;
    }
    case "d": {
      return await handleDescribe(chosenRevision, jj);
    }
  }
  throw new Error("nyi: " + action);
}

async function handleDiff(
  jj: JJ,
  chosenRevisionLog: Change,
  workingCopy: Change
) {
  const diffOptions = [
    { label: "p", description: "parent" },
    { label: "@", description: "working copy" },
    { label: "c", description: "custom" },
  ];
  const qpTitle = generateFriendlyNames(
    chosenRevisionLog,
    TITLE_MAX_LENGTH
  ).changeIdAndDescription;
  const qp = await showQuickerPick(diffOptions, { title: qpTitle });
  if (!qp) {
    return;
  }
  let diffFrom: string;
  let diffTo: string =
    chosenRevisionLog.changeId === workingCopy.changeId
      ? "@"
      : chosenRevisionLog.changeId;
  if (qp.label === "p") {
    diffFrom = chosenRevisionLog.changeId + "-";
  } else if (qp.label === "@") {
    diffTo = "@";
    diffFrom = chosenRevisionLog.changeId;
  } else if (qp.label === "c") {
    const input = await vscode.window.showInputBox({
      title: "Diff revision",
      prompt: "Diff from ?? to " + chosenRevisionLog.changeId,
      value: chosenRevisionLog.changeId + "--",
    });
    if (!input) {
      return;
    }
    diffFrom = input;
  } else {
    return;
  }

  const files = await jj.getFilesChangedBetween(diffFrom, diffTo);
  const uris = [];
  for (const file of files) {
    const currentUri = vscode.Uri.file(`${jj.rootLocation}/${file}`);

    const current =
      diffTo === "@"
        ? currentUri
        : currentUri.with({
            scheme: JJQ_URI_SCHEME,
            query: diffTo,
          });
    const older = currentUri.with({
      scheme: JJQ_URI_SCHEME,
      query: diffFrom,
    });
    uris.push([currentUri, older, current]);
  }
  await vscode.commands.executeCommand(
    "vscode.changes",
    `Changes from ${diffFrom} to ${diffTo}`,
    uris
  );

  return false;
}

async function handleDescribe(changeLog: Change, jj: JJ): Promise<boolean> {
  const message = await vscode.window.showInputBox({
    title: generateFriendlyNames(changeLog, TITLE_MAX_LENGTH)
      .changeIdAndDescription,
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
  l: Change & ChangePrefixes,
  includeGraphPrefixes: boolean
): vscode.QuickPickItem {
  const description = generateFriendlyNames(l, 100).description;
  const bookmarks = [
    ...l.localBookmarks,
    ...l.remoteBookmarks.map((b) => b + "@origin"),
  ].join(Mono.w);

  const authorStr = `${l.author}`;
  const detailLineContents = bookmarks
    ? [authorStr, bookmarks].join(Mono.w)
    : authorStr;
  if (includeGraphPrefixes) {
    return {
      label: l.prefix + Mono.w + l.changeId,
      description: description,
      detail: l.lineBelow + Mono.w + Mono.w + detailLineContents,
    };
  }
  return {
    label: l.changeId,
    description: description,
    detail: detailLineContents,
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

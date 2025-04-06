import * as vscode from "vscode";

export const showMessageWithTimeout = (
  message: string,
  timeout = 3500
): void => {
  void vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: message,
      cancellable: false,
    },

    async (progress): Promise<void> => {
      await waitFor(timeout, () => {
        return false;
      });
      progress.report({ increment: 100 });
    }
  );
};

export const waitFor = async (
  timeout: number,
  condition: () => boolean
): Promise<boolean> => {
  while (!condition() && timeout > 0) {
    timeout -= 100;
    await sleep(100);
  }

  return timeout > 0 ? true : false;
};
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import * as vscode from "vscode";

let channel: vscode.OutputChannel;
export function log(msg: string) {
  if (!channel) {
    channel = vscode.window.createOutputChannel("JJQ");
  }
  channel.appendLine(msg);
}

import * as vscode from 'vscode';

export class BuildPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'miracle.buildPanel';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'compileHot':
          vscode.commands.executeCommand('miracle.compileHot');
          break;
        case 'buildAll':
          vscode.commands.executeCommand('miracle.buildAll');
          break;
        case 'runScript':
          // Implement custom script running logic here
          break;
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css')
    );

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: sans-serif;
            padding: 10px;
          }
          button {
            margin: 5px 0;
            padding: 5px 10px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <button onclick="compileHot()">Compile Hot Libraries</button><br/>
        <button onclick="buildAll()">Build All</button><br/>
        <button onclick="runScript()">Run Custom Script</button>
        <script>
          const vscode = acquireVsCodeApi();
          function compileHot() {
            vscode.postMessage({ command: 'compileHot' });
          }
          function buildAll() {
            vscode.postMessage({ command: 'buildAll' });
          }
          function runScript() {
            vscode.postMessage({ command: 'runScript' });
          }
        </script>
      </body>
      </html>
    `;
  }
}

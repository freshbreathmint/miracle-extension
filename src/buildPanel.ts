import * as vscode from 'vscode';

export class BuildPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'buildPanel'; // Updated to match package.json

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'buildExecutable':
          vscode.commands.executeCommand(
            'miracle.buildExecutable',
            message.linkType,
            message.platform,
            message.buildType
          );
          break;
        case 'fullHotCompile':
          vscode.commands.executeCommand(
            'miracle.fullHotCompile',
            message.platform
          );
          break;
        case 'runExecutable':
          vscode.commands.executeCommand(
            'miracle.runExecutable',
            message.buildType,
            message.platform
          );
          break;
        case 'cleanBuildDirectories':
          vscode.commands.executeCommand('miracle.cleanBuildDirectories');
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
          select, button {
            margin: 5px 0;
            padding: 5px 10px;
            font-size: 14px;
            width: 100%;
          }
          h2 {
            margin-top: 15px;
          }
          .section {
            margin-bottom: 20px;
          }
          label {
            display: block;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="section">
          <h2>Build Actions</h2>
          <label for="build-platform">Platform:</label>
          <select id="build-platform">
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
          <label for="build-linkType">Link Type:</label>
          <select id="build-linkType">
            <option value="dynamic">Dynamic</option>
            <option value="static">Static</option>
          </select>
          <label for="build-buildType">Build Type:</label>
          <select id="build-buildType">
            <option value="debug">Debug</option>
            <option value="release">Release</option>
          </select>
          <button onclick="buildExecutable()">Build Executable</button>
        </div>

        <div class="section">
          <h2>Full Hot Compile</h2>
          <label for="hotcompile-platform">Platform:</label>
          <select id="hotcompile-platform">
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
          <button onclick="fullHotCompile()">Full Hot Compile</button>
        </div>

        <div class="section">
          <h2>Run Actions</h2>
          <label for="run-platform">Platform:</label>
          <select id="run-platform">
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
          <label for="run-buildType">Build Type:</label>
          <select id="run-buildType">
            <option value="debug">Debug</option>
            <option value="release">Release</option>
          </select>
          <button onclick="runExecutable()">Run Executable</button>
        </div>

        <div class="section">
          <h2>Clean Build Directories</h2>
          <button onclick="cleanBuildDirectories()">Clean</button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function buildExecutable() {
            const platform = document.getElementById('build-platform').value;
            const linkType = document.getElementById('build-linkType').value;
            const buildType = document.getElementById('build-buildType').value;
            vscode.postMessage({
              command: 'buildExecutable',
              platform: platform,
              linkType: linkType,
              buildType: buildType
            });
          }

          function fullHotCompile() {
            const platform = document.getElementById('hotcompile-platform').value;
            vscode.postMessage({
              command: 'fullHotCompile',
              platform: platform
            });
          }

          function runExecutable() {
            const platform = document.getElementById('run-platform').value;
            const buildType = document.getElementById('run-buildType').value;
            vscode.postMessage({
              command: 'runExecutable',
              platform: platform,
              buildType: buildType
            });
          }

          function cleanBuildDirectories() {
            vscode.postMessage({
              command: 'cleanBuildDirectories'
            });
          }
        </script>
      </body>
      </html>
    `;
  }
}

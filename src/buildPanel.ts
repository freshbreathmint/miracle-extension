import * as vscode from 'vscode';

export class BuildPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'buildPanel';

  // Define a key for storing the state
  private readonly stateKey = 'buildPanel.state';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
    };

    // Initialize state if not present
    if (!this.context.globalState.get(this.stateKey)) {
      const initialState = {
        build: {
          platform: 'linux',
          linkType: 'dynamic',
          buildType: 'debug',
        },
        hotcompile: {
          platform: 'linux',
        },
        run: {
          platform: 'linux',
          buildType: 'debug',
        },
      };
      this.context.globalState.update(this.stateKey, initialState);
    }

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
        case 'requestState':
          // Send the current state to the webview
          const state = this.context.globalState.get(this.stateKey);
          webviewView.webview.postMessage({ command: 'updateState', state });
          break;
        case 'updateState':
          // Update the state in globalState
          this.context.globalState.update(this.stateKey, message.state);
          break;
      }
    });

    // Request the current state when the webview is loaded
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.command === 'ready') {
        const state = this.context.globalState.get(this.stateKey);
        webviewView.webview.postMessage({ command: 'updateState', state });
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    // If you have external CSS, you can include it here
    // const styleUri = webview.asWebviewUri(
    //   vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css')
    // );

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
          <h2>Framework Actions</h2>
          <button onclick="cleanBuildDirectories()">Clean</button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          // Listen for messages from the extension
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'updateState':
                setState(message.state);
                break;
            }
          });

          // Function to set the state of the select elements
          function setState(state) {
            // Build Actions
            document.getElementById('build-platform').value = state.build.platform;
            document.getElementById('build-linkType').value = state.build.linkType;
            document.getElementById('build-buildType').value = state.build.buildType;
            // Hot Compile
            document.getElementById('hotcompile-platform').value = state.hotcompile.platform;
            // Run Actions
            document.getElementById('run-platform').value = state.run.platform;
            document.getElementById('run-buildType').value = state.run.buildType;
          }

          // Notify the extension that the webview is ready
          window.onload = () => {
            vscode.postMessage({ command: 'ready' });
          };

          // Add event listeners to update state when selections change
          document.getElementById('build-platform').addEventListener('change', updateState);
          document.getElementById('build-linkType').addEventListener('change', updateState);
          document.getElementById('build-buildType').addEventListener('change', updateState);
          document.getElementById('hotcompile-platform').addEventListener('change', updateState);
          document.getElementById('run-platform').addEventListener('change', updateState);
          document.getElementById('run-buildType').addEventListener('change', updateState);

          // Function to gather the current state and send it to the extension
          function updateState() {
            const state = {
              build: {
                platform: document.getElementById('build-platform').value,
                linkType: document.getElementById('build-linkType').value,
                buildType: document.getElementById('build-buildType').value,
              },
              hotcompile: {
                platform: document.getElementById('hotcompile-platform').value,
              },
              run: {
                platform: document.getElementById('run-platform').value,
                buildType: document.getElementById('run-buildType').value,
              },
            };
            vscode.postMessage({ command: 'updateState', state });
          }

          // Build Executable Action
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

          // Full Hot Compile Action
          function fullHotCompile() {
            const platform = document.getElementById('hotcompile-platform').value;
            vscode.postMessage({
              command: 'fullHotCompile',
              platform: platform
            });
          }

          // Run Executable Action
          function runExecutable() {
            const platform = document.getElementById('run-platform').value;
            const buildType = document.getElementById('run-buildType').value;
            vscode.postMessage({
              command: 'runExecutable',
              platform: platform,
              buildType: buildType
            });
          }

          // Clean Build Directories Action
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

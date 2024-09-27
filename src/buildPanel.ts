import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BuildPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'buildPanel';
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
    webviewView.webview.onDidReceiveMessage(async (message) => {
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
        case 'setupWorkspace':
          await this.handleSetupWorkspace();
          break;
        case 'requestState':
          const state = this.context.globalState.get(this.stateKey);
          webviewView.webview.postMessage({ command: 'updateState', state });
          break;
        case 'updateState':
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

  private async handleSetupWorkspace() {
    try {
      // Ensure Git is installed
      await this.ensureGitInstalled();

      // Get the active workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
      }

      const workspaceFolder = workspaceFolders[0].uri.fsPath;

      // Define the path to the miracle directory
      const miraclePath = path.join(workspaceFolder, 'miracle');

      // Check if miracle directory exists
      const miracleExists = await this.checkIfDirectoryExists(miraclePath);

      if (!miracleExists) {
        // Add miracle as a git submodule
        const addSubmoduleCommand = `git submodule add https://github.com/freshbreathmint/miracle miracle`;
        vscode.window.showInformationMessage('Adding miracle as a git submodule...');
        await execAsync(addSubmoduleCommand, { cwd: workspaceFolder });
        vscode.window.showInformationMessage('Miracle submodule added successfully.');
      } else {
        vscode.window.showInformationMessage('Miracle directory already exists.');
      }

      // Prompt the user for the project name
      const projectName = await vscode.window.showInputBox({
        prompt: 'Enter the name of your project',
        placeHolder: 'Project Name',
        validateInput: (value) => {
          return value.trim() === '' ? 'Project name cannot be empty.' : null;
        },
      });

      if (!projectName) {
        // User cancelled the input
        return;
      }

      // Determine the available Python command
      const pythonCmd = await this.getPythonCommand();

      // Execute the setup.py script
      const setupCommand = `${pythonCmd} setup.py application ${projectName}`;
      vscode.window.showInformationMessage('Running setup.py script...');
      const miraclePathResolved = path.resolve(workspaceFolder, 'miracle');

      // Check if miracle directory exists after adding submodule
      const miracleUri = vscode.Uri.file(miraclePathResolved);
      let miracleStat: vscode.FileStat | null = null;
      try {
        miracleStat = await vscode.workspace.fs.stat(miracleUri);
      } catch (error) {
        miracleStat = null;
      }

      if (!miracleStat || miracleStat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage(`Miracle directory does not exist at ${miraclePathResolved}.`);
        return;
      }

      // Execute the setup.py script
      const { stdout, stderr } = await execAsync(setupCommand, { cwd: miraclePathResolved });

      if (stderr && stderr.trim() !== '') {
        vscode.window.showErrorMessage(`Error executing setup.py: ${stderr}`);
        return;
      }

      vscode.window.showInformationMessage(`Workspace setup completed: ${stdout}`);

      // Load the workspace file using the correct command
      const workspacePath = path.join(workspaceFolder, '..', 'miracle.code-workspace');
      const workspaceUri = vscode.Uri.file(workspacePath);

      vscode.commands.executeCommand('workbench.action.openWorkspace', workspaceUri).then(
        () => {
          vscode.window.showInformationMessage('Workspace loaded successfully.');
        },
        (err) => {
          vscode.window.showErrorMessage(`Failed to load workspace: ${err}`);
        }
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(`Setup Workspace failed: ${error.message}`);
    }
  }

  private async ensureGitInstalled() {
    try {
      await execAsync('git --version');
    } catch (error) {
      throw new Error('Git is not installed or not available in PATH.');
    }
  }

  private async checkIfDirectoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(dirPath));
      return stat.type === vscode.FileType.Directory;
    } catch (error) {
      return false;
    }
  }

  private async getPythonCommand(): Promise<string> {
    try {
      await execAsync('python --version');
      return 'python';
    } catch {
      try {
        await execAsync('python3 --version');
        return 'python3';
      } catch {
        throw new Error('Python is not installed or not available in PATH. Please install Python to proceed.');
      }
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
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
          <button onclick="setupWorkspace()">Setup Workspace</button>
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

          // Setup Workspace Action
          function setupWorkspace() {
            vscode.postMessage({
              command: 'setupWorkspace'
            });
          }
        </script>
      </body>
      </html>
    `;
  }
}

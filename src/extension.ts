import * as vscode from 'vscode';
import { IniTreeDataProvider } from './treeView';
import { BuildPanelProvider } from './buildPanel';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('No workspace is open.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Initialize the INI Tree Data Provider
  const iniTreeDataProvider = new IniTreeDataProvider(workspaceRoot);
  vscode.window.registerTreeDataProvider('iniTreeView', iniTreeDataProvider);

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('miracle.refreshIniTree', () => iniTreeDataProvider.refresh()),
    vscode.commands.registerCommand('miracle.editIniValue', (item: any) => {
      vscode.window
        .showInputBox({ prompt: `Edit value for ${item.label}`, value: String(item.data) })
        .then((value) => {
          if (value !== undefined) {
            iniTreeDataProvider.updateIniValue(item, value);
          }
        });
    }),
    vscode.commands.registerCommand('miracle.addDependency', (item: any) => {
      vscode.window.showInputBox({ prompt: 'Enter new dependency' }).then((dep) => {
        if (dep) {
          iniTreeDataProvider.addDependency(item, dep);
        }
      });
    }),
    vscode.commands.registerCommand('miracle.addLibrary', () => {
      vscode.window.showInputBox({ prompt: 'Enter new library name' }).then((libName) => {
        if (libName) {
          iniTreeDataProvider.addLibrary(libName);
        }
      });
    }),
    vscode.commands.registerCommand('miracle.compileHot', async (item: any) => {
      if (item) {
        // Determine the target to build
        let target: string;
        if (item.label === 'application') {
          target = 'application';
        } else {
          target = item.label
        }

        // Prompt the user to select the platform
        const platform = await vscode.window.showQuickPick(['windows', 'linux'], {
          placeHolder: 'Select the target platform for hot compile',
        });

        if (!platform) {
          vscode.window.showErrorMessage('Hot compile cancelled: No platform selected.');
          return;
        }

        // Run the build script with target, build-type 'hot', and the selected platform
        runBuildScript('build', ['--target', target, '--platform', platform, '--build-type', 'hot'], workspaceRoot);
      }
    })
  );

  // Initialize the Build Panel
  const buildPanelProvider = new BuildPanelProvider(context);
  vscode.window.registerWebviewViewProvider('buildPanel', buildPanelProvider);
}

function runBuildScript(command: string, args: string[], workspaceRoot: string) {
  const buildScriptPath = path.join(workspaceRoot, 'miracle', 'build.py'); // Updated path

  if (!fs.existsSync(buildScriptPath)) {
    vscode.window.showErrorMessage(`Build script not found at ${buildScriptPath}`);
    return;
  }

  // Ensure the build script is executable (for Unix-like systems)
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(buildScriptPath, 0o755);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to set executable permissions for build script: ${err}`);
      return;
    }
  }

  const terminal = vscode.window.createTerminal(`Build ${command}`);
  const cmdArgs = [command, ...args].join(' ');

  // Construct the command to execute ./miracle/build.py with arguments
  const executeCommand = `./build.py ${cmdArgs}`;

  // For cross-platform compatibility, especially on Windows, adjust the command
  const isWindows = process.platform === 'win32';
  const finalCommand = isWindows
    ? `python "${path.join('miracle', 'build.py')}" ${cmdArgs}`
    : executeCommand;

  // Navigate to the workspace root and execute the build script
  terminal.sendText(`cd "${workspaceRoot}/miracle" && ${finalCommand}`);
  terminal.show();
}

export function deactivate() {}

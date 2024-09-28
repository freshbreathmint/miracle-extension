import * as vscode from 'vscode';
import { IniTreeDataProvider, IniTreeItem } from './treeView';
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
      iniTreeDataProvider.addLibrary();
    }),
    vscode.commands.registerCommand('miracle.compileHot', async (item: any) => {
      if (item) {
        let target: string;
        if (item.label === 'application') {
          target = 'application';
        } else {
          target = item.label;
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
    }),
    // Register new build and run commands
    vscode.commands.registerCommand('miracle.buildExecutable', (linkType: string, platform: string, buildType: string) => {
      runBuildScript(
        'build-exe',
        ['--platform', platform, '--link', linkType, '--build-type', buildType],
        workspaceRoot
      );
    }),
    vscode.commands.registerCommand('miracle.fullHotCompile', (platform: string) => {
      // Run the build script for the specified platform
      runBuildScript('build', ['--target', 'all', '--platform', platform, '--build-type', 'hot'], workspaceRoot);
    }),
    vscode.commands.registerCommand('miracle.runExecutable', (buildType: string, platform: string) => {
      runExecutable(buildType, platform, workspaceRoot);
    }),
    // Register the cleanBuildDirectories command
    vscode.commands.registerCommand('miracle.cleanBuildDirectories', () => {
      runBuildScript('clean', [], workspaceRoot);
    })
  );

  // Initialize the Build Panel
  const buildPanelProvider = new BuildPanelProvider(context);
  vscode.window.registerWebviewViewProvider(BuildPanelProvider.viewType, buildPanelProvider);
}

function runBuildScript(command: string, args: string[], workspaceRoot: string) {
  const buildScriptPath = path.join(workspaceRoot, 'miracle', 'scripts', 'build.py');

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

  let terminal = vscode.window.terminals.find((t) => t.name === 'Miracle Framework');
  if (!terminal) {
    terminal = vscode.window.createTerminal('Miracle Framework');
  }

  const cmdArgs = [command, ...args].join(' ');

  // Construct the command to execute build.py with arguments
  const isWindows = process.platform === 'win32';
  const pythonCommand = isWindows ? 'python' : 'python3';
  const finalCommand = `${pythonCommand} scripts/build.py ${cmdArgs}`;

  // Send the command to the terminal
  terminal.sendText(`cd "${path.join(workspaceRoot, 'miracle')}" && ${finalCommand}`);
  terminal.show();
}

function runExecutable(buildType: string, platform: string, workspaceRoot: string) {
  const runScriptPath = path.join(workspaceRoot, 'miracle', 'scripts', 'run.py');

  if (!fs.existsSync(runScriptPath)) {
    vscode.window.showErrorMessage(`Run script not found at ${runScriptPath}`);
    return;
  }

  // Determine the build directory (debug or release)
  const dir = buildType === 'hot' || buildType === 'debug' ? 'debug' : 'release';

  // Build the path to the executable relative to the 'miracle' folder
  let execCommand = path.join('bin', platform, dir, 'executable');
  if (platform === 'windows') {
    execCommand += '.exe';
  }

  // Build the command to run run.py with execCommand as argument
  const isWindows = process.platform === 'win32';
  const pythonCommand = isWindows ? 'python' : 'python3';
  const command = `${pythonCommand} scripts/run.py "${execCommand}"`;

  // Find or create the 'Miracle Framework' terminal
  let terminal = vscode.window.terminals.find(t => t.name === 'Miracle Framework');
  if (!terminal) {
    terminal = vscode.window.createTerminal('Miracle Framework');
  }

  // Send the command to the terminal
  terminal.sendText(`cd "${path.join(workspaceRoot, 'miracle')}" && ${command}`);
  terminal.show();
}

export function deactivate() {}
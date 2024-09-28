import * as vscode from 'vscode';
import * as ini from 'ini';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export class IniTreeDataProvider implements vscode.TreeDataProvider<IniTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<IniTreeItem | undefined | void> = new vscode.EventEmitter<IniTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<IniTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  private iniData: any;
  private iniPath: string;
  private terminalName: string = 'Miracle Framework';

  constructor(private workspaceRoot: string) {
    this.iniPath = path.join(this.workspaceRoot, 'config.ini');
    this.loadIniFile();

    // Watch for changes to the ini file
    fs.watchFile(this.iniPath, () => {
      this.refresh();
    });
  }

  refresh(): void {
    this.loadIniFile();
    this._onDidChangeTreeData.fire();
  }

  loadIniFile() {
    if (fs.existsSync(this.iniPath)) {
      const content = fs.readFileSync(this.iniPath, 'utf-8');
      this.iniData = ini.parse(content);
    } else {
      vscode.window.showErrorMessage(`config.ini not found at ${this.iniPath}`);
    }
  }

  getTreeItem(element: IniTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: IniTreeItem): Thenable<IniTreeItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No workspace open');
      return Promise.resolve([]);
    }

    if (element) {
      // Return child keys
      const data = element.data;
      if (typeof data === 'object') {
        return Promise.resolve(
          Object.keys(data).map(
            (key) =>
              new IniTreeItem(
                key,
                data[key],
                typeof data[key] === 'object'
                  ? vscode.TreeItemCollapsibleState.Collapsed
                  : vscode.TreeItemCollapsibleState.None,
                element.section // Pass the current section
              )
          )
        );
      } else {
        // No children
        return Promise.resolve([]);
      }
    } else {
      // Return root sections
      return Promise.resolve(
        Object.keys(this.iniData).map((key) => {
          const item = new IniTreeItem(key, this.iniData[key], vscode.TreeItemCollapsibleState.Collapsed, key);
          // Set contextValue for application and library nodes
          if (key === 'application' || key.startsWith('library.')) {
            item.contextValue = 'applicationOrLibrary';
          } else {
            item.contextValue = 'iniSection';
          }
          return item;
        })
      );
    }
  }

  updateIniValue(item: IniTreeItem, value: string) {
    const section = item.section;
    const key = item.label;

    if (section && this.iniData[section]) {
      this.iniData[section][key] = value;
    } else {
      this.iniData[key] = value;
    }

    this.updateIniFile();
    this.refresh();
  }

  addDependency(item: IniTreeItem, dependency: string) {
    const section = item.section || item.label;

    if (!section || !this.iniData[section]) {
      vscode.window.showErrorMessage(`Section ${section} not found.`);
      return;
    }

    const targetData = this.iniData[section];

    const currentDeps = targetData['dependencies'] || '';
    const depsArray = currentDeps ? currentDeps.split(',').map((dep: string) => dep.trim()) : [];
    if (!depsArray.includes(dependency)) {
      depsArray.push(dependency);
      targetData['dependencies'] = depsArray.join(',');
      this.updateIniFile();
      this.refresh();
    } else {
      vscode.window.showInformationMessage(`Dependency ${dependency} already exists.`);
    }
  }

  async addLibrary() {
    try {
      // Prompt for the library name
      let libraryName = await vscode.window.showInputBox({ prompt: 'Enter new library name' });
      if (!libraryName) {
        return; // User canceled
      }
  
      // Sanitize libraryName to remove leading './', '/', or any backslashes
      libraryName = libraryName.replace(/^\.?\/+/, '').replace(/[\\/]/g, '').trim();
  
      // Optional: Validate libraryName to contain only allowed characters
      const validNameRegex = /^[A-Za-z0-9_-]+$/;
      if (!validNameRegex.test(libraryName)) {
        vscode.window.showErrorMessage('Library name can only contain letters, numbers, underscores, and hyphens.');
        return;
      }
  
      // Ensure the 'library' section exists
      if (!this.iniData['library']) {
        this.iniData['library'] = {};
      }
  
      const libSection = libraryName;
      if (this.iniData['library'][libSection]) {
        vscode.window.showErrorMessage(`Library ${libraryName} already exists.`);
        return;
      }
  
      // Prompt for library type: static or dynamic
      const libType = await vscode.window.showQuickPick(['static', 'dynamic'], {
        placeHolder: 'Select library type',
      });
      if (!libType) {
        return; // User canceled
      }
  
      // Run setup.py with the library name and type (located in scripts/)
      await this.runSetupScript(libraryName, libType);
  
      // After setup.py runs, add the new library section to iniData
      this.iniData['library'][libSection] = {
        path: libraryName, // Assuming the path is the same as libraryName
        type: libType,
        dependencies: '',
      };
  
      // Write the updated iniData back to the ini file
      this.updateIniFile();
  
      // Ask if the user wants to add this library as a dependency
      const addDependency = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Add this library as a dependency to application or other libraries?',
      });
      if (addDependency === 'Yes') {
        // Get a list of 'application' and existing libraries
        const options = ['application'];
        if (this.iniData['library']) {
          options.push(...Object.keys(this.iniData['library']).map(lib => `library.${lib}`));
        }
  
        const target = await vscode.window.showQuickPick(options, {
          placeHolder: 'Select where to add this dependency',
        });
        if (target) {
          // Extract the section name
          let sectionName = target;
          if (target.startsWith('library.')) {
            const libName = target.split('library.')[1];
            sectionName = `library.${libName}`;
          }
  
          // Update iniData to add this library as a dependency to the selected target
          let targetData;
          if (sectionName === 'application') {
            targetData = this.iniData['application'];
          } else {
            const libKey = sectionName.split('library.')[1];
            targetData = this.iniData['library'][libKey];
          }
  
          if (targetData) {
            const currentDeps = targetData['dependencies'] || '';
            const depsArray = currentDeps ? currentDeps.split(',').map((dep: string) => dep.trim()) : [];
            if (!depsArray.includes(libraryName)) {
              depsArray.push(libraryName);
              targetData['dependencies'] = depsArray.join(',');
              this.updateIniFile();
              this.refresh();
            }
          }
        }
      }
  
      // Refresh the tree view
      this.refresh();
      vscode.window.showInformationMessage(`Library '${libraryName}' added successfully.`);
    } catch (error) {
      // Handle errors if necessary
      vscode.window.showErrorMessage(`Failed to add library: ${error}`);
    }
  }  

  async runSetupScript(libraryName: string, libType: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Construct the command to execute setup.py with arguments (located in scripts/)
      const setupScriptPath = path.join(this.workspaceRoot, 'miracle', 'scripts', 'setup.py');
      const isWindows = process.platform === 'win32';
      const pythonCommand = isWindows ? 'python' : 'python3';
      const cmdArgs = `"${setupScriptPath}" library "${libraryName}" "${libType}"`;
      const finalCommand = `${pythonCommand} ${cmdArgs}`;

      // Execute the command using child_process.exec
      exec(finalCommand, { cwd: path.join(this.workspaceRoot, 'miracle') }, (error, stdout, stderr) => {
        if (error) {
          vscode.window.showErrorMessage(`Error running setup script: ${error.message}\n${stderr}`);
          reject(error);
          return;
        }
        if (stderr) {
          console.error(`Setup script stderr: ${stderr}`);
        }
        if (stdout) {
          console.log(`Setup script stdout: ${stdout}`);
        }
        vscode.window.showInformationMessage(`Setup script executed successfully.`);
        resolve();
      });
    });
  }

  private updateIniFile() {
    const iniContent = ini.stringify(this.iniData);
    fs.writeFileSync(this.iniPath, iniContent);
  }
}

export class IniTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly data: any,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly section: string
  ) {
    super(label, collapsibleState);

    if (typeof data !== 'object') {
      this.description = String(data);
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.command = {
        command: 'miracle.editIniValue',
        title: 'Edit INI Value',
        arguments: [this],
      };
      this.contextValue = 'iniItem';
    } else {
      // Determine contextValue
      if (section === 'application' || section.startsWith('library.')) {
        // This is the 'application' node or a 'library.x' node
        this.contextValue = 'applicationOrLibrary';
      } else {
        this.contextValue = 'iniSection';
      }
    }
  }
}
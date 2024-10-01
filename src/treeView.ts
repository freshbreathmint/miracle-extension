import * as vscode from 'vscode';
import * as ini from 'ini';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

/**
 * IniTreeDataProvider is responsible for providing the data for the tree view
 * based on the contents of a config.ini file.
 */
export class IniTreeDataProvider implements vscode.TreeDataProvider<IniTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<IniTreeItem | undefined | void> = new vscode.EventEmitter<IniTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<IniTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  private iniData: any;
  private iniPath: string;
  private terminalName: string = 'Miracle Framework';

  constructor(private workspaceRoot: string) {
    this.iniPath = path.join(this.workspaceRoot, 'config.ini');
    this.loadIniFile();

    // Watch for changes to the ini file and refresh the tree view when it changes
    fs.watchFile(this.iniPath, () => {
      this.refresh();
    });
  }

  /**
   * Refreshes the tree view by reloading the INI file and triggering an update.
   */
  refresh(): void {
    this.loadIniFile();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Loads the INI file from the workspace root.
   */
  loadIniFile() {
    if (fs.existsSync(this.iniPath)) {
      const content = fs.readFileSync(this.iniPath, 'utf-8');
      this.iniData = ini.parse(content);
    } else {
      vscode.window.showErrorMessage(`config.ini not found at ${this.iniPath}`);
      this.iniData = {}; // Initialize iniData to prevent undefined errors
    }
  }

  /**
   * Retrieves the TreeItem representation of an IniTreeItem.
   * @param element The IniTreeItem to convert.
   */
  getTreeItem(element: IniTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Provides the children of a given element in the tree.
   * @param element The parent IniTreeItem.
   */
  getChildren(element?: IniTreeItem): Thenable<IniTreeItem[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No workspace open');
      return Promise.resolve([]);
    }

    if (element) {
      // Return child keys or sub-sections
      const data = element.data;
      if (typeof data === 'object') {
        return Promise.resolve(
          Object.keys(data).map((key) => {
            const isSection = typeof data[key] === 'object';
            const sectionPath = isSection
              ? (element.section ? `${element.section}.${key}` : key)
              : element.section; // Retain parent section for keys
            const collapsibleState = isSection
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None;

            const item = new IniTreeItem(key, data[key], collapsibleState, sectionPath);
            return item;
          })
        );
      } else {
        // No children
        return Promise.resolve([]);
      }
    } else {
      // Return root sections
      return Promise.resolve(
        Object.keys(this.iniData).map((key) => {
          const data = this.iniData[key];
          const isSection = typeof data === 'object';
          const sectionPath = key; // top-level keys
          const collapsibleState = isSection
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

          const item = new IniTreeItem(key, data, collapsibleState, sectionPath);

          // Set contextValue for application and library nodes
          if (key === 'application' || key === 'library') {
            item.contextValue = 'applicationOrLibrary';
          } else {
            item.contextValue = 'iniSection';
          }

          return item;
        })
      );
    }
  }

  /**
   * Helper function to traverse the iniData based on a section path.
   * @param sectionPath The dot-separated section path (e.g., 'library.test').
   * @returns The section data if found, otherwise undefined.
   */
  private getSectionData(sectionPath: string): any | undefined {
    const parts = sectionPath.split('.');
    let data = this.iniData;
    for (const part of parts) {
      if (data && data[part] !== undefined) {
        data = data[part];
      } else {
        return undefined;
      }
    }
    return data;
  }

  /**
   * Updates a value in the INI data and writes it back to the file.
   * @param item The IniTreeItem to update.
   * @param value The new value.
   */
  updateIniValue(item: IniTreeItem, value: string) {
    const section = item.section;
    const key = item.label;

    const targetData = this.getSectionData(section);

    if (targetData) {
      targetData[key] = value;
      this.updateIniFile();
      this.refresh();
      vscode.window.showInformationMessage(`Updated '${key}' in section [${section}] to '${value}'.`);
    } else {
      vscode.window.showErrorMessage(`Section [${section}] not found.`);
    }
  }

  /**
   * Adds a dependency to a specified IniTreeItem.
   * @param item The IniTreeItem to which the dependency will be added.
   * @param dependency The dependency to add.
   */
  addDependency(item: IniTreeItem, dependency: string) {
    const section = item.section || item.label;

    const targetData = this.getSectionData(section);

    if (!section || !targetData) {
      vscode.window.showErrorMessage(`Section [${section}] not found.`);
      return;
    }

    const currentDeps = targetData['dependencies'] || '';
    const depsArray = currentDeps ? currentDeps.split(',').map((dep: string) => dep.trim()) : [];
    if (!depsArray.includes(dependency)) {
      depsArray.push(dependency);
      targetData['dependencies'] = depsArray.join(',');
      this.updateIniFile();
      this.refresh();
      vscode.window.showInformationMessage(`Added dependency '${dependency}' to section [${section}].`);
    } else {
      vscode.window.showInformationMessage(`Dependency '${dependency}' already exists in section [${section}].`);
    }
  }

  /**
   * Adds a new library by prompting the user for input and updating the INI file accordingly.
   */
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

      // Ensure 'library' section exists
      if (!this.iniData['library']) {
        this.iniData['library'] = {};
      }

      // Check if the specific library already exists
      if (this.iniData['library'][libraryName]) {
        vscode.window.showErrorMessage(`Library '${libraryName}' already exists.`);
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

      // After setup.py runs, add the new library to iniData
      this.iniData['library'][libraryName] = {
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
          // Extract library names
          const libraryKeys = Object.keys(this.iniData['library']).map(libName => `library.${libName}`);
          options.push(...libraryKeys);
        }

        const target = await vscode.window.showQuickPick(options, {
          placeHolder: 'Select where to add this dependency',
        });
        if (target) {
          // The target is already a flat section name like 'application' or 'library.test'
          const sectionName = target;

          // Update iniData to add this library as a dependency to the selected target
          const targetData = this.getSectionData(sectionName);

          if (targetData) {
            const currentDeps = targetData['dependencies'] || '';
            const depsArray = currentDeps ? currentDeps.split(',').map((dep: string) => dep.trim()) : [];
            if (!depsArray.includes(libraryName)) {
              depsArray.push(libraryName);
              targetData['dependencies'] = depsArray.join(',');
              this.updateIniFile();
              this.refresh();
              vscode.window.showInformationMessage(`Added '${libraryName}' as a dependency to section [${sectionName}].`);
            } else {
              vscode.window.showInformationMessage(`Dependency '${libraryName}' already exists in section [${sectionName}].`);
            }
          } else {
            vscode.window.showErrorMessage(`Section [${sectionName}] not found.`);
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

  /**
   * Runs the setup.py script to initialize a new library.
   * @param libraryName The name of the library to create.
   * @param libType The type of the library (static or dynamic).
   */
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

  /**
   * Writes the current INI data back to the config.ini file.
   */
  private updateIniFile() {
    const iniContent = ini.stringify(this.iniData);
    fs.writeFileSync(this.iniPath, iniContent);
  }
}

/**
 * IniTreeItem represents each item in the tree view.
 * It extends VS Code's TreeItem and includes additional properties for handling INI data.
 */
export class IniTreeItem extends vscode.TreeItem {
  /**
   * Creates a new IniTreeItem.
   * @param label The label of the tree item.
   * @param data The underlying data from the INI file.
   * @param collapsibleState The collapsible state of the item.
   * @param section The full section path in the INI file.
   */
  constructor(
    public readonly label: string,
    public readonly data: any,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly section: string
  ) {
    super(label, collapsibleState);

    if (typeof data !== 'object') {
      // Leaf node: display the value and set up the edit command
      this.description = String(data);
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.command = {
        command: 'miracle.editIniValue',
        title: 'Edit INI Value',
        arguments: [this],
      };
      this.contextValue = 'iniItem';
    } else {
      // Parent node: determine the contextValue based on the section path
      if (
        section === 'application' ||
        section === 'library' ||
        section.startsWith('library.')
      ) {
        // This is the 'application' node or a 'library' node
        this.contextValue = 'applicationOrLibrary';
      } else {
        this.contextValue = 'iniSection';
      }
    }
  }
}

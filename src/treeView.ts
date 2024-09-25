import * as vscode from 'vscode';
import * as ini from 'ini';
import * as fs from 'fs';
import * as path from 'path';

export class IniTreeDataProvider implements vscode.TreeDataProvider<IniTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<IniTreeItem | undefined | void> = new vscode.EventEmitter<IniTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<IniTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  private iniData: any;
  private iniPath: string;

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
                typeof data[key] === 'object' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                element.section ? `${element.section}.${element.label}` : element.label
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
          const item = new IniTreeItem(
            key,
            this.iniData[key],
            vscode.TreeItemCollapsibleState.Collapsed,
            ''
          );
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
    const keys = item.section ? item.section.split('.').concat(item.label) : [item.label];
    let ref = this.iniData;
    for (let i = 0; i < keys.length - 1; i++) {
      ref = ref[keys[i]];
    }
    ref[keys[keys.length - 1]] = value;
    this.updateIniFile();
    this.refresh();
  }

  addDependency(item: IniTreeItem, dependency: string) {
    const section = item.section ? `${item.section}.${item.label}` : item.label;
    if (this.iniData[section]) {
      const currentDeps = this.iniData[section]['dependencies'];
      if (currentDeps) {
        this.iniData[section]['dependencies'] = currentDeps + ',' + dependency;
      } else {
        this.iniData[section]['dependencies'] = dependency;
      }
      this.updateIniFile();
      this.refresh();
    } else {
      vscode.window.showErrorMessage(`Section ${section} not found.`);
    }
  }

  addLibrary(libraryName: string) {
    const libSection = `library.${libraryName}`;
    if (this.iniData[libSection]) {
      vscode.window.showErrorMessage(`Library ${libraryName} already exists.`);
      return;
    }
    const libraryPath = path.join(this.workspaceRoot, libraryName);
    const srcPath = path.join(libraryPath, 'src');
    const includePath = path.join(libraryPath, 'include');

    // Create the directories
    fs.mkdirSync(srcPath, { recursive: true });
    fs.mkdirSync(includePath, { recursive: true });

    this.iniData[libSection] = {
      path: libraryName,
      type: 'static',
      dependencies: ''
    };
    this.updateIniFile();
    this.refresh();
  }

  private updateIniFile() {
    let iniContent = ini.stringify(this.iniData);

    // Post-process to replace escaped dots in section names
    iniContent = iniContent.replace(/^\[(.+)\]$/gm, (match, sectionName) => {
      // Replace escaped dots with actual dots
      const unescapedSectionName = sectionName.replace(/\\\./g, '.');
      return `[${unescapedSectionName}]`;
    });

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
        arguments: [this]
      };
      this.contextValue = 'iniItem';
    } else {
      // Determine contextValue
      const fullSection = section ? `${section}.${label}` : label;
      if (fullSection === 'application' || fullSection.startsWith('library.')) {
        // This is the 'application' node or a 'library.x' node
        this.contextValue = 'applicationOrLibrary';
      } else {
        this.contextValue = 'iniSection';
      }
    }
  }
}
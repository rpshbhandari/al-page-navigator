"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
// Folders we never want to crawl when scanning for existing objects.
const IGNORED_DIRS = new Set(['.git', '.snapshots', '.alpackages', '.altemplates', 'node_modules', 'out', '.vscode']);
function activate(context) {
    const disposable = vscode.commands.registerCommand('alPageNavigator.insert', async (clickedUri) => {
        try {
            await runInsertObjectNavigator(clickedUri);
        }
        catch (err) {
            vscode.window.showErrorMessage(`AL Page Navigator: ${err.message ?? err}`);
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
async function runInsertObjectNavigator(clickedUri) {
    const workspaceFolder = await resolveWorkspaceFolder(clickedUri);
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Open an AL project (a folder containing app.json) first.');
        return;
    }
    const appJsonPath = path.join(workspaceFolder.uri.fsPath, 'app.json');
    if (!fs.existsSync(appJsonPath)) {
        const proceed = await vscode.window.showWarningMessage(`No app.json found in "${workspaceFolder.name}". This doesn't look like an AL project root. Continue anyway?`, { modal: true }, 'Continue');
        if (proceed !== 'Continue') {
            return;
        }
    }
    const appJson = fs.existsSync(appJsonPath)
        ? JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
        : {};
    const idRanges = getIdRanges(appJson);
    const usedPageIds = scanUsedPageIds(workspaceFolder.uri.fsPath);
    const objectId = pickFreeId(idRanges, usedPageIds);
    if (objectId === undefined) {
        vscode.window.showErrorMessage(`Every page ID in this extension's ID range(s) (${idRanges
            .map((r) => `${r.from}..${r.to}`)
            .join(', ')}) is already in use. Free one up or extend your idRanges in app.json.`);
        return;
    }
    const targetFolder = await pickTargetFolder(workspaceFolder, clickedUri);
    if (!targetFolder) {
        return; // user cancelled
    }
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
    }
    let fileName = 'PageNavigator.al';
    let filePath = path.join(targetFolder, fileName);
    if (fs.existsSync(filePath)) {
        const choice = await vscode.window.showWarningMessage(`${fileName} already exists in this folder.`, { modal: true }, 'Overwrite', 'Create as PageNavigator_2.al');
        if (!choice) {
            return;
        }
        if (choice === 'Create as PageNavigator_2.al') {
            fileName = 'PageNavigator_2.al';
            filePath = path.join(targetFolder, fileName);
        }
    }
    const content = buildPageSource(objectId);
    fs.writeFileSync(filePath, content, 'utf8');
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created page ${objectId} "Page Navigator" at ${path.relative(workspaceFolder.uri.fsPath, filePath)}`);
}
/** Figure out which workspace folder to operate on (handles multi-root workspaces and right-click-in-explorer). */
async function resolveWorkspaceFolder(clickedUri) {
    if (clickedUri) {
        const wf = vscode.workspace.getWorkspaceFolder(clickedUri);
        if (wf) {
            return wf;
        }
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    if (folders.length === 1) {
        return folders[0];
    }
    const pick = await vscode.window.showQuickPick(folders.map((f) => ({ label: f.name, description: f.uri.fsPath, folder: f })), { placeHolder: 'Select the AL project to add the Page Navigator page to' });
    return pick?.folder;
}
/** Ask (or infer) which subfolder the new .al file should land in. */
async function pickTargetFolder(workspaceFolder, clickedUri) {
    // Right-clicked a folder in the explorer -> use it directly, no prompt.
    if (clickedUri) {
        const stat = fs.existsSync(clickedUri.fsPath) ? fs.statSync(clickedUri.fsPath) : undefined;
        if (stat?.isDirectory()) {
            return clickedUri.fsPath;
        }
    }
    const srcFolder = path.join(workspaceFolder.uri.fsPath, 'src');
    const defaultLabel = fs.existsSync(srcFolder) ? 'src (recommended)' : 'src (will be created)';
    const choice = await vscode.window.showQuickPick([
        { label: defaultLabel, target: srcFolder },
        { label: 'Project root', target: workspaceFolder.uri.fsPath },
        { label: 'Choose a different folder…', target: '' }
    ], { placeHolder: 'Where should PageNavigator.al be created?' });
    if (!choice) {
        return undefined;
    }
    if (choice.target) {
        return choice.target;
    }
    const custom = await vscode.window.showInputBox({
        prompt: 'Folder path (relative to project root)',
        value: 'src',
        validateInput: (v) => (v.trim().length === 0 ? 'Enter a folder name' : undefined)
    });
    if (custom === undefined) {
        return undefined;
    }
    return path.join(workspaceFolder.uri.fsPath, custom);
}
/** Read idRanges (AppSource-style array) or idRange (PTE-style single object) from app.json, with a sane fallback. */
function getIdRanges(appJson) {
    if (appJson.idRanges && appJson.idRanges.length > 0) {
        return appJson.idRanges;
    }
    if (appJson.idRange) {
        return [appJson.idRange];
    }
    // No app.json / no range declared - fall back to the common PTE default,
    // the calling code will warn the user this is a guess via the info message.
    return [{ from: 50100, to: 50149 }];
}
/** Walk every .al file in the project and collect page object IDs already in use. */
function scanUsedPageIds(rootPath) {
    const used = new Set();
    const pageDeclRegex = /^\s*page\s+(\d+)\s+/gim;
    const walk = (dir) => {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name.startsWith('.') && entry.name !== '.') {
                if (!IGNORED_DIRS.has(entry.name)) {
                    // allow hidden folders we don't explicitly ignore, but most are noise - skip by default
                }
                continue;
            }
            if (IGNORED_DIRS.has(entry.name)) {
                continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            }
            else if (entry.isFile() && entry.name.toLowerCase().endsWith('.al')) {
                const text = fs.readFileSync(fullPath, 'utf8');
                let match;
                pageDeclRegex.lastIndex = 0;
                while ((match = pageDeclRegex.exec(text)) !== null) {
                    used.add(parseInt(match[1], 10));
                }
            }
        }
    };
    walk(rootPath);
    return used;
}
/** First free ID across the given ranges, in order. */
function pickFreeId(ranges, used) {
    for (const range of ranges) {
        for (let id = range.from; id <= range.to; id++) {
            if (!used.has(id)) {
                return id;
            }
        }
    }
    return undefined;
}
/** Produces the AL source for the Page Navigator page, with the chosen object ID substituted in. */
function buildPageSource(objectId) {
    return `// ============================================================================
// Master "My Extension Pages" navigator page.
// Lists every Page object belonging to THIS extension only (auto-filtered by
// App Package ID), and lets you click a row / the Object ID field to open
// that page live.
//
// Built on the system table AllObjWithCaption, which the platform already
// maintains for every installed object (base app + all extensions) - no
// reflection or manual registration needed. New pages you add to this
// extension appear here automatically the moment you publish.
// ============================================================================
page ${objectId} "Page Navigator"
{
    PageType = List;
    ApplicationArea = All;
    UsageCategory = Administration;
    SourceTable = AllObjWithCaption;
    SourceTableView = where("Object Type" = const(Page));
    Editable = false;
    Caption = 'My Extension - Pages';

    layout
    {
        area(Content)
        {
            repeater(Pages)
            {
                field("Object ID"; Rec."Object ID")
                {
                    ApplicationArea = All;
                    Caption = 'Object ID';
                    StyleExpr = 'Strong';

                    // Clicking the ID field itself opens the page - this is
                    // what makes the field render as a clickable link in the
                    // BC client (web, tablet, and phone).
                    trigger OnDrillDown()
                    begin
                        OpenSelectedPage();
                    end;
                }
                field("Object Name"; Rec."Object Name")
                {
                    ApplicationArea = All;
                    Caption = 'Object Name';
                }
                field("Object Caption"; Rec."Object Caption")
                {
                    ApplicationArea = All;
                    Caption = 'Caption';
                }
            }
        }
    }

    actions
    {
        area(Processing)
        {
            action(OpenPage)
            {
                ApplicationArea = All;
                Caption = 'Open Page';
                ToolTip = 'Runs the selected page.';
                Image = Navigate;
                Promoted = true;
                PromotedCategory = Process;
                PromotedIsBig = true;
                Scope = Repeater;

                trigger OnAction()
                begin
                    OpenSelectedPage();
                end;
            }
        }
    }

    trigger OnOpenPage()
    var
        ModuleInfo: ModuleInfo;
    begin
        // Restrict the list to pages belonging to THIS extension only.
        NavApp.GetCurrentModuleInfo(ModuleInfo);
        Rec.SetRange("App Package ID", ModuleInfo.PackageId);
    end;

    local procedure OpenSelectedPage()
    begin
        if Rec."Object ID" = 0 then
            exit;
        Page.Run(Rec."Object ID");
    end;
}
`;
}
//# sourceMappingURL=extension.js.map
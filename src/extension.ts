import * as vscode from 'vscode';
import * as path from 'path';
import { findClassName, getImplementations, Implementation, processFunctionDeclaration } from './parsing';

interface SetupResult {
    editor: vscode.TextEditor | undefined;
    hppContent: string | undefined;
    cppFilePath: string | undefined;
    className: string | undefined;
}

function setupAnalyser(): SetupResult {
    const editor = vscode.window.activeTextEditor;
    let { hppContent, cppFilePath, className }: SetupResult = {
        editor: editor,
        hppContent: undefined,
        cppFilePath: undefined,
        className: undefined
    };
    const result: SetupResult = { editor, hppContent, cppFilePath, className };
    if (!editor) {
        vscode.window.showInformationMessage('No active editor found.');
        return result;
    }

    const hppFilePath = editor.document.fileName;
    if (!hppFilePath.endsWith('.hpp') && !hppFilePath.endsWith('.h')) {
        vscode.window.showInformationMessage('Active file must be a .hpp or .h file.');
        return result;
    }

    cppFilePath = hppFilePath.replace(/\.h(pp)?$/, '.cpp');

    hppContent = editor.document.getText();
    className = findClassName(hppContent);

    if (!className) {
        vscode.window.showErrorMessage('Could not find a class definition in the current file using the robust regex.');
        return result;
    }
    return { editor, hppContent, cppFilePath, className };
}

/**
 * Writes new content to a file, skipping implementations that already exist in the target file.
 */
export async function writeToFile(filePath: string, className: string, newImplementations: Implementation[]) {
    const cppDocument = await vscode.workspace.openTextDocument(filePath);
    const existingCppContent = cppDocument.getText();
    const lastLine = cppDocument.lineCount-1;
    const lastPosition = new vscode.Position(lastLine, cppDocument.lineAt(lastLine).text.length);
    const cppEditor = await vscode.window.showTextDocument(cppDocument, vscode.ViewColumn.Beside);
    cppEditor.edit(editBuilder => {
        if(!existingCppContent.match(/#include\s+"HatsDisplayPanel\.hpp"/)) {
            editBuilder.insert(new vscode.Position(0, 0), `#include "${className}.hpp"\n`);
        }
        if(!existingCppContent.endsWith("\n")) {
            editBuilder.insert(lastPosition, "\n");
        }
        for(const block of newImplementations) {
            if(block.position >= 0 && block.line == -1) {
                const position = block.position == lastLine ? lastPosition : new vscode.Position(block.position, 0);
                editBuilder.insert(position, block.text);
            }
        }
    }).then(success => {
        if (success) {
            vscode.window.showInformationMessage(`Generated implementation(s) for ${className} in ${path.basename(filePath)}.`);
        } else {
            vscode.window.showErrorMessage('Failed to write to CPP file.');
        }
    });
}

export function activate(context: vscode.ExtensionContext) {
    const disposableAll = vscode.commands.registerCommand('cpp-dev-helper.generateImplementation', async () => {
        const { editor, hppContent, cppFilePath, className } = setupAnalyser();
        if (!editor || !hppContent || !cppFilePath || !className) return;
        const cppDocument = await vscode.workspace.openTextDocument(cppFilePath);
        const existingCppContent = cppDocument.getText();

        const implementations = getImplementations(hppContent, existingCppContent, className);
        if (implementations) {
            await writeToFile(cppFilePath, className, implementations);
        }
    });

    const disposableSingle = vscode.commands.registerCommand('cpp-dev-helper.generateSingleImplementation', async () => {
        const { editor, hppContent, cppFilePath, className } = await setupAnalyser();
        if (!editor || !hppContent || !cppFilePath || !className) return;
        const cppDocument = await vscode.workspace.openTextDocument(cppFilePath);
        const existingCppContent = cppDocument.getText();

        const cursorPosition = editor.selection.active;
        const lineText = editor.document.lineAt(cursorPosition.line).text;
        const implementation = processFunctionDeclaration(lineText, className);

        if (implementation) {
            const implementations = getImplementations(hppContent, existingCppContent, className, implementation);
            if (implementations) {
                await writeToFile(cppFilePath, className, implementations);
            }
        } else {
            vscode.window.showErrorMessage(`Could not parse the line:\n\n${lineText.trim()}\n\nEnsure it is a valid function or constructor.`);
        }
    });

    context.subscriptions.push(disposableAll, disposableSingle);
}

export function deactivate() { }
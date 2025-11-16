import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const typesRegex = /([\w\d<>*&]+)\s+/
const opsymRegex = /(!=|!==|==|===|\+|-|\*|\/|%|\^|&|\||~|!|=|<=|>=|<<|>>|\+=|-=|\*=|%=|\^=|&=|\|=|<<=|>>=|&&|\|\||\+\+|--|,|->\*|->|\[\]|\(\)|<=>|<|>)\s*/;
const paramRegex = /(\([^\)]*\))\s*/
const constRegex = /(const)?\s*/
const namesRegex = /([\w\d~]+)\s*/
const virtuRegex = /(virtual\s+)?/

function processOperatorDeclaration(declaration: string, className: string): string | null {
    // Regex for operator functions:
    // This handles single/double/triple char operators (like +, ==, <=>),
    // and special tokens like () and [].


    // Group 1: Return Type (e.g., 'void', 'int&')
    // Group 2: The actual operator token (e.g., '+', '[]', '()')
    // Group 3: Arguments (e.g., '(int val1)', '()') - Note: () are part of G3 for non-[] operators
    // Group 4: Const qualifier (optional)

    // We need two regexes because operator[] has args inside brackets, not parens
    const match = declaration.trim().match(
        new RegExp(
            `^${typesRegex.source}operator` +
            `${opsymRegex.source}${paramRegex.source}${constRegex.source};`
        )
    );

    if (!match) {
        return null; // Not a valid operator syntax
    }

    const returnType = match[1].trim();
    const operatorToken = match[2].trim();
    const argsWithParens = match[3].trim(); // The arguments including their containers () or []
    const constQualifier = match[4] ? ` ${match[4].trim()}` : '';

    // Format: ReturnType ClassName::operator TOKEN (Args/inside Brackets) ConstQualifier { \n\n }
    return `${returnType} ${className}::operator${operatorToken}${argsWithParens}${constQualifier} {\n    \n}\n\n`;
}

function processFunctionDeclaration(declaration: string, className: string): string | null {

    // 1. Try to process as an operator() first
    const operatorImpl = processOperatorDeclaration(declaration, className);
    if (operatorImpl) {
        return operatorImpl;
    }

    // 2. If not operator(), use the previous logic for standard functions/constructors
    // Group 1: virtual (optional)
    // Group 2: Return Type (optional/empty for constructors)
    // Group 3: Function/Constructor Name (e.g., ReadInputs, ~GamepadWindow)
    // Group 4: Arguments (including parentheses)
    // Group 5: Const qualifier (optional)
    const match = declaration.trim().match(
        new RegExp(
            `^(?:${virtuRegex.source}${typesRegex.source})?` +
            `${namesRegex.source}${paramRegex.source}${constRegex.source};`
        )
        ///^(?:(virtual\s+)?([\w\d<>*&]+)\s+)?([\w\d~]+)\s*(\([^\)]*\))\s*(const)?\s*;/
    );
    vscode.window.showErrorMessage(`^(?:${virtuRegex.source}${typesRegex.source})?` +
            `${namesRegex.source}${paramRegex.source}${constRegex.source};`);
    vscode.window.showErrorMessage(/^(?:(virtual\s+)?([\w\d<>*&]+)\s+)?([\w\d~]+)\s*(\([^\)]*\))\s*(const)?\s*;/.source);

    if (!match) {
        return null; // No valid standard declaration found on this line
    }

    const returnTypeRaw = match[2]; // Group 2 (e.g., 'void', 'int', 'std::string')
    const functionName = match[3].trim(); // Group 3 (e.g., 'ReadInputs', '~GamepadWindow')
    const argsWithParens = match[4].trim(); // Group 4 (e.g., '(wxTimerEvent &event)')
    const constQualifier = match[5] ? ` ${match[5].trim()}` : ''; // Group 5 (e.g., 'const')

    let returnPrefix = '';

    if (returnTypeRaw) {
        returnPrefix = `${returnTypeRaw.trim()} ${className}::`;
    } else {
        // Constructor/Destructor
        returnPrefix = `${className}::`;
    }

    // Final Format: [ReturnType] ClassName::FunctionName(Args) ConstQualifier { \n\n }
    return `${returnPrefix}${functionName}${argsWithParens}${constQualifier} {\n    \n}\n\n`;
}

// Helper function to find the class name in the document (remains unchanged)
function findClassName(hppContent: string): string | null {
    const classNameMatch = hppContent.match(/class\s+(\w+)\s*(:\s*public\s+\w+\s*)?\{/);
    return classNameMatch ? classNameMatch[1] : null;
}

export function activate(context: vscode.ExtensionContext) {
    let disposableAll = vscode.commands.registerCommand('cpp-impl-creator.generateImplementation', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found.');
            return;
        }

        const hppFilePath = editor.document.fileName;
        if (!hppFilePath.endsWith('.hpp') && !hppFilePath.endsWith('.h')) {
            vscode.window.showInformationMessage('Active file must be a .hpp or .h file.');
            return;
        }

        const cppFilePath = hppFilePath.replace(/\.h(pp)?$/, '.cpp');

        if (!fs.existsSync(cppFilePath)) {
            vscode.window.showErrorMessage(`Corresponding .cpp file not found: ${cppFilePath}`);
            return;
        }

        const hppContent = editor.document.getText();

        const classNameMatch = hppContent.match(/class\s+(\w+)\s*(:\s*public\s+\w+\s*)?\{/);

        if (!classNameMatch) {
            vscode.window.showErrorMessage('Could not find a class definition in the current file using the robust regex.');
            return;
        }

        const className = classNameMatch[1]; // Get the captured class name

        const functionDeclarations = hppContent.matchAll(/^\s*(virtual\s+)?([\w\d<>*&]+)\s+([\w\d]+)\s*\([^\)]*\)\s*(const)?\s*;/gm);

        let implementationSnippet = `\n// Generated implementations for ${className}\n`;

        for (const match of functionDeclarations) {
            const returnType = match[2].trim();
            const functionName = match[3].trim();
            const argsWithParens = match[0].substring(match[0].indexOf('(')).replace(';', '').trim();
            const constQualifier = match[4] ? ` ${match[4]}` : '';

            // Format: ReturnType ClassName::FunctionName(Args) ConstQualifier { \n\n }
            implementationSnippet += `${returnType} ${className}::${functionName}${argsWithParens}${constQualifier} {\n    \n}\n\n`;
        }

        const cppDocument = await vscode.workspace.openTextDocument(cppFilePath);
        const cppEditor = await vscode.window.showTextDocument(cppDocument, vscode.ViewColumn.Beside);

        cppEditor.edit(editBuilder => {
            const lastLine = cppDocument.lineCount - 1;
            const position = new vscode.Position(lastLine, cppDocument.lineAt(lastLine).text.length);
            editBuilder.insert(position, implementationSnippet);
        }).then(success => {
            if (success) {
                vscode.window.showInformationMessage(`Generated implementations for ${className} in ${path.basename(cppFilePath)}.`);
            } else {
                vscode.window.showErrorMessage('Failed to write to CPP file.');
            }
        });
    });

    let disposableSingle = vscode.commands.registerCommand('cpp-impl-creator.generateSingleImplementation', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const hppFilePath = editor.document.fileName;
        if (!hppFilePath.endsWith('.hpp') && !hppFilePath.endsWith('.h')) {
            vscode.window.showInformationMessage('Active file must be a .hpp or .h file.');
            return;
        }

        const cppFilePath = hppFilePath.replace(/\.h(pp)?$/, '.cpp');
        if (!fs.existsSync(cppFilePath)) {
            vscode.window.showErrorMessage(`Corresponding .cpp file not found: ${cppFilePath}`);
            return;
        }

        const cursorPosition = editor.selection.active;
        const lineText = editor.document.lineAt(cursorPosition.line).text;
        const hppContent = editor.document.getText();

        const className = findClassName(hppContent);
        if (!className) {
            vscode.window.showErrorMessage('Could not find a class definition in the current file.');
            return;
        }

        const implementation = processFunctionDeclaration(lineText, className);

        if (implementation) {
            const cppDocument = await vscode.workspace.openTextDocument(cppFilePath);
            const cppEditor = await vscode.window.showTextDocument(cppDocument, vscode.ViewColumn.Beside);

            cppEditor.edit(editBuilder => {
                const lastLine = cppDocument.lineCount - 1;
                const position = new vscode.Position(lastLine, cppDocument.lineAt(lastLine).text.length);
                editBuilder.insert(position, `\n${implementation}`);
            }).then(success => {
                if (success) {
                    vscode.window.showInformationMessage(`Generated implementation for single function in ${path.basename(cppFilePath)}.`);
                }
            });

        } else {
            vscode.window.showErrorMessage(`Could not parse the line:\n\n${lineText.trim()}\n\nEnsure it is a valid function or constructor declaration ending in a semicolon.`);
        }
    });

    context.subscriptions.push(disposableAll, disposableSingle);
}

export function deactivate() { }
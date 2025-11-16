import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
// Return Type (e.g., 'void', 'int&')
const typesRegex = /([\w\d<>*&]+)\s+/
// The actual operator token (e.g., '+', '[]', '()')
const opsymRegex = /(!=|!==|==|===|\+|-|\*|\/|%|\^|&|\||~|!|=|<=|>=|<<|>>|\+=|-=|\*=|%=|\^=|&=|\|=|<<=|>>=|&&|\|\||\+\+|--|,|->\*|->|\[\]|\(\)|<=>|<|>)\s*/;
// Arguments (e.g., '(int val1)', '()') - Note: () are part of G3 for non-[] operators
const paramRegex = /(\([^\)]*\))\s*/
// Const qualifier (optional)
const constRegex = /(const)?\s*/
// Function/Constructor Name (e.g., ReadInputs, ~GamepadWindow)
const namesRegex = /([\w\d~]+)\s*/
// virtual (optional)
const virtuRegex = /(virtual\s+)?/

interface SetupResult {
    editor: vscode.TextEditor | undefined;
    hppContent: string | undefined;
    cppFilePath: string | undefined;
    className: string | undefined;
}

function processOperatorDeclaration(declaration: string, className: string): string | null {
    const match = declaration.trim().match(
        new RegExp(
            `^${typesRegex.source}operator` +
            `${opsymRegex.source}${paramRegex.source}${constRegex.source};`
        )
    );
    if (!match) return null; 

    const returnType = match[1].trim();
    const operatorToken = match[2].trim();
    const argsWithParens = match[3].trim();
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

    // 2. If not operator(), the standard logic for functions/constructors
    const match = declaration.trim().match(
        new RegExp(
            `^(?:${virtuRegex.source}${typesRegex.source})?` +
            `${namesRegex.source}${paramRegex.source}${constRegex.source};`
        )
    );

    if (!match) return null; // No valid standard declaration found on this line

    const returnTypeRaw = match[2];
    const functionName = match[3].trim();
    const argsWithParens = match[4].trim();
    const constQualifier = match[5] ? ` ${match[5].trim()}` : '';

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
function findClassName(hppContent: string): string | undefined {
    const classNameMatch = hppContent.match(/class\s+(\w+)\s*(:\s*public\s+\w+\s*)?\{/);
    return classNameMatch ? classNameMatch[1] : undefined;
}

function setupAnalyser(): SetupResult {
    let { editor, hppContent, cppFilePath, className }: SetupResult = {
        editor: vscode.window.activeTextEditor,
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
    if (!fs.existsSync(cppFilePath)) {
        vscode.window.showErrorMessage(`Corresponding .cpp file not found: ${cppFilePath}`);
        return result;
    }

    hppContent = editor.document.getText();
    className = findClassName(hppContent);

    if (!className) {
        vscode.window.showErrorMessage('Could not find a class definition in the current file using the robust regex.');
        return result;
    }
    return { editor, hppContent, cppFilePath, className };
}

async function writeToFile(filePath: string, className: string, text: string) {
    const cppDocument = await vscode.workspace.openTextDocument(filePath);
    const cppEditor = await vscode.window.showTextDocument(cppDocument, vscode.ViewColumn.Beside);

    cppEditor.edit(editBuilder => {
        const lastLine = cppDocument.lineCount - 1;
        const position = new vscode.Position(lastLine, cppDocument.lineAt(lastLine).text.length);
        editBuilder.insert(position, text);
    }).then(success => {
        if (success) {
            vscode.window.showInformationMessage(`Generated implementation(s) for ${className} in ${path.basename(filePath)}.`);
        } else {
            vscode.window.showErrorMessage('Failed to write to CPP file.');
        }
    });
}

export function activate(context: vscode.ExtensionContext) {
    let disposableAll = vscode.commands.registerCommand('cpp-impl-creator.generateImplementation', async () => {
        let { editor, hppContent, cppFilePath, className } = setupAnalyser();
        if (!editor || !hppContent || !cppFilePath || !className) return;

        let implementationSnippet = "";
        for (const lineText of hppContent.split('\n')) {
            const implementation = processFunctionDeclaration(lineText, className);
            if (implementation) {
                implementationSnippet += implementation;
            }
        }
        if (implementationSnippet) {
            await writeToFile(cppFilePath, className, implementationSnippet);
        }
    });

    let disposableSingle = vscode.commands.registerCommand('cpp-impl-creator.generateSingleImplementation', async () => {
        let { editor, hppContent, cppFilePath, className } = setupAnalyser();
        if (!editor || !hppContent || !cppFilePath || !className) return;

        const cursorPosition = editor.selection.active;
        const lineText = editor.document.lineAt(cursorPosition.line).text;
        const implementation = processFunctionDeclaration(lineText, className);

        if (implementation) {
            await writeToFile(cppFilePath, className, implementation);
        } else {
            vscode.window.showErrorMessage(`Could not parse the line:\n\n${lineText.trim()}\n\nEnsure it is a valid function or constructor.`);
        }
    });

    context.subscriptions.push(disposableAll, disposableSingle);
}

export function deactivate() { }
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

interface Implementation {
    text: string,
    position: number,
    line: number
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
    const operatorImpl = processOperatorDeclaration(declaration, className);
    if (operatorImpl) {
        return operatorImpl;
    }

    const match = declaration.trim().match(
        new RegExp(
            `^(?:${virtuRegex.source}${typesRegex.source})?` +
            `${namesRegex.source}${paramRegex.source}${constRegex.source};`
        )
    );

    if (!match) return null;

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
    return `${returnPrefix}${functionName}${argsWithParens}${constQualifier} {\n}\n\n`;
}

function findClassName(hppContent: string): string | undefined {
    const classNameMatch = hppContent.match(/class\s+(\w+)\s*(:\s*(public)?\s+\w+\s*)?\{/);
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

    hppContent = editor.document.getText();
    className = findClassName(hppContent);

    if (!className) {
        vscode.window.showErrorMessage('Could not find a class definition in the current file using the robust regex.');
        return result;
    }
    return { editor, hppContent, cppFilePath, className };
}

async function getImplementations(hppContent: string, cppFilePath: string, className: string, singleImpl: string = "") {
    const cppDocument = await vscode.workspace.openTextDocument(cppFilePath);
    const existingCppContent = cppDocument.getText();

    let implementations: Implementation[] = [];
    for(const lineText of hppContent.split('\n')) {
        const decl = processFunctionDeclaration(lineText, className);
        if (decl) {
            let imp = {text: decl, line: -1, position: -1};
            const signatureMatch = decl.match(/(.+?)\s*\{\s*/s);
            if (signatureMatch) {
                const signature = signatureMatch[1].trim();
                let pos = existingCppContent.indexOf(signature);
                if(pos > 0) {
                    imp.line = existingCppContent.substring(0, pos).split('\n').length;
                    imp.position = imp.line;
                }
            }
            implementations.push(imp);
        }
    }
    let lastLine = cppDocument.lineCount-1;
    for(let i = implementations.length - 1; i >= 0; i--) {
        let impl = implementations[i];
        if(impl.line == -1) {
            impl.position = lastLine;
        } else {
            lastLine = impl.line-1;
        }
        if(singleImpl && singleImpl != impl.text) {
            impl.position = 0;
        }
    }
    return implementations;
}

/**
 * Writes new content to a file, skipping implementations that already exist in the target file.
 */
async function writeToFile(filePath: string, className: string, newImplementations: Implementation[]) {
    const cppDocument = await vscode.workspace.openTextDocument(filePath);
    const existingCppContent = cppDocument.getText();
    const lastLine = cppDocument.lineCount-1;
    const lastPosition = new vscode.Position(lastLine, cppDocument.lineAt(lastLine).text.length);
    const cppEditor = await vscode.window.showTextDocument(cppDocument, vscode.ViewColumn.Beside);
    cppEditor.edit(editBuilder => {
        if(!existingCppContent.match(/#include\s+"HatsDisplayPanel\.hpp"/)) {
            editBuilder.insert(new vscode.Position(0, 0), `#include "${className}.hpp"\n`)
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
    let disposableAll = vscode.commands.registerCommand('cpp-dev-helper.generateImplementation', async () => {
        let { editor, hppContent, cppFilePath, className } = setupAnalyser();
        if (!editor || !hppContent || !cppFilePath || !className) return;

        let implementations = await getImplementations(hppContent, cppFilePath, className);
        if (implementations) {
            await writeToFile(cppFilePath, className, implementations);
        }
    });

    let disposableSingle = vscode.commands.registerCommand('cpp-dev-helper.generateSingleImplementation', async () => {
        let { editor, hppContent, cppFilePath, className } = setupAnalyser();
        if (!editor || !hppContent || !cppFilePath || !className) return;

        const cursorPosition = editor.selection.active;
        const lineText = editor.document.lineAt(cursorPosition.line).text;
        const implementation = processFunctionDeclaration(lineText, className);

        if (implementation) {
            let implementations = await getImplementations(hppContent, cppFilePath, className, implementation);
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
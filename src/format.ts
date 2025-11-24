import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

const outputChannel = vscode.window.createOutputChannel("C++ Dev Helper");

function findClangFormatConfig(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return null; // no workspace open
    }

    // Use the root workspace folder
    const rootDir = workspaceFolders[0].uri.fsPath;
    const configPath = path.join(rootDir, ".clang-format");

    if (fs.existsSync(configPath)) {
        return rootDir;
    }
    return null;
}

export async function executeClangFormatInPlace(targetFilePath: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("cpp-dev-helper");
    const enabled = config.get<boolean>("enableClangFormat", true);

    if (!enabled) {
        outputChannel.appendLine("clang-format skipped (disabled in settings).");
        return;
    }

    outputChannel.appendLine(`Running clang-format in-place on: ${targetFilePath}`);

    const configDir = findClangFormatConfig();
    const useConfig = configDir !== null;

    if (useConfig) {
        outputChannel.appendLine(`Using project .clang-format at: ${configDir}`);
    } else {
        outputChannel.appendLine("No .clang-format found; using fallback LLVM style.");
    }

    const args = ["-i"];
    if (!useConfig) {
        args.push("--style=LLVM");
    }
    args.push(targetFilePath);

    return new Promise((resolve) => {
        try {
            const process = spawn("clang-format", args, {
                cwd: useConfig ? configDir : undefined,
                stdio: ["ignore", "pipe", "pipe"]
            });
            let stderr = "";
            process.stderr.on("data", (d) => stderr += d.toString());
            process.on("close", (code) => {
                if (code !== 0) {
                    outputChannel.appendLine("clang-format error on in-place execution:");
                    outputChannel.appendLine(stderr);
                } else {
                    outputChannel.appendLine("clang-format completed successfully (in-place).");
                }
                resolve();
            });
        } catch (err: unknown) {
            outputChannel.appendLine("clang-format threw an exception:");
            outputChannel.appendLine(String(err));
            resolve();
        }
    });
}

export function removeSpacesOutsideStrings(code: string): string {
    const stringPattern = /(["'])(?:(?!\1|\\).|\\.)*\1|\/\*.*\*\//gs;
    const typName = /[a-zA-Z][\w:<>()[\]]*/;
    const varName = /[a-zA-Z][\w()[\]]*/;
    const oprName = /[+\-*/]/;
    const guardPt1 = `${typName.source}(\\s${oprName.source}\\s?\\*?${varName.source})+`;
    outputChannel.appendLine(`Guard: ${guardPt1}`);
    const guardPattern = new RegExp(`\\b${guardPt1}\\b`, "g");
    // Split code into string and non-string parts
    const parts = code.split(stringPattern);
    const matches = code.match(stringPattern) || [];

    const output: string[] = [];
    let idx = 0;

    parts.forEach((part, i) => {
        if (i % 2 === 0) {
            const pointerPlaceholder = '___POINTER_GUARD___';
            const pointerMap: string[] = [];
            part = part.replace(guardPattern, (matched) => {
                const token = `${pointerPlaceholder}${pointerMap.length}___`;
                outputChannel.appendLine(`Mat: ${matched}`);
                pointerMap.push(`${matched}`);
                return token;
            });

            part = part.replace(/([^\s'"/])(\s[+\-*/]\s)([^\s'"/])/g, (_, left, op, right) => {
                return `${left}${op.trim()}${right}`;
            });

            pointerMap.forEach((ptr, index) => {
                const token = `${pointerPlaceholder}${index}___`;
                part = part.replace(token, ptr);
            });
            output.push(part);
        } else {
            output.push(matches[idx++] ?? "");
        }
    });

    return output.join("");
}

export async function removeSpacesOutsideStringsInFile(filePath: string): Promise<void> {
    outputChannel.appendLine(`Running operator-space cleanup on: ${filePath}`);
    try {
        const content = fs.readFileSync(filePath, "utf8");
        const newContent = removeSpacesOutsideStrings(content);
        if (newContent !== content) {
            fs.writeFileSync(filePath, newContent, "utf8");
            outputChannel.appendLine("Operator-space cleanup applied successfully.");
        } else {
            outputChannel.appendLine("No spacing changes detected.");
        }
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
    } catch (err: unknown) {
        outputChannel.appendLine(`Error running operator-space cleanup: ${String(err)}`);
    }
}
// Return Type (e.g., 'void', 'int&')
const typesRegex = /([\w\d<>*&]+)\s+/;
// The actual operator token (e.g., '+', '[]', '()')
const opsymRegex = /(!=|!==|==|===|\+|-|\*|\/|%|\^|&|\||~|!|=|<=|>=|<<|>>|\+=|-=|\*=|%=|\^=|&=|\|=|<<=|>>=|&&|\|\||\+\+|--|,|->\*|->|\[\]|\(\)|<=>|<|>)\s*/;
// Arguments (e.g., '(int val1)', '()') - Note: () are part of G3 for non-[] operators
const paramRegex = /(\([^)]*\))\s*/;
// Const qualifier (optional)
const constRegex = /(const)?\s*/;
// Function/Constructor Name (e.g., ReadInputs, ~GamepadWindow)
const namesRegex = /([\w\d~]+)\s*/;
// virtual (optional)
const virtuRegex = /(virtual\s+)?/;

export interface Implementation {
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

export function processFunctionDeclaration(declaration: string, className: string): string | null {
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

export function findClassName(hppContent: string): string | undefined {
    const classNameMatch = hppContent.match(/class\s+(\w+)\s*(:\s*(public)?\s+\w+\s*)?\{/);
    return classNameMatch ? classNameMatch[1] : undefined;
}

export function getImplementations(hppContent: string, existingCppContent: string, className: string, singleImpl: string = "") {
    const implementations: Implementation[] = [];
    for(const lineText of hppContent.split('\n')) {
        const decl = processFunctionDeclaration(lineText, className);
        if (decl) {
            const imp = {text: decl, line: -1, position: -1};
            const signatureMatch = decl.match(/(.+?)\s*\{\s*/s);
            if (signatureMatch) {
                const signature = signatureMatch[1].trim();
                const pos = existingCppContent.indexOf(signature);
                if(pos > 0) {
                    imp.line = existingCppContent.substring(0, pos).split('\n').length;
                    imp.position = imp.line;
                }
            }
            implementations.push(imp);
        }
    }
    let lastLine = existingCppContent.split("\n").length - 1;
    for(let i = implementations.length - 1; i >= 0; i--) {
        const impl = implementations[i];
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
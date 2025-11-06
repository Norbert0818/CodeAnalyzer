// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode"

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "codeanalyzer" is now active!')

    const outputChannel = vscode.window.createOutputChannel("C++ Code Analyzer")

    // Create decoration types (remove hoverMessage from here)
    const functionDefinitionDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: "underline wavy green",
    })

    const functionCallDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: "underline green",
    })

    // Update the type declarations
    const definitionRanges: vscode.DecorationOptions[] = []
    const callRanges: vscode.DecorationOptions[] = []

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand("codeanalyzer.helloWorld", () => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            vscode.window.showInformationMessage("No active editor found.")
            return
        }

        if (editor.document.languageId !== "cpp") {
            vscode.window.showInformationMessage("This command is only available for C++ files.")
            return
        }

        const text = editor.document.getText()
        const functionDefinitions = new Map<string, string[]>()
        const functionCalls: string[] = []
        const definitionRanges: vscode.DecorationOptions[] = []
        const callRanges: vscode.DecorationOptions[] = []

        // Expanded list of C++ keywords and common constructs that look like functions
        const cppKeywords = new Set([
            "if",
            "for",
            "while",
            "switch",
            "catch",
            "sizeof",
            "class",
            "struct",
            "new",
            "delete",
            "template",
            "typename",
            "using",
            "namespace",
            "return",
        ])

        // Regex for C++ function/method definitions with parameters
        // This regex handles complex return types with namespaces, templates, and colons
        // It matches function declarations that end with an opening brace
        // Note: Uses negative lookahead to ensure we don't match namespace::function calls
        // the regex itself: (?<return_type>^[^\s]+)\s+(?<function_name>[\w\:]+)\((?<parameters>.*?)\)
        const funcDefRegex = /^\s*(?!#)(?<return_type>^[^\s]+)\s+(?<function_name>[\w\:]+)\((?<parameters>.*?)\)/gm
        let match
        // Modify the function definition regex processing
        while ((match = funcDefRegex.exec(text)) !== null) {
            const functionName = match[2]

            if (cppKeywords.has(functionName)) {
                continue
            }

            const params = match[3]
            const paramTypes = params
                .split(",")
                .map(p => p.trim())
                .filter(p => p.length > 0)

            // Create hover message
            const hoverMessage = new vscode.MarkdownString(
                `**Function Definition**\n\`${functionName}(${paramTypes.join(", ")})\``
            )

            const startPos = editor.document.positionAt(match.index)
            const endPos = editor.document.positionAt(match.index + match[0].length)

            // Create decoration options object
            definitionRanges.push({
                range: new vscode.Range(startPos, endPos),
                hoverMessage,
            })

            functionDefinitions.set(functionName, paramTypes)
        }

        // Regex for simple C++ function calls with arguments
        const funcCallRegex = /\b([\w:]+)\s*\(([^)]*)\);/g
        // Modify the function call regex processing
        while ((match = funcCallRegex.exec(text)) !== null) {
            const functionName = match[1]
            if (!cppKeywords.has(functionName) && functionDefinitions.has(functionName)) {
                const args = match[2]
                    .split(",")
                    .map(a => a.trim())
                    .filter(a => a.length > 0)

                // Create hover message
                const hoverMessage = new vscode.MarkdownString(
                    `**Function Call**\n\`${functionName}(${args.join(", ")})\``
                )

                const startPos = editor.document.positionAt(match.index)
                const endPos = editor.document.positionAt(match.index + match[0].length)

                // Create decoration options object
                callRanges.push({
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage,
                })

                functionCalls.push(`${functionName}(${args.join(", ")})`)
            }
        }

        // Apply decorations
        editor.setDecorations(functionDefinitionDecoration, definitionRanges)
        editor.setDecorations(functionCallDecoration, callRanges)

        outputChannel.clear()
        outputChannel.appendLine("--- C++ Code Analysis ---")
        outputChannel.appendLine("")

        outputChannel.appendLine("Function Definitions:")
        if (functionDefinitions.size > 0) {
            for (const [name, params] of functionDefinitions) {
                outputChannel.appendLine(`- ${name}(${params.join(", ")})`)
            }
        } else {
            outputChannel.appendLine("- None")
        }

        outputChannel.appendLine("")
        outputChannel.appendLine("Function Calls to Defined Functions:")
        if (functionCalls.length > 0) {
            const uniqueCalls = [...new Set(functionCalls)]
            uniqueCalls.forEach(call => {
                outputChannel.appendLine(`- ${call}`)
            })
        } else {
            outputChannel.appendLine("- None")
        }

        outputChannel.show()
    })

    context.subscriptions.push(disposable)
}

// This method is called when your extension is deactivated
export function deactivate() {}

// extension.ts
import * as vscode from "vscode"

type FuncDefInfo = { paramNames: string[]; arity: number }

const SOURCE = "codeanalyzer"
const DIAG_CODE_MARKER = "swapped-args"
const ANALYZE_CMD = "codeanalyzer.analyze"

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("C++ Code Analyzer")
  const diagnostics = vscode.languages.createDiagnosticCollection(SOURCE)
  context.subscriptions.push(diagnostics, outputChannel)

  const defDeco = vscode.window.createTextEditorDecorationType({ textDecoration: "underline wavy green" })
  const callDeco = vscode.window.createTextEditorDecorationType({ textDecoration: "underline" })
  const swappedDeco = vscode.window.createTextEditorDecorationType({ textDecoration: "underline wavy red" })

  const allowedLanguageIds = new Set(["cpp", "c", "cuda-cpp", "objective-cpp"])
  const cppKeywords = new Set([
    "if","for","while","switch","catch","sizeof","class","struct","new","delete",
    "template","typename","using","namespace","return",
  ])

  const stripDefault = (s: string) => s.replace(/=\s*([^,)]*)/g, "").trim()
  const extractParamName = (param: string): string | null => {
    let p = stripDefault(param)
    p = p.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    if (/\.\.\./.test(p)) return null
    const tokens = p.trim().split(/\s+/)
    if (!tokens.length) return null
    let last = tokens[tokens.length - 1]
    last = last.replace(/^[*&]+/, "").replace(/[*&]+$/, "")
    return /^[A-Za-z_]\w*$/.test(last) ? last : null
  }
  const extractArgName = (arg: string): string | null => {
    const a = arg.trim()
    if (/[+\-*/%|&^~!=<>?:\[\].]|->|\(|\)/.test(a)) return null
    return /^[A-Za-z_]\w*$/.test(a) ? a : null
  }
  const arraysEqualMultiset = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false
    const m = new Map<string, number>()
    for (const x of a) m.set(x, (m.get(x) ?? 0) + 1)
    for (const y of b) {
      const c = m.get(y); if (!c) return false
      c === 1 ? m.delete(y) : m.set(y, c - 1)
    }
    return m.size === 0
  }

  const funcDefRegex =
    /^\s*(?!#)(?<ret>(?:[\w:\<\>\*\&\s]+?))\s+(?<name>[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*|~[A-Za-z_]\w*)\s*\((?<params>[\s\S]*?)\)\s*\{/gm
  const funcCallRegex = /\b([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*|~[A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/g

  function analyzeCurrentEditor() {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    if (!allowedLanguageIds.has(editor.document.languageId)) return

    const uri = editor.document.uri
    const text = editor.document.getText()

    const defs = new Map<string, FuncDefInfo>() // name#arity
    const defDecor: vscode.DecorationOptions[] = []
    const callDecor: vscode.DecorationOptions[] = []
    const swappedDecor: vscode.DecorationOptions[] = []
    const fileDiagnostics: vscode.Diagnostic[] = []
    const callsLog: string[] = []
    const swappedLog: string[] = []

    // --- Definitions
    let m: RegExpExecArray | null
    while ((m = funcDefRegex.exec(text)) !== null) {
      const name = m.groups?.name ?? m[2]
      if (!name || cppKeywords.has(name)) continue
      const paramsRaw = (m.groups?.params ?? "").trim()
      const paramList = paramsRaw.length ? paramsRaw.split(",").map(s => s.trim()) : []
      const paramNames: string[] = []
      for (const p of paramList) {
        const n = extractParamName(p); if (n) paramNames.push(n)
      }
      const arity = paramNames.length
      const key = `${name}#${arity}`
      const start = editor.document.positionAt(m.index)
      const end = editor.document.positionAt(m.index + m[0].length)
      defDecor.push({
        range: new vscode.Range(start, end),
        hoverMessage: new vscode.MarkdownString(`**Function Definition**\n\`${name}(${paramNames.join(", ")})\``),
      })
      defs.set(key, { paramNames, arity })
    }

    // --- Calls
    while ((m = funcCallRegex.exec(text)) !== null) {
  const name = m[1]
  if (cppKeywords.has(name)) continue

  const argsRaw = m[2]
  const args = argsRaw.length ? argsRaw.split(",").map(s => s.trim()) : []
  const key = `${name}#${args.length}`
  const def = defs.get(key)

  const start = editor.document.positionAt(m.index)
  const end = editor.document.positionAt(m.index + m[0].length)

  // Alapértelmezés: feltételezzük, hogy NEM swapped → zöldet később tesszük rá
  let isSwapped = false

  if (def) {
    const paramNames = def.paramNames
    if (paramNames.length && args.length) {
      const argNames = args.map(extractArgName)
      if (!argNames.some(a => a === null)) {
        const simpleArgs = argNames as string[]

        if (arraysEqualMultiset(simpleArgs, paramNames)) {
          let sameOrder = true
          for (let i = 0; i < paramNames.length; i++) {
            if (paramNames[i] !== simpleArgs[i]) { sameOrder = false; break }
          }
          if (!sameOrder) {
            isSwapped = true

            // PIROS diagnosztika + piros dekoráció
            const msg =
              `Possible swapped arguments in call '${name}(${simpleArgs.join(", ")})'. ` +
              `Expected order: (${paramNames.join(", ")}).`

            const diag = new vscode.Diagnostic(
              new vscode.Range(start, end),
              msg,
              vscode.DiagnosticSeverity.Error
            )
            diag.source = SOURCE
            diag.code = JSON.stringify({ kind: DIAG_CODE_MARKER, expected: paramNames })
            fileDiagnostics.push(diag)

            swappedDecor.push({
              range: new vscode.Range(start, end),
              hoverMessage: new vscode.MarkdownString(
                `**Possible swapped arguments**\n**Expected:** \`${paramNames.join(", ")}\`\n**Given:** \`${simpleArgs.join(", ")}\``
              ),
            })

            swappedLog.push(`${name}(${simpleArgs.join(", ")})  // expected: (${paramNames.join(", ")})`)
          }
        }
      }
    }
  }

  // Csak akkor adunk ZÖLD hívás-dekorációt, ha NEM swapped
  if (!isSwapped) {
    callDecor.push({
      range: new vscode.Range(start, end),
      hoverMessage: new vscode.MarkdownString(`**Function Call**\n\`${name}(${args.join(", ")})\``),
    })
  }

  // Log-oljuk a hívást (debug/Output miatt mindenképp)
  callsLog.push(`${name}(${args.join(", ")})`)
}

    // Apply decos + diags
    editor.setDecorations(defDeco, defDecor)
    editor.setDecorations(callDeco, callDecor)
    editor.setDecorations(swappedDeco, swappedDecor)
    diagnostics.set(uri, fileDiagnostics)

    // Output
    outputChannel.clear()
    outputChannel.appendLine("--- C++ Code Analysis ---\n")
    outputChannel.appendLine("Function Definitions:")
    if (defs.size === 0) outputChannel.appendLine("- None\n")
    else { for (const [k, info] of defs) { const n = k.slice(0, k.lastIndexOf("#")); outputChannel.appendLine(`- ${n}(${info.paramNames.join(", ")})`) } outputChannel.appendLine("") }
    outputChannel.appendLine("Function Calls to Defined Functions:")
    if (callsLog.length === 0) outputChannel.appendLine("- None\n")
    else { [...new Set(callsLog)].forEach(c => outputChannel.appendLine(`- ${c}`)); outputChannel.appendLine("") }
    outputChannel.appendLine("Possible Swapped-Argument Calls:")
    if (swappedLog.length === 0) outputChannel.appendLine("- None")
    else { [...new Set(swappedLog)].forEach(c => outputChannel.appendLine(`- ${c}`)) }
    outputChannel.show()
  }

  // Command to (re)run analysis (used by Quick Fix and by you)
  context.subscriptions.push(vscode.commands.registerCommand(ANALYZE_CMD, analyzeCurrentEditor))

  // Old “helloWorld” -> just call analyze
  context.subscriptions.push(vscode.commands.registerCommand("codeanalyzer.helloWorld", analyzeCurrentEditor))

  // Debounced re-analyze on edits
  const timers = new Map<string, NodeJS.Timeout>()
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      const doc = e.document
      if (!allowedLanguageIds.has(doc.languageId)) return
      const key = doc.uri.toString()
      if (timers.has(key)) clearTimeout(timers.get(key)!)
      timers.set(key, setTimeout(() => {
        if (vscode.window.activeTextEditor?.document.uri.toString() === key) analyzeCurrentEditor()
        timers.delete(key)
      }, 300))
    })
  )

  // ===== Quick Fix provider =====
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(document, range, context) {
      const fixes: vscode.CodeAction[] = []
      for (const d of context.diagnostics) {
        if (d.source !== SOURCE || !d.code) continue
        let meta: any = null
        try {
          if (typeof d.code === "string") meta = JSON.parse(d.code)
          else if (typeof (d.code as any).value === "string") meta = JSON.parse((d.code as any).value)
        } catch { /* ignore */ }
        if (!meta || meta.kind !== DIAG_CODE_MARKER || !Array.isArray(meta.expected)) continue
        const expected: string[] = meta.expected

        const callText = document.getText(d.range)
        const openIdx = callText.indexOf("(")
        const closeIdx = callText.lastIndexOf(")")
        if (openIdx < 0 || closeIdx < 0 || closeIdx <= openIdx) continue

        const argsText = callText.slice(openIdx + 1, closeIdx)
        const currentArgs = argsText.split(",").map(s => s.trim())
        const currentNames = currentArgs.map(a => a.replace(/\s+/g, ""))

        const reordered: string[] = []
        for (const name of expected) {
          const idx = currentNames.findIndex(n => n === name)
          if (idx === -1) { reordered.length = 0; break }
          reordered.push(currentArgs[idx])
        }
        if (reordered.length !== expected.length) continue

        const replaceRange = new vscode.Range(
          document.positionAt(document.offsetAt(d.range.start) + openIdx + 1),
          document.positionAt(document.offsetAt(d.range.start) + closeIdx)
        )

        const title = `Quick Fix: Reorder arguments to (${expected.join(", ")})`
        const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(document.uri, replaceRange, reordered.join(", "))
        action.edit = edit
        action.diagnostics = [d]
        // <<< re-run analysis after the edit so the red squiggle disappears >>>
        action.command = { command: ANALYZE_CMD, title: "Re-run Code Analyzer" }
        fixes.push(action)
      }
      return fixes
    }
  }

  for (const lang of allowedLanguageIds) {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { language: lang, scheme: "file" },
        provider,
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
      )
    )
  }
}

export function deactivate() {}

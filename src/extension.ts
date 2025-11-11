// extension.ts
import * as vscode from "vscode"

type ParamRole = "IN" | "OUT" | "INOUT" | "SINK" | "UNKNOWN"

type ParsedType = {
  raw: string
  isRef: boolean
  isPtr: boolean
  isConstRef: boolean
  pointeeConst: boolean
  isRvalueRef: boolean
  isSpan: boolean
  isConstSpan: boolean
}

type FuncDefInfo = { paramNames: string[]; arity: number; paramRoles: ParamRole[] }

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

  const removeCommentsAndStrings = (src: string): string => {
    let out = ""
    let i = 0, n = src.length
    let inLine = false, inBlock = false, inStr = false, inChar = false, esc = false
    while (i < n) {
      const c = src[i], d = i + 1 < n ? src[i + 1] : ""
      if (inLine) {
        if (c === "\n") { inLine = false; out += "\n" }
        else out += " "
        i++
        continue
      }
      if (inBlock) {
        if (c === "*" && d === "/") { inBlock = false; out += "  "; i += 2; continue }
        out += (c === "\n" ? "\n" : " ")
        i++
        continue
      }
      if (inStr) {
        out += (c === "\n" ? "\n" : " ")
        if (esc) { esc = false; i++; continue }
        if (c === "\\") { esc = true; i++; continue }
        if (c === "\"") { inStr = false }
        i++
        continue
      }
      if (inChar) {
        out += (c === "\n" ? "\n" : " ")
        if (esc) { esc = false; i++; continue }
        if (c === "\\") { esc = true; i++; continue }
        if (c === "'") { inChar = false }
        i++
        continue
      }
      // not in any
      if (c === "/" && d === "/") { inLine = true; out += "  "; i += 2; continue }
      if (c === "/" && d === "*") { inBlock = true; out += "  "; i += 2; continue }
      if (c === "\"") { inStr = true; out += " "; i++; continue }
      if (c === "'") { inChar = true; out += " "; i++; continue }
      out += c
      i++
    }
    return out
  }

  const extractFunctionBody = (fullText: string, openBraceIdx: number): { body: string, endIdx: number } | null => {
    // count braces with comments/strings removed to avoid false hits inside them
    const text = fullText
    let i = openBraceIdx
    if (text[i] !== "{") {
      const nb = text.indexOf("{", i)
      if (nb === -1) return null
      i = nb
    }
    let depth = 0
    let j = i
    // We must respect strings/comments: we'll scan original but mask them
    const masked = removeCommentsAndStrings(fullText)
    let k = i
    while (k < masked.length) {
      const ch = masked[k]
      if (ch === "{") { if (depth === 0) j = k; depth++ }
      else if (ch === "}") { depth--; if (depth === 0) { const body = fullText.slice(i + 1, k); return { body, endIdx: k } } }
      k++
    }
    return null
  }

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

  const parseParamType = (rawParam: string): ParsedType => {
    const raw = stripDefault(rawParam).trim()
    // remove /* */ and // comments
    const cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim()
    const isRef = /&(?!&)/.test(cleaned)
    const isRvalueRef = /&&/.test(cleaned)
    const isPtr = /\*/.test(cleaned)
    const hasConst = /\bconst\b/.test(cleaned)
    const isSpan = /\b(std::)?(gsl::)?span\s*<[^>]+>/.test(cleaned)
    const isConstSpan = /\b(std::)?(gsl::)?span\s*<\s*const\b/.test(cleaned)
    // const-ref?
    const isConstRef = /\bconst\b/.test(cleaned) && isRef && !isRvalueRef
    // pointee const for pointers
    const pointeeConst = isPtr && /\bconst\b/.test(cleaned.replace(/\*+/g, ""))
    return { raw, isRef, isPtr, isConstRef, pointeeConst, isRvalueRef, isSpan, isConstSpan }
  }

  const wordBoundary = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  const detectParamRoleInBody = (param: string, bodyRaw: string, typeInfo: ParsedType): ParamRole => {
    const body = removeCommentsAndStrings(bodyRaw)

    const p = wordBoundary(param)
    let seenRead = false, seenWrite = false, moved = false

    // READ patterns
    const readPats = [
      new RegExp(`\\b${p}\\b\\s*([),;]|==|!=|<=|>=|<|>|\\+|-|\\*|/|%|\\^|\\||&|\\?|:|\\]|\\))`, "m"),
      new RegExp(`\\b${p}\\b\\s*\\[`, "m"),
      new RegExp(`\\b${p}\\b\\s*->`, "m"),
      new RegExp(`\\b${p}\\b\\s*\\.\\s*\\w+`, "m"),
      new RegExp(`\\*\\s*\\b${p}\\b(?!\\s*=)`, "m"),
    ]
    // WRITE patterns
    const writePats = [
      new RegExp(`\\b${p}\\b\\s*(\\+\\+|--|[+\\-*/%&|^]=|=)`, "m"),
      new RegExp(`(\\*\\s*\\b${p}\\b|\\b${p}\\b\\s*\\[.+?\\]|\\b${p}\\b\\s*->\\s*\\w+|\\b${p}\\b\\s*\\.\\s*\\w+)\\s*=`, "m"),
      new RegExp(`\\b${p}\\b\\s*\\.\\s*\\w+\\s*\\(`, "m"), // lehet mutáló metódus
    ]
    const movePat = new RegExp(`\\bstd::move\\s*\\(\\s*${p}\\s*\\)`, "m")

    seenRead = readPats.some(r => r.test(body))
    seenWrite = writePats.some(r => r.test(body))
    moved = movePat.test(body)

    // signature-driven first pass
    if (typeInfo.isRvalueRef) return "SINK"
    if (typeInfo.isSpan && typeInfo.isConstSpan) return "IN"
    if (typeInfo.isSpan && !typeInfo.isConstSpan) return (seenWrite ? "INOUT" : "INOUT")
    if (typeInfo.isConstRef || typeInfo.pointeeConst) return "IN"

    if (moved && !seenWrite) return "SINK"
    if (seenWrite && !seenRead) return "OUT"
    if (seenWrite && seenRead) return "INOUT"
    if (seenRead && !seenWrite) return "IN"

    // by-value kis típus → inkább IN
    if (!typeInfo.isRef && !typeInfo.isPtr) return "IN"
    return "UNKNOWN"
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

    // --- Definitions (+ roles)
    let m: RegExpExecArray | null
    while ((m = funcDefRegex.exec(text)) !== null) {
      const name = m.groups?.name ?? m[2]
      if (!name || cppKeywords.has(name)) continue

      // find opening brace and body
      const openBraceIdx = text.indexOf("{", m.index)
      let body = ""
      if (openBraceIdx !== -1) {
        const bodyRes = extractFunctionBody(text, openBraceIdx)
        if (bodyRes) body = bodyRes.body
      }

      const paramsRaw = (m.groups?.params ?? "").trim()
      const paramList = paramsRaw.length ? paramsRaw.split(",").map(s => s.trim()) : []
      const paramNames: string[] = []
      const paramTypes: ParsedType[] = []
      for (const p of paramList) {
        const n = extractParamName(p); if (n) {
          paramNames.push(n)
          paramTypes.push(parseParamType(p))
        }
      }
      const roles: ParamRole[] = []
      for (let i = 0; i < paramNames.length; i++) {
        roles.push(detectParamRoleInBody(paramNames[i], body, paramTypes[i] ?? parseParamType(paramList[i] ?? "")))
      }

      const arity = paramNames.length
      const key = `${name}#${arity}`

      const start = editor.document.positionAt(m.index)
      const end = editor.document.positionAt(openBraceIdx !== -1 ? openBraceIdx + 1 : (m.index + m[0].length))
      const hover = new vscode.MarkdownString()
      hover.appendMarkdown(`**Function Definition**\n\`${name}(${paramNames.map((n,i)=>`${n}:${roles[i]??"?"}`).join(", ")})\``)
      defDecor.push({ range: new vscode.Range(start, end), hoverMessage: hover })

      defs.set(key, { paramNames, arity, paramRoles: roles })
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

      let isSwapped = false
      let confidence = 0

      if (def) {
        const paramNames = def.paramNames
        const paramRoles = def.paramRoles
        if (paramNames.length && args.length) {
          const argNames = args.map(extractArgName)

          // Heurisztika 1: név-multiset + sorrend
          if (!argNames.some(a => a === null)) {
            const simpleArgs = argNames as string[]
            if (arraysEqualMultiset(simpleArgs, paramNames)) {
              let sameOrder = true
              for (let i = 0; i < paramNames.length; i++) {
                if (paramNames[i] !== simpleArgs[i]) { sameOrder = false; break }
              }
              if (!sameOrder) {
                // A klasszikus név-heurisztika önmagában is elég legyen:
                confidence = Math.max(confidence, 1.0)
              }
            }
          }

          // Heurisztika 2: szerep-sorrend (callee oldal)
          // Ha legalább két különböző szerep van és az első nem IN, erős jel ha fel van cserélve a tipikus [IN, OUT]/[INOUT, IN] sorrend.
          const hasRoleVariety = new Set(paramRoles).size > 1
          if (hasRoleVariety && args.length >= 2) {
            // nagyon egyszerű minta: OUT/SINK ne legyen megelőzve egy tipikus IN-nel, ha a nevek épp fordítottak
            const firstRole = paramRoles[0]
            const secondRole = paramRoles[1]
            if ((firstRole === "OUT" || firstRole === "SINK" || firstRole === "INOUT") && (secondRole === "IN")) {
              // ha a név-multiset egyezik, nagy valószínűség, hogy (IN, OUT) lett (OUT, IN)-re cserélve
              if (argNames.every(a => a !== null) && arraysEqualMultiset(argNames as string[], paramNames)) {
                confidence += 0.35
              } else {
                confidence += 0.15 // csak szerep alapján is gyanús
              }
            }
          }

          if (confidence >= 0.6) {
            isSwapped = true

            const given = (argNames.every(a => a !== null)
              ? (argNames as string[]).join(", ")
              : args.join(", "))

            const expectedSig = paramNames.map((n, i) => `${n}:${paramRoles[i]}`).join(", ")

            const msg =
              `Possible swapped arguments in call '${name}(${given})'. ` +
              `Expected order: (${expectedSig}).`

            const diag = new vscode.Diagnostic(
              new vscode.Range(start, end),
              msg,
              vscode.DiagnosticSeverity.Error
            )
            diag.source = SOURCE
            diag.code = JSON.stringify({ kind: DIAG_CODE_MARKER, expected: paramNames, roles: paramRoles })
            fileDiagnostics.push(diag)

            swappedDecor.push({
              range: new vscode.Range(start, end),
              hoverMessage: new vscode.MarkdownString(
                `**Possible swapped arguments**\n**Expected:** \`${expectedSig}\`\n**Given:** \`${given}\`\n**Confidence:** ${confidence.toFixed(2)}`
              ),
            })

            swappedLog.push(`${name}(${given})  // expected: (${expectedSig})`)
          }
        }
      }

      if (!isSwapped) {
        callDecor.push({
          range: new vscode.Range(start, end),
          hoverMessage: new vscode.MarkdownString(`**Function Call**\n\`${name}(${args.join(", ")})\``),
        })
      }

      callsLog.push(`${name}(${args.join(", ")})`)
    }

    // Apply decos + diags
    
    if (!editor) return
    editor.setDecorations(defDeco, defDecor)
    editor.setDecorations(callDeco, callDecor)
    editor.setDecorations(swappedDeco, swappedDecor)
    diagnostics.set(uri, fileDiagnostics)

    // Output
    outputChannel.clear()
    outputChannel.appendLine("--- C++ Code Analysis ---\n")
    outputChannel.appendLine("Function Definitions:")
    if (defs.size === 0) outputChannel.appendLine("- None\n")
    else {
      for (const [k, info] of defs) {
        const n = k.slice(0, k.lastIndexOf("#"))
        const sig = info.paramNames.map((p, i) => `${p}:${info.paramRoles[i] ?? "?"}`).join(", ")
        outputChannel.appendLine(`- ${n}(${sig})`)
      }
      outputChannel.appendLine("")
    }
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

  analyzeCurrentEditor();

// Aktív szerkesztő váltásakor elemezz
context.subscriptions.push(
  vscode.window.onDidChangeActiveTextEditor(() => {
    analyzeCurrentEditor()
  })
)

// Dokumentum megnyitásakor (ha ez az aktív) elemezz
context.subscriptions.push(
  vscode.workspace.onDidOpenTextDocument(doc => {
    if (vscode.window.activeTextEditor?.document === doc) {
      analyzeCurrentEditor()
    }
  })
)

// Mentéskor is elemezz (opcionális, de hasznos)
context.subscriptions.push(
  vscode.workspace.onDidSaveTextDocument(() => {
    analyzeCurrentEditor()
  })
)


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
          if (idx === -1) { (reordered as any).length = 0; break }
          reordered.push(currentArgs[idx])
        }
        if (reordered.length !== expected.length) continue

        const replaceRange = new vscode.Range(
          document.positionAt(document.offsetAt(d.range.start) + openIdx + 1),
          document.positionAt(document.offsetAt(d.range.start) + closeIdx)
        )

        const rolesSuffix = Array.isArray(meta.roles) ? ` (${meta.roles.join(", ")})` : ""
        const title = `Quick Fix: Reorder arguments to (${expected.join(", ")})${rolesSuffix}`
        const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(document.uri, replaceRange, reordered.join(", "))
        action.edit = edit
        action.diagnostics = [d]
        action.command = { command: ANALYZE_CMD, title: "Re-run Code Analyzer" }
        fixes.push(action)
      }
      return fixes
    }
  }

  for (const lang of ["cpp", "c", "cuda-cpp", "objective-cpp"]) {
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

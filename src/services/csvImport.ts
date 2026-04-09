// ─────────────────────────────────────────────────────────────────────
// Parser CSV para import de produtividade vindo de iFood/Rappi/planilha.
//
// Formato aceito (header flexível, case-insensitive):
//   colaborador, pedidos, erros, custo_erros, sla (opcional), obs (opcional)
//
// Ou em inglês:
//   employee, orders, errors, error_cost, sla, notes
//
// Linhas em branco ou começando com # são ignoradas.
// ─────────────────────────────────────────────────────────────────────

export interface CsvParsedRow {
  line: number
  employeeName: string
  totalOrders: number
  totalErrors: number
  errorCost: number
  slaCompliance: number
  notes: string
}

export interface CsvParseResult {
  rows: CsvParsedRow[]
  errors: Array<{ line: number; message: string }>
  headers: string[]
}

const HEADER_ALIASES: Record<string, string[]> = {
  employeeName: ['colaborador', 'nome', 'funcionario', 'employee', 'name'],
  totalOrders: ['pedidos', 'total_pedidos', 'orders', 'total_orders'],
  totalErrors: ['erros', 'errors', 'total_errors'],
  errorCost: ['custo_erros', 'custo_erro', 'error_cost', 'reembolso', 'custo'],
  slaCompliance: ['sla', 'sla_compliance', 'sla_%', 'sla%'],
  notes: ['obs', 'observacoes', 'observações', 'notes', 'notas'],
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim()
    .replace(/\s+/g, '_')
    .replace(/[áàâã]/g, 'a')
    .replace(/[éê]/g, 'e')
    .replace(/[íî]/g, 'i')
    .replace(/[óôõ]/g, 'o')
    .replace(/[úû]/g, 'u')
    .replace(/[ç]/g, 'c')
}

function matchHeader(norm: string): string | null {
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(norm)) return canonical
  }
  return null
}

function parseNumber(raw: string, allowPercent = false): number {
  if (!raw) return 0
  let cleaned = String(raw).trim()
    .replace(/[R$€]/g, '')  // moeda
    .replace(/\s/g, '')
  if (allowPercent) cleaned = cleaned.replace(/%/g, '')
  // Brazilian format: 1.234,56 -> 1234.56
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.')
  }
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function splitCsvLine(line: string, separator: ',' | ';' = ','): string[] {
  // Simple CSV parser. Handles quoted fields with separator inside.
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inQuotes = !inQuotes
      continue
    }
    if (c === separator && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }
    current += c
  }
  result.push(current)
  return result.map(s => s.trim())
}

function detectSeparator(headerLine: string): ',' | ';' {
  // Se há ; fora de aspas, usar ; (Excel BR). Senão, ,.
  let inQuotes = false
  for (const c of headerLine) {
    if (c === '"') { inQuotes = !inQuotes; continue }
    if (c === ';' && !inQuotes) return ';'
  }
  return ','
}

export function parseProductivityCsv(csvText: string): CsvParseResult {
  const lines = csvText.split(/\r?\n/)
  const errors: Array<{ line: number; message: string }> = []
  const rows: CsvParsedRow[] = []

  // Find first non-empty non-comment line → headers
  let headerLineIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    headerLineIdx = i
    break
  }

  if (headerLineIdx === -1) {
    return { rows: [], errors: [{ line: 0, message: 'CSV vazio ou só com comentários' }], headers: [] }
  }

  const separator = detectSeparator(lines[headerLineIdx])
  const rawHeaders = splitCsvLine(lines[headerLineIdx], separator)
  const headerMap = new Map<number, string>() // idx → canonical field name
  rawHeaders.forEach((h, idx) => {
    const canonical = matchHeader(normalizeHeader(h))
    if (canonical) headerMap.set(idx, canonical)
  })

  // Validações mínimas
  const canonicals = new Set(headerMap.values())
  if (!canonicals.has('employeeName')) {
    errors.push({ line: headerLineIdx + 1, message: 'Coluna "colaborador" não encontrada' })
  }
  if (!canonicals.has('totalOrders')) {
    errors.push({ line: headerLineIdx + 1, message: 'Coluna "pedidos" não encontrada' })
  }

  if (errors.length > 0) {
    return { rows: [], errors, headers: rawHeaders }
  }

  // Parse data rows
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const values = splitCsvLine(raw, separator)
    const row: Partial<CsvParsedRow> = { line: i + 1, notes: '' }
    for (const [idx, field] of headerMap.entries()) {
      const raw = values[idx] ?? ''
      switch (field) {
        case 'employeeName':
          row.employeeName = raw.trim()
          break
        case 'totalOrders':
          row.totalOrders = Math.max(0, Math.round(parseNumber(raw)))
          break
        case 'totalErrors':
          row.totalErrors = Math.max(0, Math.round(parseNumber(raw)))
          break
        case 'errorCost':
          row.errorCost = Math.max(0, parseNumber(raw))
          break
        case 'slaCompliance': {
          const n = parseNumber(raw, true)
          // SLA: aceitar 0-1 ou 0-100. Se >1, assumir %.
          row.slaCompliance = n > 1 ? n : n * 100
          break
        }
        case 'notes':
          row.notes = String(raw).trim()
          break
      }
    }

    if (!row.employeeName) {
      errors.push({ line: i + 1, message: 'Nome do colaborador vazio' })
      continue
    }

    rows.push({
      line: row.line!,
      employeeName: row.employeeName!,
      totalOrders: row.totalOrders ?? 0,
      totalErrors: row.totalErrors ?? 0,
      errorCost: row.errorCost ?? 0,
      slaCompliance: row.slaCompliance ?? 0,
      notes: row.notes ?? '',
    })
  }

  return { rows, errors, headers: rawHeaders }
}

/**
 * Resolve nomes de colaboradores do CSV contra a lista real de employees.
 * Faz match case-insensitive exato + fuzzy básico (primeiro nome).
 * Retorna { matched: rows com employeeId, unmatched: rows sem match }.
 */
export function matchEmployees(
  csvRows: CsvParsedRow[],
  employees: Array<{ id: string; name: string; nickname?: string }>,
): {
  matched: Array<CsvParsedRow & { employeeId: string }>
  unmatched: CsvParsedRow[]
} {
  const normalize = (s: string) => s.toLowerCase().trim().split(/\s+/)[0] // primeiro nome
  const empByFirstName = new Map<string, string>()
  for (const e of employees) {
    const firstName = normalize(e.name)
    empByFirstName.set(firstName, e.id)
    if (e.nickname) {
      empByFirstName.set(normalize(e.nickname), e.id)
    }
  }

  const matched: Array<CsvParsedRow & { employeeId: string }> = []
  const unmatched: CsvParsedRow[] = []

  for (const row of csvRows) {
    const firstName = normalize(row.employeeName)
    const empId = empByFirstName.get(firstName)
    if (empId) {
      matched.push({ ...row, employeeId: empId })
    } else {
      unmatched.push(row)
    }
  }

  return { matched, unmatched }
}

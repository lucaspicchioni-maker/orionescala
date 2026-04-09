import { describe, it, expect } from 'vitest'
import { parseProductivityCsv, matchEmployees } from '../src/services/csvImport'

describe('parseProductivityCsv', () => {
  it('parseia CSV básico em português', () => {
    const csv = `colaborador,pedidos,erros,custo_erros
Anna,120,3,45.00
Miguel,95,1,15.50`
    const r = parseProductivityCsv(csv)
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({
      employeeName: 'Anna',
      totalOrders: 120,
      totalErrors: 3,
      errorCost: 45,
    })
    expect(r.rows[1].employeeName).toBe('Miguel')
  })

  it('aceita headers em inglês', () => {
    const csv = `employee,orders,errors,error_cost
Anna,120,3,45.00`
    const r = parseProductivityCsv(csv)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].totalOrders).toBe(120)
  })

  it('aceita separador ponto-e-vírgula (Excel BR)', () => {
    const csv = `colaborador;pedidos;erros;custo_erros
Anna;120;3;45,50`
    const r = parseProductivityCsv(csv)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].totalOrders).toBe(120)
    expect(r.rows[0].errorCost).toBe(45.5)
  })

  it('formato brasileiro de moeda (1.234,56)', () => {
    const csv = `colaborador,pedidos,erros,custo_erros
Anna,1200,5,"1.234,56"`
    const r = parseProductivityCsv(csv)
    expect(r.rows[0].errorCost).toBe(1234.56)
  })

  it('parseia SLA em porcentagem', () => {
    const csv = `colaborador,pedidos,sla
Anna,100,95%`
    const r = parseProductivityCsv(csv)
    expect(r.rows[0].slaCompliance).toBe(95)
  })

  it('parseia SLA em 0-1', () => {
    const csv = `colaborador,pedidos,sla
Anna,100,0.95`
    const r = parseProductivityCsv(csv)
    expect(r.rows[0].slaCompliance).toBe(95)
  })

  it('ignora linhas vazias e comentários', () => {
    const csv = `# Relatório iFood semana X
colaborador,pedidos,erros
Anna,100,2

# Miguel de folga
Miguel,80,1`
    const r = parseProductivityCsv(csv)
    expect(r.rows).toHaveLength(2)
  })

  it('erro quando falta coluna colaborador', () => {
    const csv = `pedidos,erros
100,2`
    const r = parseProductivityCsv(csv)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors[0].message).toContain('colaborador')
  })

  it('erro quando falta coluna pedidos', () => {
    const csv = `colaborador,erros
Anna,2`
    const r = parseProductivityCsv(csv)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.errors[0].message).toContain('pedidos')
  })

  it('reporta linha com colaborador vazio', () => {
    const csv = `colaborador,pedidos,erros
Anna,100,2
,50,1`
    const r = parseProductivityCsv(csv)
    expect(r.rows).toHaveLength(1)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].line).toBe(3)
  })
})

describe('matchEmployees', () => {
  const employees = [
    { id: 'e1', name: 'Anna Silva', nickname: 'Anna' },
    { id: 'e2', name: 'Miguel Santos', nickname: 'Miguel' },
    { id: 'e3', name: 'João Paulo', nickname: 'JP' },
  ]

  it('match exato por primeiro nome', () => {
    const { matched, unmatched } = matchEmployees(
      [{ line: 1, employeeName: 'Anna', totalOrders: 100, totalErrors: 0, errorCost: 0, slaCompliance: 0, notes: '' }],
      employees,
    )
    expect(matched).toHaveLength(1)
    expect(matched[0].employeeId).toBe('e1')
    expect(unmatched).toHaveLength(0)
  })

  it('match case-insensitive', () => {
    const { matched } = matchEmployees(
      [{ line: 1, employeeName: 'ANNA', totalOrders: 100, totalErrors: 0, errorCost: 0, slaCompliance: 0, notes: '' }],
      employees,
    )
    expect(matched).toHaveLength(1)
  })

  it('match por nickname', () => {
    const { matched } = matchEmployees(
      [{ line: 1, employeeName: 'JP', totalOrders: 100, totalErrors: 0, errorCost: 0, slaCompliance: 0, notes: '' }],
      employees,
    )
    expect(matched).toHaveLength(1)
    expect(matched[0].employeeId).toBe('e3')
  })

  it('devolve unmatched para nomes desconhecidos', () => {
    const { matched, unmatched } = matchEmployees(
      [
        { line: 1, employeeName: 'Anna', totalOrders: 100, totalErrors: 0, errorCost: 0, slaCompliance: 0, notes: '' },
        { line: 2, employeeName: 'Desconhecido', totalOrders: 50, totalErrors: 0, errorCost: 0, slaCompliance: 0, notes: '' },
      ],
      employees,
    )
    expect(matched).toHaveLength(1)
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0].employeeName).toBe('Desconhecido')
  })
})

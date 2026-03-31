export interface ConvocationPayroll {
  employeeId: string
  employeeName: string
  shiftDate: string
  shiftStart: string
  shiftEnd: string
  workedMinutes: number
  workedHours: number
  hourlyRate: number
  // Proventos
  salarioBase: number
  dsr: number
  ferias: number
  tercoFerias: number
  decimoTerceiro: number
  totalBruto: number
  // Descontos
  inssEmpregado: number
  irrf: number
  multaNoshowDesconto: number
  totalDescontos: number
  // Liquido
  liquidoColaborador: number
  // Custo empregador
  fgts: number
  inssPatronal: number
  custoTotalEmpregador: number
}

/**
 * Tabela progressiva INSS 2024
 * Faixa 1: ate 1.412,00 → 7,5%
 * Faixa 2: de 1.412,01 ate 2.666,68 → 9%
 * Faixa 3: de 2.666,69 ate 4.000,03 → 12%
 * Faixa 4: de 4.000,04 ate 7.786,02 → 14%
 */
export function calcularINSSEmpregado(base: number): number {
  if (base <= 0) return 0

  let inss = 0
  const faixas = [
    { teto: 1412.00, aliquota: 0.075 },
    { teto: 2666.68, aliquota: 0.09 },
    { teto: 4000.03, aliquota: 0.12 },
    { teto: 7786.02, aliquota: 0.14 },
  ]

  let restante = base
  let faixaAnterior = 0

  for (const faixa of faixas) {
    if (restante <= 0) break
    const baseNaFaixa = Math.min(restante, faixa.teto - faixaAnterior)
    inss += baseNaFaixa * faixa.aliquota
    restante -= baseNaFaixa
    faixaAnterior = faixa.teto
  }

  return Math.round(inss * 100) / 100
}

/**
 * Tabela IRRF simplificada 2024
 * Faixa 1: ate 2.259,20 → isento
 * Faixa 2: de 2.259,21 ate 2.826,65 → 7,5% (dedução 169,44)
 * Faixa 3: de 2.826,66 ate 3.751,05 → 15% (dedução 381,44)
 * Faixa 4: de 3.751,06 ate 4.664,68 → 22,5% (dedução 662,77)
 * Faixa 5: acima de 4.664,68 → 27,5% (dedução 896,00)
 */
function calcularIRRF(baseIR: number): number {
  if (baseIR <= 2259.20) return 0
  if (baseIR <= 2826.65) return Math.max(0, baseIR * 0.075 - 169.44)
  if (baseIR <= 3751.05) return Math.max(0, baseIR * 0.15 - 381.44)
  if (baseIR <= 4664.68) return Math.max(0, baseIR * 0.225 - 662.77)
  return Math.max(0, baseIR * 0.275 - 896.00)
}

export function calculateConvocationPayroll(
  employee: { hourlyRate: number; name: string; id: string },
  workedMinutes: number,
  shiftDate: string,
  shiftStart: string,
  shiftEnd: string,
  noshowFine?: number,
): ConvocationPayroll {
  const workedHours = workedMinutes / 60
  const hourlyRate = employee.hourlyRate

  // Proventos CLT intermitente (Art. 452-A)
  const salarioBase = workedHours * hourlyRate
  const dsr = salarioBase / 6 // Descanso semanal remunerado
  const ferias = (salarioBase + dsr) / 12 // Ferias proporcionais
  const tercoFerias = ferias / 3 // 1/3 constitucional
  const decimoTerceiro = (salarioBase + dsr) / 12 // 13o proporcional
  const totalBruto = salarioBase + dsr + ferias + tercoFerias + decimoTerceiro

  // Descontos
  const inssEmpregado = calcularINSSEmpregado(totalBruto)
  const baseIR = totalBruto - inssEmpregado
  const irrf = calcularIRRF(baseIR)
  const multaNoshowDesconto = noshowFine || 0
  const totalDescontos = inssEmpregado + irrf + multaNoshowDesconto

  // Liquido
  const liquidoColaborador = Math.max(0, totalBruto - totalDescontos)

  // Custo empregador
  const fgts = totalBruto * 0.08
  const inssPatronal = totalBruto * 0.20
  const custoTotalEmpregador = totalBruto + fgts + inssPatronal

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    shiftDate,
    shiftStart,
    shiftEnd,
    workedMinutes,
    workedHours: Math.round(workedHours * 100) / 100,
    hourlyRate,
    salarioBase: round2(salarioBase),
    dsr: round2(dsr),
    ferias: round2(ferias),
    tercoFerias: round2(tercoFerias),
    decimoTerceiro: round2(decimoTerceiro),
    totalBruto: round2(totalBruto),
    inssEmpregado: round2(inssEmpregado),
    irrf: round2(irrf),
    multaNoshowDesconto: round2(multaNoshowDesconto),
    totalDescontos: round2(totalDescontos),
    liquidoColaborador: round2(liquidoColaborador),
    fgts: round2(fgts),
    inssPatronal: round2(inssPatronal),
    custoTotalEmpregador: round2(custoTotalEmpregador),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calculateShiftMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let startMin = sh * 60 + (sm || 0)
  let endMin = eh * 60 + (em || 0)
  if (endMin <= startMin) endMin += 24 * 60
  return endMin - startMin
}

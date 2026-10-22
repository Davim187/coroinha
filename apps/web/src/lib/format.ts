export function formatDate(value?: string | null) {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

export function formatMoney(value?: string | null) {
  if (!value) return '—'
  const negative = value.startsWith('-')
  const [whole, fraction = '00'] = value.replace('-', '').split('.')
  const grouped = Number(whole || 0).toLocaleString('pt-BR')
  return `${negative ? '-' : ''}R$ ${grouped},${fraction.padEnd(2, '0').slice(0, 2)}`
}

export function todayInput() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function currentMonth() {
  return todayInput().slice(0, 7)
}

export function shiftMonth(month: string, delta: number) {
  const [yearValue, monthValue] = month.split('-').map(Number)
  const date = new Date(yearValue || 2000, (monthValue || 1) - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const tones = {
  navy: 'bg-navy-900 text-white',
  gold: 'bg-gold-100 text-gold-700',
  green: 'bg-emerald-50 text-emerald-800',
  red: 'bg-red-50 text-red-800',
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-50 text-amber-800',
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone])}>{children}</span>
}

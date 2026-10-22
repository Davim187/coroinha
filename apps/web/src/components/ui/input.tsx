import * as React from 'react'
import { cn } from '@/lib/utils'

export function Input(props: React.ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={cn(
        'h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none transition placeholder:text-muted focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15',
        props.className,
      )}
    />
  )
}

export function Textarea(props: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-24 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15',
        props.className,
      )}
    />
  )
}

export function Select(props: React.ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className={cn(
        'h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/15',
        props.className,
      )}
    />
  )
}

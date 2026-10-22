import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-navy-900 text-white shadow-sm hover:bg-navy-800',
        gold: 'bg-gold-500 text-navy-950 hover:bg-gold-700 hover:text-white',
        outline: 'border border-line bg-white text-navy-900 hover:bg-gold-100',
        ghost: 'text-navy-900 hover:bg-navy-900/5',
        danger: 'bg-red-700 text-white hover:bg-red-800',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-11 px-5',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

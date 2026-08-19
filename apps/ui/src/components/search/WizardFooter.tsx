import { cn } from '@/lib/utils'

interface WizardFooterProps {
  children: React.ReactNode
  className?: string
}

export function WizardFooter({ children, className }: WizardFooterProps) {
  return (
    <div className={cn('mt-8 flex gap-3 border-t border-border pt-6', className)}>
      {children}
    </div>
  )
}

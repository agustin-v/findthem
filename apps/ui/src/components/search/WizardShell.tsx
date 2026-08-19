import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { StepIndicator } from '@/components/search/StepIndicator'

interface WizardShellProps {
  step: number
  total: number
  title: string
  children: React.ReactNode
}

export function WizardShell({ step, total, title, children }: WizardShellProps) {
  const { t } = useTranslation('common')
  const { t: ts } = useTranslation('search')
  const navigate = useNavigate()

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('searches')}</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-semibold">{ts('newSearchBreadcrumb')}</span>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: '/dashboard' })}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
          {t('cancel')}
        </button>
      </div>

      <div className="mx-auto w-full max-w-[640px] flex-1 px-6 py-9">
        <div className="mb-5">
          <StepIndicator current={step} total={total} />
        </div>
        <h2 className="mb-6 font-heading text-[28px] font-bold tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  )
}

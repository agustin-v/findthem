import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

export function EmptyState() {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
        <Search className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <h2 className="text-sm font-medium">{t('emptyTitle')}</h2>
        <p className="text-[13px] text-muted-foreground">{t('emptyDescription')}</p>
      </div>
      <Button
        className="h-9 bg-primary text-[13px] font-medium hover:bg-primary/90"
        onClick={() => navigate({ to: '/dashboard/search/new' })}
      >
        {t('firstSearch')}
      </Button>
    </div>
  )
}

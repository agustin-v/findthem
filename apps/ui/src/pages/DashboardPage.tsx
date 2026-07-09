import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchCard } from '@/components/dashboard/SearchCard'
import { EmptyState } from '@/components/dashboard/EmptyState'
import { useSearches } from '@/hooks/useSearches'
import { Plus } from 'lucide-react'

export function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()
  const { data: searches, isLoading } = useSearches()

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-base font-semibold">{t('title')}</h1>
        <Button
          className="h-9 gap-2 bg-[#1d4ed8] text-[13px] font-medium hover:bg-[#1d4ed8]/90"
          onClick={() => navigate({ to: '/dashboard/search/new' })}
        >
          <Plus className="size-3.5" />
          {t('newSearch')}
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </>
        ) : !searches || searches.length === 0 ? (
          <EmptyState />
        ) : (
          searches.map((search) => (
            <SearchCard key={search.id} search={search} />
          ))
        )}
      </div>
    </div>
  )
}

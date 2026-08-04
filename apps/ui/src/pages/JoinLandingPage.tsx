import { useTranslation } from 'react-i18next'
import { useParams } from '@tanstack/react-router'
import { User, PawPrint, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthLayout } from '@/layouts/AuthLayout'
import { useJoinPreview } from '@/hooks/useSearches'

const subjectIcons = {
  person: User,
  animal: PawPrint,
  object: Package,
} as const

export function JoinLandingPage() {
  const { t } = useTranslation('join')
  const { code } = useParams({ strict: false }) as { code: string }
  const { data: preview, isLoading, isError } = useJoinPreview(code)

  const appLink = `findthem://join/${code}`

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : isError || !preview ? (
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{t('notFound.title')}</h1>
            <p className="text-[13px] text-muted-foreground">{t('notFound.description')}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                {(() => {
                  const Icon = subjectIcons[preview.subjectType]
                  return <Icon className="size-5" />
                })()}
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{preview.subjectName}</h1>
                <p className="text-[13px] text-muted-foreground">
                  {t(`subjectType.${preview.subjectType}`)}
                </p>
              </div>
            </div>

            {preview.area && (
              <p className="text-sm text-muted-foreground">
                {t('areaLabel')} {preview.area}
              </p>
            )}

            <Button asChild className="h-11 w-full">
              <a href={appLink}>{t('openApp')}</a>
            </Button>

            <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3">
              <p className="text-[13px] text-muted-foreground">{t('noAppYet')}</p>
              <p className="text-[13px] text-muted-foreground">{t('codeLabel')}</p>
              <code className="text-lg font-semibold tracking-widest">{code}</code>
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  )
}

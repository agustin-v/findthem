import { useTranslation } from 'react-i18next'
import { UserProfile } from '@clerk/react'
import { clerkAppearance } from '@/lib/clerk-appearance'

export function SettingsPage() {
  const { t } = useTranslation('common')

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 font-heading text-2xl font-semibold tracking-tight">
        {t('settings')}
      </h1>
      <UserProfile
        routing="hash"
        appearance={{
          ...clerkAppearance,
          elements: { rootBox: 'w-full', cardBox: 'w-full' },
        }}
      />
    </div>
  )
}

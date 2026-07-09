import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation('common')
  const currentLang = i18n.language

  return (
    <div className="flex items-center">
      <button
        className={cn(
          'min-h-[44px] px-2 text-sm transition-colors',
          currentLang === 'en'
            ? 'font-semibold text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => i18n.changeLanguage('en')}
        aria-label={t('en')}
      >
        EN
      </button>
      <span className="text-muted-foreground/50">/</span>
      <button
        className={cn(
          'min-h-[44px] px-2 text-sm transition-colors',
          currentLang === 'it'
            ? 'font-semibold text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => i18n.changeLanguage('it')}
        aria-label={t('it')}
      >
        IT
      </button>
    </div>
  )
}

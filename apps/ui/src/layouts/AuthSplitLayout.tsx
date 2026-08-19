import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { Logo } from '@/components/shared/Logo'
import { ThemeSwitcher } from '@/components/shared/ThemeSwitcher'

interface AuthSplitLayoutProps {
  children: React.ReactNode
}

export function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-dvh bg-background md:flex-row">
      <div className="relative hidden shrink-0 flex-col justify-between overflow-hidden bg-[#E4571B] p-11 text-white md:flex md:w-[38%] lg:p-16">
        <svg
          viewBox="0 0 440 680"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]"
        >
          <g fill="none" stroke="currentColor" strokeWidth={1.5}>
            <ellipse cx="90" cy="560" rx="120" ry="90" />
            <ellipse cx="90" cy="560" rx="210" ry="160" />
            <ellipse cx="90" cy="560" rx="310" ry="235" />
            <ellipse cx="90" cy="560" rx="420" ry="320" />
          </g>
        </svg>
        <div className="relative flex items-center gap-3">
          <Logo size="lg" inverted />
          <span className="font-heading text-xl font-bold tracking-tight">
            {t('appName')}
          </span>
        </div>
        <h2 className="relative font-heading text-[38px] leading-[1.05] font-bold tracking-tight text-balance lg:text-[44px]">
          {t('tagline', { ns: 'auth' })}
        </h2>
        <div className="relative" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end gap-1 p-4">
          <ThemeSwitcher />
          <span className="text-muted-foreground/40">·</span>
          <LanguageSwitcher />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-6 md:px-14">
          <div className="mb-6 flex flex-col items-center gap-2 text-center md:hidden">
            <Logo size="lg" />
            <span className="font-heading text-xl font-bold tracking-tight">
              {t('appName')}
            </span>
            <p className="text-[13px] text-muted-foreground">
              {t('tagline', { ns: 'auth' })}
            </p>
          </div>
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  )
}

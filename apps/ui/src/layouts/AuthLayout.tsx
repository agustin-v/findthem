import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/shared/ThemeSwitcher'

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-end p-4">
        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <span className="text-muted-foreground/40">·</span>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-8">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-[0_20px_50px_rgba(45,33,15,0.06)]">
          {children}
        </div>
      </main>
    </div>
  )
}

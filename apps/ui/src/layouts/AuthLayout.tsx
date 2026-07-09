import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/shared/ThemeSwitcher'

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="flex items-center justify-end p-4">
        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <span className="text-muted-foreground/40">·</span>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-8">
        <div className="w-full max-w-md rounded-lg border bg-background p-6">
          {children}
        </div>
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark'

function getStoredTheme(): Theme {
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('theme', theme)
}

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <div className="flex items-center">
      <button
        className={cn(
          'min-h-[44px] px-2 text-sm transition-colors',
          theme === 'light'
            ? 'font-semibold text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => setTheme('light')}
        aria-label="Light mode"
      >
        LT
      </button>
      <span className="text-muted-foreground/50">/</span>
      <button
        className={cn(
          'min-h-[44px] px-2 text-sm transition-colors',
          theme === 'dark'
            ? 'font-semibold text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => setTheme('dark')}
        aria-label="Dark mode"
      >
        DK
      </button>
    </div>
  )
}

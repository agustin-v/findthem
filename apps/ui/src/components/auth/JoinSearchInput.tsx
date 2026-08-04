import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function JoinSearchInput() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  const handleJoin = () => {
    const trimmed = code.trim()
    if (!trimmed) return
    navigate({ to: '/join/$code', params: { code: trimmed } })
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted-foreground">{t('joinSearch')}</p>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          placeholder={t('searchCode')}
          className="h-11 flex-1"
        />
        <Button
          variant="outline"
          className="h-11 min-w-[44px]"
          disabled={!code.trim()}
          onClick={handleJoin}
        >
          {t('join')}
        </Button>
      </div>
    </div>
  )
}

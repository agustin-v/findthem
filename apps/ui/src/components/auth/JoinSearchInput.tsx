import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function JoinSearchInput() {
  const { t } = useTranslation('auth')
  const [code, setCode] = useState('')

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted-foreground">{t('joinSearch')}</p>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('searchCode')}
          className="h-11 flex-1"
        />
        <Button
          variant="outline"
          className="h-11 min-w-[44px]"
          disabled={!code.trim()}
        >
          {t('join')}
        </Button>
      </div>
    </div>
  )
}

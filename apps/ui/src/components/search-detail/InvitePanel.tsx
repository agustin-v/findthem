import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { useRotateJoinToken } from '@/hooks/useSearches'

interface InvitePanelProps {
  searchId: string
  joinToken: string
}

export function InvitePanel({ searchId, joinToken }: InvitePanelProps) {
  const { t } = useTranslation('dashboard')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [confirmingRotate, setConfirmingRotate] = useState(false)
  const rotateJoinToken = useRotateJoinToken(searchId)

  const joinUrl = `${window.location.origin}/join/${joinToken}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopyFailed(false)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyFailed(true)
    }
  }

  const handleRotate = () => {
    rotateJoinToken.mutate(undefined, {
      onSuccess: () => setConfirmingRotate(false),
    })
  }

  return (
    <div className="flex flex-col gap-3">
        <div className="flex justify-center rounded-lg bg-white p-2">
          <QRCodeSVG value={joinUrl} size={128} />
        </div>

        <div className="flex items-center gap-1.5">
          <code className="flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
            {joinUrl}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={handleCopy}
            aria-label={t('detail.invite.copy')}
          >
            {copied ? <Check className="text-actor-volunteer" /> : <Copy />}
          </Button>
        </div>
        {copyFailed && (
          <p className="text-[13px] text-destructive">{t('detail.invite.copyFailed')}</p>
        )}

        {confirmingRotate ? (
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-xs text-muted-foreground">
              {t('detail.invite.rotateConfirm')}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRotate}
              disabled={rotateJoinToken.isPending}
            >
              {t('detail.invite.rotateConfirmYes')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingRotate(false)}
            >
              {t('detail.invite.cancel')}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmingRotate(true)}
          >
            <RefreshCw />
            {t('detail.invite.rotate')}
          </Button>
        )}
        {rotateJoinToken.isError && (
          <p className="text-[13px] text-destructive">{t('detail.invite.rotateFailed')}</p>
        )}
    </div>
  )
}

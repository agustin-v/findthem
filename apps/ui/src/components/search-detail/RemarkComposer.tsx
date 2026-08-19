import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateRemark } from '@/hooks/useSearches'
import type { RemarkKind } from '@/lib/api'

const REMARK_KINDS: RemarkKind[] = ['sighting', 'hazard', 'note']

interface RemarkComposerProps {
  searchId: string
  location: { lat: number; lng: number }
  onClose: () => void
}

// Opens once a map location has already been picked (SearchDetailPage's
// "post a notice" placing mode) — this component never picks the location
// itself, it only collects kind/text for a lat/lng it's handed.
export function RemarkComposer({ searchId, location, onClose }: RemarkComposerProps) {
  const { t } = useTranslation('dashboard')
  const createRemark = useCreateRemark(searchId)
  const [kind, setKind] = useState<RemarkKind>('hazard')
  const [text, setText] = useState('')

  const handleSubmit = () => {
    createRemark.mutate(
      { kind, text: text.trim() || undefined, lat: location.lat, lng: location.lng },
      { onSuccess: onClose },
    )
  }

  return (
    <Card size="sm" className="bg-card/95 backdrop-blur-sm shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('detail.remarks.composerTitle')}</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label={t('detail.remarks.cancel')}
        >
          <X />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as RemarkKind)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REMARK_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`detail.remarks.kind.${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('detail.remarks.textPlaceholder')}
          maxLength={255}
          rows={2}
        />

        {createRemark.isError && (
          <p className="text-[13px] text-destructive">{t('detail.remarks.postFailed')}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('detail.remarks.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={handleSubmit} disabled={createRemark.isPending}>
            {t('detail.remarks.post')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

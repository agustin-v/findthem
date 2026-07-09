import { useRef, useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, X } from 'lucide-react'

const MAX_FILES = 5
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

interface ImageUploaderProps {
  value: File[]
  onChange: (files: File[]) => void
}

export function ImageUploader({ value, onChange }: ImageUploaderProps) {
  const { t } = useTranslation('search')
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])

  useEffect(() => {
    const urls = value.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [value])

  const addFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return
      const accepted = Array.from(incoming).filter(
        (f) => f.type.startsWith('image/') && f.size <= MAX_SIZE,
      )
      const next = [...value, ...accepted].slice(0, MAX_FILES)
      onChange(next)
    },
    [value, onChange],
  )

  const remove = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index))
    },
    [value, onChange],
  )

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-[13px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <ImagePlus className="h-4 w-4" />
        {t('addPhotos')}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {previews.length > 0 && (
        <div className="flex gap-2 overflow-x-auto py-1">
          {previews.map((src, i) => (
            <div key={src} className="relative shrink-0">
              <img
                src={src}
                alt={value[i]?.name}
                className="h-16 w-16 rounded-md object-cover"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

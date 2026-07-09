import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ImageUploader } from '@/components/search/ImageUploader'
import { LocationPicker, type LocationValue } from '@/components/shared/LocationPicker'
import { objectSchema, type ObjectData } from '@/lib/schemas'

interface ObjectFormProps {
  defaultValues?: Partial<ObjectData>
  onSubmit: (data: ObjectData) => void
  onBack: () => void
}

export function ObjectForm({ defaultValues, onSubmit, onBack }: ObjectFormProps) {
  const { t } = useTranslation('search')
  const { t: tc } = useTranslation('common')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ObjectData>({
    resolver: zodResolver(objectSchema),
    defaultValues,
  })

  const lastSeenCoords = watch('lastSeenCoords')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-[13px]">
          {t('fields.photos')}{' '}
          <span className="text-muted-foreground">({t('optional')})</span>
        </Label>
        <Controller
          name="photos"
          control={control}
          defaultValue={[]}
          render={({ field }) => (
            <ImageUploader
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
        <p className="text-[12px] text-muted-foreground">{t('photosHint')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="object-desc" className="text-[13px]">{t('fields.description')}</Label>
        <Input
          id="object-desc"
          className="h-11"
          placeholder={t('placeholders.description')}
          {...register('description')}
        />
        {errors.description && (
          <p className="mt-0.5 text-[13px] text-destructive">
            {t('errors.objectDescMin')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="object-size" className="text-[13px]">
          {t('fields.sizeWeight')}{' '}
          <span className="text-muted-foreground">({t('optional')})</span>
        </Label>
        <Input
          id="object-size"
          className="h-11"
          placeholder={t('placeholders.sizeWeight')}
          {...register('sizeWeight')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="object-state" className="text-[13px]">
          {t('fields.lastKnownState')}{' '}
          <span className="text-muted-foreground">({t('optional')})</span>
        </Label>
        <Textarea
          id="object-state"
          placeholder={t('placeholders.lastKnownState')}
          {...register('lastKnownState')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="object-lastseen" className="text-[13px]">{t('fields.lastSeenAt')}</Label>
        <Input
          id="object-lastseen"
          type="datetime-local"
          className="h-11"
          {...register('lastSeenAt')}
        />
        {errors.lastSeenAt && (
          <p className="mt-0.5 text-[13px] text-destructive">
            {t('errors.lastSeenRequired')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-[13px]">{t('fields.lastSeenLocation')}</Label>
        <Controller
          name="lastSeenLocation"
          control={control}
          render={({ field }) => (
            <LocationPicker
              value={
                field.value
                  ? { address: field.value, lat: lastSeenCoords?.lat ?? 0, lng: lastSeenCoords?.lng ?? 0 }
                  : null
              }
              onChange={(loc: LocationValue) => {
                field.onChange(loc.address)
                setValue('lastSeenCoords', { lat: loc.lat, lng: loc.lng })
              }}
              placeholder={t('placeholders.lastSeenLocation')}
              error={errors.lastSeenLocation ? t('errors.locationMin') : undefined}
            />
          )}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          onClick={onBack}
        >
          {tc('back')}
        </Button>
        <Button
          type="submit"
          className="h-11 flex-1 bg-[#1d4ed8] font-medium hover:bg-[#1d4ed8]/90"
        >
          {tc('next')}
        </Button>
      </div>
    </form>
  )
}

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ImageUploader } from '@/components/search/ImageUploader'
import { LocationPicker, type LocationValue } from '@/components/shared/LocationPicker'
import { animalSchema, type AnimalData } from '@/lib/schemas'
import { nowForDateTimeLocal } from '@/lib/utils'

interface AnimalFormProps {
  defaultValues?: Partial<AnimalData>
  onSubmit: (data: AnimalData) => void
  onBack: () => void
}

export function AnimalForm({ defaultValues, onSubmit, onBack }: AnimalFormProps) {
  const { t } = useTranslation('search')
  const { t: tc } = useTranslation('common')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AnimalData>({
    resolver: zodResolver(animalSchema),
    defaultValues,
  })

  const lastSeenCoords = watch('lastSeenCoords')

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
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
        <Label htmlFor="animal-species" className="text-[13px]">{t('fields.speciesBreed')}</Label>
        <Input
          id="animal-species"
          className="h-11"
          placeholder={t('placeholders.speciesBreed')}
          {...register('speciesBreed')}
        />
        {errors.speciesBreed && (
          <p className="mt-0.5 text-[13px] text-destructive">{t('errors.speciesMin')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="animal-name" className="text-[13px]">
          {t('fields.animalName')}{' '}
          <span className="text-muted-foreground">({t('optional')})</span>
        </Label>
        <Input
          id="animal-name"
          className="h-11"
          placeholder={t('placeholders.animalName')}
          {...register('name')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="animal-behaviour" className="text-[13px]">
          {t('fields.behaviourNotes')}{' '}
          <span className="text-muted-foreground">({t('optional')})</span>
        </Label>
        <Textarea
          id="animal-behaviour"
          placeholder={t('placeholders.behaviourNotes')}
          {...register('behaviourNotes')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="animal-microchip" className="text-[13px]">
          {t('fields.microchip')}{' '}
          <span className="text-muted-foreground">({t('optional')})</span>
        </Label>
        <Input
          id="animal-microchip"
          className="h-11"
          placeholder={t('placeholders.microchip')}
          {...register('microchip')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="animal-phone" className="text-[13px]">{t('fields.contactPhone')}</Label>
        <Input
          id="animal-phone"
          type="tel"
          className="h-11"
          placeholder={t('placeholders.contactPhone')}
          {...register('contactPhone')}
        />
        {errors.contactPhone && (
          <p className="mt-0.5 text-[13px] text-destructive">{t('errors.contactPhoneRequired')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="animal-lastseen" className="text-[13px]">{t('fields.lastSeenAt')}</Label>
        <Input
          id="animal-lastseen"
          type="datetime-local"
          className="h-11"
          max={nowForDateTimeLocal()}
          {...register('lastSeenAt')}
        />
        {errors.lastSeenAt && (
          <p className="mt-0.5 text-[13px] text-destructive">
            {errors.lastSeenAt.message === 'future'
              ? t('errors.lastSeenFuture')
              : t('errors.lastSeenRequired')}
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
              onInputChange={field.onChange}
              placeholder={t('placeholders.lastSeenLocation')}
              error={
                errors.lastSeenLocation
                  ? t('errors.locationMin')
                  : errors.lastSeenCoords
                    ? t('errors.locationRequired')
                    : undefined
              }
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

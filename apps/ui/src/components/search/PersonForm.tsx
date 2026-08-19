import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ImageUploader } from '@/components/search/ImageUploader'
import { WizardFooter } from '@/components/search/WizardFooter'
import { LocationPicker, type LocationValue } from '@/components/shared/LocationPicker'
import { personSchema, type PersonData } from '@/lib/schemas'
import { nowForDateTimeLocal } from '@/lib/utils'

interface PersonFormProps {
  defaultValues?: Partial<PersonData>
  onSubmit: (data: PersonData) => void
  onBack: () => void
}

export function PersonForm({ defaultValues, onSubmit, onBack }: PersonFormProps) {
  const { t } = useTranslation('search')
  const { t: tc } = useTranslation('common')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PersonData>({
    resolver: zodResolver(personSchema),
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
        <Label htmlFor="person-name" className="text-[13px]">{t('fields.name')}</Label>
        <Input
          id="person-name"
          className="h-11"
          placeholder={t('placeholders.name')}
          {...register('name')}
        />
        {errors.name && (
          <p className="mt-0.5 text-[13px] text-destructive">{t('errors.nameMin')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="person-age" className="text-[13px]">{t('fields.age')}</Label>
        <Input
          id="person-age"
          type="number"
          inputMode="numeric"
          className="h-11"
          placeholder={t('placeholders.age')}
          {...register('age', { valueAsNumber: true })}
        />
        {errors.age && (
          <p className="mt-0.5 text-[13px] text-destructive">{t('errors.ageRequired')}</p>
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="person-height" className="text-[13px]">
            {t('fields.height')}{' '}
            <span className="text-muted-foreground">({t('optional')})</span>
          </Label>
          <Input
            id="person-height"
            className="h-11"
            placeholder={t('placeholders.height')}
            {...register('height')}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="person-weight" className="text-[13px]">
            {t('fields.weight')}{' '}
            <span className="text-muted-foreground">({t('optional')})</span>
          </Label>
          <Input
            id="person-weight"
            className="h-11"
            placeholder={t('placeholders.weight')}
            {...register('weight')}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="person-desc" className="text-[13px]">{t('fields.physicalDescription')}</Label>
        <Textarea
          id="person-desc"
          placeholder={t('placeholders.physicalDescription')}
          {...register('physicalDescription')}
        />
        {errors.physicalDescription && (
          <p className="mt-0.5 text-[13px] text-destructive">
            {t('errors.descriptionMin')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="person-general-desc" className="text-[13px]">
          {t('fields.generalDescription')}{' '}
          <span className="text-muted-foreground">({t('optional')})</span>
        </Label>
        <Textarea
          id="person-general-desc"
          placeholder={t('placeholders.generalDescription')}
          {...register('generalDescription')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="person-health" className="text-[13px]">
          {t('fields.healthNotes')}{' '}
          <span className="text-muted-foreground">({t('optional')})</span>
        </Label>
        <Textarea
          id="person-health"
          placeholder={t('placeholders.healthNotes')}
          {...register('healthNotes')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="person-phone" className="text-[13px]">{t('fields.contactPhone')}</Label>
        <Input
          id="person-phone"
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
        <Label htmlFor="person-lastseen" className="text-[13px]">{t('fields.lastSeenAt')}</Label>
        <Input
          id="person-lastseen"
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="person-destination" className="text-[13px]">
          {t('fields.intendedDestination')}{' '}
          <span className="text-muted-foreground">({t('optional')})</span>
        </Label>
        <Textarea
          id="person-destination"
          placeholder={t('placeholders.intendedDestination')}
          {...register('intendedDestination')}
        />
      </div>

      <WizardFooter>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          onClick={onBack}
        >
          {tc('back')}
        </Button>
        <Button type="submit" className="h-11 flex-1 font-medium">
          {tc('next')}
        </Button>
      </WizardFooter>
    </form>
  )
}

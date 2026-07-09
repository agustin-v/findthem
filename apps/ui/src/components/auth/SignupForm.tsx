import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signupSchema, type SignupData } from '@/lib/schemas'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

export function SignupForm() {
  const { t } = useTranslation('auth')
  const { login } = useAuth()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupData>({
    resolver: zodResolver(signupSchema),
  })

  const mutation = useMutation({
    mutationFn: api.auth.signup,
    onSuccess: (data) => {
      login(data.token, data.user)
      navigate({ to: '/dashboard' })
    },
  })

  const onSubmit = (data: SignupData) => {
    mutation.mutate(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-name" className="text-[13px]">{t('fullName')}</Label>
        <Input
          id="signup-name"
          type="text"
          autoComplete="name"
          className="h-11"
          {...register('fullName')}
        />
        {errors.fullName && (
          <p className="mt-0.5 text-[13px] text-destructive">
            {t('errors.fullNameMin')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email" className="text-[13px]">{t('email')}</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          className="h-11"
          {...register('email')}
        />
        {errors.email && (
          <p className="mt-0.5 text-[13px] text-destructive">{t('errors.emailInvalid')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password" className="text-[13px]">{t('password')}</Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          className="h-11"
          {...register('password')}
        />
        {errors.password && (
          <p className="mt-0.5 text-[13px] text-destructive">{t('errors.passwordMin')}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-confirm" className="text-[13px]">{t('confirmPassword')}</Label>
        <Input
          id="signup-confirm"
          type="password"
          autoComplete="new-password"
          className="h-11"
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className="mt-0.5 text-[13px] text-destructive">
            {t('errors.passwordsMismatch')}
          </p>
        )}
      </div>

      <Button
        type="submit"
        className="h-11 w-full bg-[#1d4ed8] font-medium hover:bg-[#1d4ed8]/90"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? t('creatingAccount') : t('createAccount')}
      </Button>
    </form>
  )
}

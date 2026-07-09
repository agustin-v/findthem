import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginSchema, type LoginData } from '@/lib/schemas'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Mail } from 'lucide-react'

export function LoginForm() {
  const { t } = useTranslation('auth')
  const { login } = useAuth()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  })

  const mutation = useMutation({
    mutationFn: api.auth.login,
    onSuccess: (data) => {
      login(data.token, data.user)
      navigate({ to: '/dashboard' })
    },
  })

  const onSubmit = (data: LoginData) => {
    mutation.mutate(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email" className="text-[13px]">{t('email')}</Label>
        <Input
          id="login-email"
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
        <Label htmlFor="login-password" className="text-[13px]">{t('password')}</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          className="h-11"
          {...register('password')}
        />
        {errors.password && (
          <p className="mt-0.5 text-[13px] text-destructive">{t('errors.passwordMin')}</p>
        )}
      </div>

      <Button
        type="submit"
        className="h-11 w-full bg-[#1d4ed8] font-medium hover:bg-[#1d4ed8]/90"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? t('signingIn') : t('signIn')}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full gap-2 text-[13px]"
      >
        <Mail className="size-4" />
        {t('magicLink')}
      </Button>
    </form>
  )
}

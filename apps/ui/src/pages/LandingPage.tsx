import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { LoginForm } from '@/components/auth/LoginForm'
import { SignupForm } from '@/components/auth/SignupForm'
import { JoinSearchInput } from '@/components/auth/JoinSearchInput'
import { AuthLayout } from '@/layouts/AuthLayout'

export function LandingPage() {
  const { t } = useTranslation()

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('appName')}</h1>
          <p className="text-[13px] text-muted-foreground">{t('tagline', { ns: 'auth' })}</p>
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="min-h-[44px] flex-1">
              {t('signIn', { ns: 'auth' })}
            </TabsTrigger>
            <TabsTrigger value="signup" className="min-h-[44px] flex-1">
              {t('createAccount', { ns: 'auth' })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="pt-3">
            <LoginForm />
          </TabsContent>
          <TabsContent value="signup" className="pt-3">
            <SignupForm />
          </TabsContent>
        </Tabs>

        <Separator />

        <JoinSearchInput />
      </div>
    </AuthLayout>
  )
}

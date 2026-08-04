import { useTranslation } from 'react-i18next'
import { SignIn, SignUp } from '@clerk/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { JoinSearchInput } from '@/components/auth/JoinSearchInput'
import { AuthLayout } from '@/layouts/AuthLayout'

const clerkAppearance = {
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none',
    card: 'w-full shadow-none border-none p-0',
    footer: 'hidden',
  },
}

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
            <SignIn
              routing="hash"
              forceRedirectUrl="/dashboard"
              appearance={clerkAppearance}
            />
          </TabsContent>
          <TabsContent value="signup" className="pt-3">
            <SignUp
              routing="hash"
              forceRedirectUrl="/dashboard"
              appearance={clerkAppearance}
            />
          </TabsContent>
        </Tabs>

        <Separator />

        <JoinSearchInput />
      </div>
    </AuthLayout>
  )
}

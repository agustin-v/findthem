import { useTranslation } from 'react-i18next'
import { SignIn, SignUp } from '@clerk/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuthSplitLayout } from '@/layouts/AuthSplitLayout'
import { clerkAppearance as clerkTheme } from '@/lib/clerk-appearance'

const clerkAppearance = {
  ...clerkTheme,
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
    <AuthSplitLayout>
      <div className="flex flex-col gap-5">
        <Tabs defaultValue="signin">
          <TabsList className="mx-auto">
            <TabsTrigger value="signin" className="min-h-[40px] px-6">
              {t('signIn', { ns: 'auth' })}
            </TabsTrigger>
            <TabsTrigger value="signup" className="min-h-[40px] px-6">
              {t('createAccount', { ns: 'auth' })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="pt-5">
            <SignIn
              routing="hash"
              forceRedirectUrl="/dashboard"
              appearance={clerkAppearance}
            />
          </TabsContent>
          <TabsContent value="signup" className="pt-5">
            <SignUp
              routing="hash"
              forceRedirectUrl="/dashboard"
              appearance={clerkAppearance}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AuthSplitLayout>
  )
}

// Shared Clerk `appearance` config so <SignIn>/<SignUp>/<UserProfile> all
// pick up the warm-paper design system instead of Clerk's own defaults.
export const clerkAppearance = {
  variables: {
    colorPrimary: '#E4571B',
    colorText: '#1C1A17',
    colorBackground: '#FFFFFF',
    colorInputBackground: '#FFFFFF',
    colorInputText: '#1C1A17',
    borderRadius: '0.625rem',
    fontFamily: "'Hanken Grotesk Variable', sans-serif",
  },
}

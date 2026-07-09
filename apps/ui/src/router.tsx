import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { RootLayout } from '@/layouts/RootLayout'
import { AppLayout } from '@/layouts/AppLayout'
import { LandingPage } from '@/pages/LandingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { NewSearchPage } from '@/pages/NewSearchPage'
import { SearchDetailPage } from '@/pages/SearchDetailPage'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: AppLayout,
  beforeLoad: () => {
    const token = localStorage.getItem('findthem_token')
    if (!token) throw redirect({ to: '/' })
  },
})

const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  component: DashboardPage,
})

const newSearchRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/search/new',
  component: NewSearchPage,
})

const searchDetailRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/search/$searchId',
  component: SearchDetailPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute.addChildren([dashboardIndexRoute, newSearchRoute, searchDetailRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

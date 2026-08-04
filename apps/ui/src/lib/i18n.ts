import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from '@/locales/en/common.json'
import enAuth from '@/locales/en/auth.json'
import enDashboard from '@/locales/en/dashboard.json'
import enSearch from '@/locales/en/search.json'
import enJoin from '@/locales/en/join.json'
import itCommon from '@/locales/it/common.json'
import itAuth from '@/locales/it/auth.json'
import itDashboard from '@/locales/it/dashboard.json'
import itSearch from '@/locales/it/search.json'
import itJoin from '@/locales/it/join.json'

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      auth: enAuth,
      dashboard: enDashboard,
      search: enSearch,
      join: enJoin,
    },
    it: {
      common: itCommon,
      auth: itAuth,
      dashboard: itDashboard,
      search: itSearch,
      join: itJoin,
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  ns: ['common', 'auth', 'dashboard', 'search', 'join'],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n

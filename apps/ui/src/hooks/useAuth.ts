import { useCallback } from 'react'

export interface User {
  name: string
  email: string
}

export function useAuth() {
  const token = localStorage.getItem('findthem_token')
  const user: User | null = JSON.parse(
    localStorage.getItem('findthem_user') || 'null',
  )
  const isAuthenticated = !!token

  const login = useCallback((token: string, user: User) => {
    localStorage.setItem('findthem_token', token)
    localStorage.setItem('findthem_user', JSON.stringify(user))
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('findthem_token')
    localStorage.removeItem('findthem_user')
  }, [])

  return { isAuthenticated, user, login, logout }
}

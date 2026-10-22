import type { AuthUser } from '@coroinha/contracts'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, onSessionEnd, restoreSession, setAccessToken } from '@/lib/api'

type AuthState = {
  user: AuthUser | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: AuthUser | null) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    restoreSession().finally(() => setReady(true))
    return onSessionEnd(setUser)
  }, [])

  async function login(email: string, password: string) {
    const result = await api<{ accessToken: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setAccessToken(result.accessToken)
    setUser(result.user)
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    setAccessToken(null)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, ready, login, logout, setUser }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider ausente')
  return value
}

import type { ApiErrorBody, AuthUser } from '@coroinha/contracts'

export class ApiError extends Error {
  status: number
  details: unknown

  constructor(status: number, message: string, details: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

let accessToken: string | null = null
let refreshPromise: Promise<boolean> | null = null
const listeners = new Set<(user: AuthUser | null) => void>()

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function onSessionEnd(listener: (user: AuthUser | null) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'x-coroinha-client': 'web' },
    })
      .then(async (response) => {
        if (!response.ok) {
          accessToken = null
          listeners.forEach((listener) => listener(null))
          return false
        }
        const data = (await response.json()) as { accessToken: string; user: AuthUser }
        accessToken = data.accessToken
        listeners.forEach((listener) => listener(data.user))
        return true
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export async function restoreSession() {
  return refreshSession()
}

async function request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('x-coroinha-client', 'web')
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)
  let response: Response
  try {
    response = await fetch(path, { ...init, headers, credentials: 'include' })
  } catch {
    throw new ApiError(0, 'Não foi possível conectar ao servidor.', null)
  }
  if (response.status === 401 && retry && !path.startsWith('/api/auth/login')) {
    const refreshed = await refreshSession()
    if (refreshed) return request(path, init, false)
  }
  return response
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const body = data as ApiErrorBody | null
    throw new ApiError(response.status, body?.error?.message || 'Não foi possível concluir a ação.', body?.error?.details ?? null)
  }
  return data as T
}

export async function api<T>(path: string, init?: RequestInit) {
  return parse<T>(await request(path, init))
}

export async function downloadFile(path: string, filename: string) {
  const response = await request(path)
  if (!response.ok) await parse(response)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

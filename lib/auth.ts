const TOKEN_KEY = 'rf_token'
const USER_KEY  = 'rf_user'

export interface AuthUser {
  id: string
  email: string
  isAdmin: boolean
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

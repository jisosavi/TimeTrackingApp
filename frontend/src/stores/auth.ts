import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export type UserType = 'employee' | 'supervisor' | 'admin' | 'superadmin'

export interface AuthUser {
  id: number
  type: UserType
  companyId: number
  companySlug: string
  companyName?: string
  name: string
  email?: string
  uiLanguage: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('auth_token'))
  const user = ref<AuthUser | null>(
    (() => {
      const stored = localStorage.getItem('auth_user')
      return stored ? (JSON.parse(stored) as AuthUser) : null
    })(),
  )

  const isAuthenticated = computed(() => !!token.value)

  function setAuth(newToken: string, newUser: AuthUser) {
    token.value = newToken
    user.value = newUser
    localStorage.setItem('auth_token', newToken)
    localStorage.setItem('auth_user', JSON.stringify(newUser))
  }

  function clearAuth() {
    token.value = null
    user.value = null
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
  }

  return { token, user, isAuthenticated, setAuth, clearAuth }
})

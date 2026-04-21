import { useAuthStore } from '@/stores/auth'

export function useApi() {
  const auth = useAuthStore()

  async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }
    if (auth.token) {
      headers['Authorization'] = `Bearer ${auth.token}`
    }

    const response = await fetch(path, { ...options, headers })
    const data = await response.json()

    if (!response.ok) {
      throw new Error((data as { error?: string }).error ?? `HTTP ${response.status}`)
    }

    return data as T
  }

  return { apiFetch }
}

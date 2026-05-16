import { useAuthStore } from '@/stores/auth'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export function useApi() {
  const auth = useAuthStore()

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }
    if (auth.token) {
      headers['Authorization'] = `Bearer ${auth.token}`
    }

    const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
    const data = await response.json()

    if (!response.ok) {
      throw new Error((data as { error?: string }).error ?? `HTTP ${response.status}`)
    }

    return data as T
  }

  function get<T>(path: string): Promise<T> {
    return request<T>(path)
  }

  function post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined })
  }

  function patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined })
  }

  function del<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'DELETE', body: body !== undefined ? JSON.stringify(body) : undefined })
  }

  return { get, post, patch, del }
}

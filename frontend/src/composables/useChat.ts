import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import type { LlmParsedResponse } from '@/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  savedCount?: number
}

export function parseEntriesFromText(text: string): LlmParsedResponse | null {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) return null
  try {
    return JSON.parse(match[1]!) as LlmParsedResponse
  } catch {
    return null
  }
}

export function useChat() {
  const history = ref<ChatMessage[]>([])
  const loading = ref(false)
  const lastSavedIds = ref<number[]>([])
  const auth = useAuthStore()
  const { apiFetch } = useApi()

  async function send(text: string): Promise<void> {
    history.value.push({ role: 'user', content: text })
    loading.value = true

    try {
      const recentHistory = history.value.slice(-12).map(({ role, content }) => ({ role, content }))

      const res = await fetch('/llm_proxy.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          history: recentHistory,
          language: auth.user?.uiLanguage ?? 'en',
        }),
      })

      const data = (await res.json()) as { reply?: string; error?: string }
      if (data.error) throw new Error(data.error)

      const reply = data.reply ?? ''
      const parsed = parseEntriesFromText(reply)
      let savedCount: number | undefined

      if (parsed?.entries?.length) {
        savedCount = await saveEntries(parsed)
      }

      history.value.push({ role: 'assistant', content: reply, savedCount })
    } finally {
      loading.value = false
    }
  }

  async function saveEntries(parsed: LlmParsedResponse): Promise<number> {
    if (parsed.action === 'update' && lastSavedIds.value.length > 0) {
      await Promise.allSettled(
        lastSavedIds.value.map((id) =>
          apiFetch('/api/time_entries.php', {
            method: 'DELETE',
            body: JSON.stringify({ id }),
          }),
        ),
      )
    }

    const result = await apiFetch<{ success: boolean; saved: number; ids: number[] }>(
      '/api/time_entries.php',
      { method: 'POST', body: JSON.stringify({ entries: parsed.entries }) },
    )

    lastSavedIds.value = result.ids ?? []
    return result.saved
  }

  function reset() {
    history.value = []
    lastSavedIds.value = []
  }

  return { history, loading, send, reset }
}

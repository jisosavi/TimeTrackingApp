import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { API_VERSION } from '@/config'
import type { LlmParsedResponse, LlmParsedBlock, LlmHolidayProposal, LlmAbsence } from '@/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  savedCount?: number
  savedMessage?: string
}

export interface ChatPreview {
  parsed: LlmParsedBlock
  messageIndex: number
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

export function parseBlock(text: string): LlmParsedBlock | null {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) return null
  try {
    const raw = JSON.parse(match[1]!) as Record<string, unknown>
    if (raw.type === 'holiday_proposal') return raw as unknown as LlmHolidayProposal
    if (raw.type === 'absence') return raw as unknown as LlmAbsence
    if (Array.isArray(raw.entries) && raw.entries.length > 0) return raw as unknown as LlmParsedResponse
    return null
  } catch {
    return null
  }
}

function countWorkDays(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return 0
  let count = 0
  const d = new Date(s)
  while (d <= e) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

export function useChat() {
  const { t } = useI18n({ useScope: 'global' })
  const history = ref<ChatMessage[]>([])
  const loading = ref(false)
  const lastSavedIds = ref<number[]>([])
  const pendingPreview = ref<ChatPreview | null>(null)
  const auth = useAuthStore()
  const { post, del } = useApi()
  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

  async function send(text: string): Promise<void> {
    history.value.push({ role: 'user', content: text })
    loading.value = true

    try {
      const recentHistory = history.value.slice(-12).map(({ role, content }) => ({ role, content }))

      const res = await fetch(`${apiBase}${API_VERSION}/api/llm_proxy`, {
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
      const parsed = parseBlock(reply)

      history.value.push({ role: 'assistant', content: reply })

      if (parsed !== null) {
        pendingPreview.value = {
          parsed,
          messageIndex: history.value.length - 1,
        }
      }
    } finally {
      loading.value = false
    }
  }

  async function confirmPreview(block: LlmParsedBlock): Promise<void> {
    const preview = pendingPreview.value
    if (!preview) return
    const msg = history.value[preview.messageIndex]

    if ('type' in block && block.type === 'holiday_proposal') {
      await saveHolidayProposal(block)
      if (msg) msg.savedMessage = t('chat.holiday_proposal_saved')
    } else if ('type' in block && block.type === 'absence') {
      const days = countWorkDays(block.startDate, block.endDate)
      await saveAbsence(block)
      if (msg) msg.savedMessage = t('chat.absence_saved', { days })
    } else {
      const payload = block as LlmParsedResponse
      const savedCount = await saveEntries(payload)
      if (msg) msg.savedCount = savedCount
    }

    pendingPreview.value = null
  }

  function cancelPreview(): void {
    pendingPreview.value = null
  }

  async function saveEntries(parsed: LlmParsedResponse): Promise<number> {
    if (parsed.action === 'update' && lastSavedIds.value.length > 0) {
      await Promise.allSettled(
        lastSavedIds.value.map((id) => del('/api/time_entries', { id })),
      )
    }

    const result = await post<{ success: boolean; saved: number; ids: number[] }>(
      '/api/time_entries',
      { entries: parsed.entries },
    )

    lastSavedIds.value = result.ids ?? []
    return result.saved
  }

  async function saveHolidayProposal(block: LlmHolidayProposal): Promise<void> {
    await post('/api/holiday_proposals', {
      start_date: block.startDate,
      end_date: block.endDate,
      label: block.label ?? null,
      note: block.note ?? null,
    })
  }

  async function saveAbsence(block: LlmAbsence): Promise<void> {
    await post('/api/absences', {
      startDate: block.startDate,
      endDate: block.endDate,
      isPaid: block.isPaid,
      affectsAccrual: block.affectsAccrual,
      note: block.note ?? null,
    })
  }

  function reset() {
    history.value = []
    lastSavedIds.value = []
    pendingPreview.value = null
  }

  return { history, loading, send, reset, pendingPreview, confirmPreview, cancelPreview }
}

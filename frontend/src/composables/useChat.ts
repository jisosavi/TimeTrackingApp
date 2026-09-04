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

// The model sometimes emits one JSON block per entry instead of one block with
// several entries, so read every block: taking only the first silently dropped
// every entry after it.
function parseAllBlocks(text: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []
  for (const m of text.matchAll(/```json\s*([\s\S]*?)\s*```/g)) {
    try {
      const raw = JSON.parse(m[1]!) as Record<string, unknown>
      if (raw && typeof raw === 'object') blocks.push(raw)
    } catch {
      // ignore an unparseable block; a later one may still be valid
    }
  }
  return blocks
}

/** Merges the entries of every time_entry block into one, keeping the first action. */
function mergeEntryBlocks(blocks: Record<string, unknown>[]): LlmParsedResponse | null {
  const entryBlocks = blocks.filter((b) => Array.isArray(b.entries) && (b.entries as unknown[]).length > 0)
  if (entryBlocks.length === 0) return null
  return {
    ...(entryBlocks[0] as unknown as LlmParsedResponse),
    entries: entryBlocks.flatMap((b) => b.entries as LlmParsedResponse['entries']),
  }
}

export function parseEntriesFromText(text: string): LlmParsedResponse | null {
  return mergeEntryBlocks(parseAllBlocks(text))
}

export function parseBlock(text: string): LlmParsedBlock | null {
  const blocks = parseAllBlocks(text)
  const holiday = blocks.find((b) => b.type === 'holiday_proposal')
  if (holiday) return holiday as unknown as LlmHolidayProposal
  const absence = blocks.find((b) => b.type === 'absence')
  if (absence) return absence as unknown as LlmAbsence
  return mergeEntryBlocks(blocks)
}

/** Identity of an entry for duplicate detection: date + hours + km + project + code. */
function entrySignature(e: LlmParsedResponse['entries'][number]): string {
  return [
    String(e.date ?? '').trim(),
    Number(e.hours ?? 0),
    Number(e.mileage ?? 0),
    String(e.project ?? '').trim().toLowerCase(),
    String(e.dimensionValue ?? '').trim(),
  ].join('|')
}

export interface DedupedEntry {
  entry: LlmParsedResponse['entries'][number]
  sig: string
}

/**
 * Entries that still need saving. Two ways the same entry can arrive twice: the
 * model re-emits it on a later turn, or repeats it inside one entries array.
 * Both are dropped, because a mislabelled action:'new' would otherwise append a
 * duplicate rather than replace.
 */
export function dedupeEntries(
  entries: LlmParsedResponse['entries'],
  alreadySaved: ReadonlySet<string>,
): DedupedEntry[] {
  const seen = new Set<string>()
  const fresh: DedupedEntry[] = []
  for (const entry of entries) {
    const sig = entrySignature(entry)
    if (alreadySaved.has(sig) || seen.has(sig)) continue
    seen.add(sig)
    fresh.push({ entry, sig })
  }
  return fresh
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
  const savedSignatures = ref<Set<string>>(new Set())
  const lastSavedSignatures = ref<string[]>([])
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
      for (const sig of lastSavedSignatures.value) savedSignatures.value.delete(sig)
      lastSavedSignatures.value = []
    }

    // The model picks action itself, and labelling a repeat as 'new' would append
    // a duplicate rather than replace. Drop anything already saved this conversation.
    const fresh = dedupeEntries(parsed.entries, savedSignatures.value)
    if (fresh.length === 0) return 0

    const result = await post<{ success: boolean; saved: number; ids: number[] }>(
      '/api/time_entries',
      { entries: fresh.map(({ entry }) => entry) },
    )

    lastSavedIds.value = result.ids ?? []
    lastSavedSignatures.value = fresh.map(({ sig }) => sig)
    for (const sig of lastSavedSignatures.value) savedSignatures.value.add(sig)
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
      causeCode: block.causeCode,
      isPaid: block.isPaid,
      affectsAccrual: block.affectsAccrual,
      note: block.note ?? null,
    })
  }

  function reset() {
    history.value = []
    lastSavedIds.value = []
    savedSignatures.value = new Set()
    lastSavedSignatures.value = []
    pendingPreview.value = null
  }

  return { history, loading, send, reset, pendingPreview, confirmPreview, cancelPreview }
}

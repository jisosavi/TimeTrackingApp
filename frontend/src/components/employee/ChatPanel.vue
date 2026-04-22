<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChat } from '@/composables/useChat'
import { useTimeEntries } from '@/composables/useTimeEntries'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { LlmEntry } from '@/types'

const { t } = useI18n({ useScope: 'global' })

const emit = defineEmits<{ entriesSaved: [] }>()

const { history, loading, send, reset, pendingPreview, confirmPreview, cancelPreview } = useChat()
const { entries, fetchEntries } = useTimeEntries()
const auth = useAuthStore()
const inputText = ref('')
const chatEl = ref<HTMLElement | null>(null)
const isListening = ref(false)

onMounted(fetchEntries)

const recentEntries = computed(() => entries.value.slice(0, 3))

// ── Preview state ─────────────────────────────────────────────────────────────
interface PreviewRow { date: string; hours: string; project: string; notes: string }
const previewRows = ref<PreviewRow[]>([])

watch(
  () => pendingPreview.value,
  (preview) => {
    previewRows.value = preview
      ? preview.parsed.entries.map((e) => ({
          date: e.date ?? '',
          hours: e.hours > 0 ? String(e.hours) : '',
          project: e.project ?? '',
          notes: e.notes ?? '',
        }))
      : []
  },
)

async function handleConfirm() {
  if (!pendingPreview.value) return
  const merged: LlmEntry[] = pendingPreview.value.parsed.entries.map((orig, i) => {
    const row = previewRows.value[i]!
    return {
      ...orig,
      date: row.date || orig.date,
      hours: parseFloat(row.hours) || orig.hours,
      project: row.project,
      notes: row.notes,
    }
  })
  await confirmPreview(merged)
  await fetchEntries()
  emit('entriesSaved')
}

function handleCancel() {
  cancelPreview()
}

// ── Chat scroll ───────────────────────────────────────────────────────────────
watch(
  () => history.value.length,
  async () => {
    await nextTick()
    chatEl.value?.scrollTo({ top: chatEl.value.scrollHeight, behavior: 'smooth' })
  },
)

async function submit() {
  const text = inputText.value.trim()
  if (!text || loading.value) return
  inputText.value = ''
  await send(text)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}

function useExample(text: string) {
  inputText.value = text
}

function startVoice() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
  if (!SR) {
    alert('Voice input is not supported in this browser.')
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognition = new SR() as any
  recognition.lang = auth.user?.uiLanguage === 'fi' ? 'fi-FI' : 'en-US'
  recognition.interimResults = false
  isListening.value = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onresult = (e: any) => { inputText.value += e.results[0][0].transcript + ' ' }
  recognition.onend = () => { isListening.value = false }
  recognition.onerror = () => { isListening.value = false }
  recognition.start()
}

function formatMessage(text: string) {
  return text.replace(/```json[\s\S]*?```/g, '').trim()
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-12rem)]">

    <!-- Chat history -->
    <div ref="chatEl" class="flex-1 min-h-0 overflow-y-auto space-y-3 pb-4">

      <!-- Empty state with example prompts -->
      <div v-if="history.length === 0 && !pendingPreview" class="py-8 space-y-4">
        <div class="text-center text-sm text-muted-foreground">
          <p class="font-medium">{{ t('chat.title') }}</p>
        </div>
        <div class="grid grid-cols-1 gap-2">
          <Button
            v-for="key in ['employee.example_1', 'employee.example_2', 'employee.example_3']"
            :key="key"
            variant="outline"
            size="sm"
            class="h-auto py-2 px-3 text-sm text-left justify-start whitespace-normal"
            @click="useExample(t(key))"
          >
            {{ t(key) }}
          </Button>
        </div>
      </div>

      <!-- Messages -->
      <div
        v-for="(msg, i) in history"
        :key="i"
        class="flex"
        :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm"
          :class="msg.role === 'user'
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'"
        >
          <p class="whitespace-pre-wrap">{{ formatMessage(msg.content) }}</p>
          <p v-if="msg.savedCount" class="mt-1.5 text-xs opacity-70 font-medium">
            ✓ {{ t('chat.entries_saved', { count: msg.savedCount }) }}
          </p>
        </div>
      </div>

      <!-- Processing indicator -->
      <div v-if="loading" class="flex justify-start">
        <div class="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
          <span class="text-sm text-muted-foreground">{{ t('chat.processing') }}</span>
        </div>
      </div>

      <!-- Entry preview card -->
      <Card v-if="pendingPreview" class="mt-2">
        <CardHeader class="pb-2">
          <CardTitle class="text-sm">{{ t('employee.preview_title') }}</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div
            v-for="(row, i) in previewRows"
            :key="i"
            class="space-y-2 border-b pb-3 last:border-0 last:pb-0"
          >
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <Label class="text-xs">{{ t('entries.col_date') }}</Label>
                <Input v-model="row.date" type="date" class="h-8 text-sm" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">{{ t('employee.preview_hours_label') }}</Label>
                <Input v-model="row.hours" type="number" min="0" step="0.5" class="h-8 text-sm" />
              </div>
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('entries.col_project') }}</Label>
              <Input v-model="row.project" class="h-8 text-sm" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('employee.preview_notes_label') }}</Label>
              <Input v-model="row.notes" class="h-8 text-sm" />
            </div>
          </div>
        </CardContent>
        <CardFooter class="flex gap-2 pt-0">
          <Button size="sm" :disabled="loading" @click="handleConfirm">
            {{ t('employee.preview_confirm') }}
          </Button>
          <Button size="sm" variant="ghost" @click="handleCancel">
            {{ t('common.cancel') }}
          </Button>
        </CardFooter>
      </Card>

    </div>

    <!-- Input strip -->
    <div class="border-t pt-3 space-y-2">
      <Textarea
        v-model="inputText"
        :placeholder="t('chat.placeholder')"
        class="min-h-16 resize-none"
        :disabled="loading"
        @keydown="onKeydown"
      />
      <div class="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          :class="isListening ? 'text-destructive border-destructive' : ''"
          @click="startVoice"
        >
          {{ isListening ? `● ${t('chat.listening')}` : '🎤 Voice' }}
        </Button>
        <Button variant="ghost" size="sm" @click="reset">{{ t('common.cancel') }}</Button>
        <Button size="sm" :disabled="loading || !inputText.trim()" @click="submit">
          {{ t('chat.send_button') }}
        </Button>
      </div>
    </div>

    <!-- 3 most recent entries -->
    <div v-if="recentEntries.length" class="border-t pt-2 pb-1">
      <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {{ t('employee.recent_title') }}
      </p>
      <div
        v-for="entry in recentEntries"
        :key="entry.id"
        class="flex items-center gap-2 text-xs text-muted-foreground py-0.5"
      >
        <span class="w-16 shrink-0 tabular-nums">{{ formatDate(entry.entry_date) }}</span>
        <span class="flex-1 truncate">{{ entry.project ?? '–' }}</span>
        <span class="shrink-0 tabular-nums">
          {{ [entry.hours > 0 ? entry.hours + 'h' : '', entry.km > 0 ? entry.km + 'km' : ''].filter(Boolean).join(' · ') }}
        </span>
      </div>
    </div>

  </div>
</template>

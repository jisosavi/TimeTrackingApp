<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChat } from '@/composables/useChat'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { LlmEntry } from '@/types'

const { t } = useI18n({ useScope: 'global' })

const emit = defineEmits<{ entriesSaved: [] }>()

const { history, loading, send, reset, pendingPreview, confirmPreview } = useChat()
const auth = useAuthStore()
const inputText = ref('')
const chatEl = ref<HTMLElement | null>(null)
const isListening = ref(false)

// ── Preview state ─────────────────────────────────────────────────────────────
interface PreviewRow { date: string; hours: string; km: string; project: string; notes: string }
const previewRows = ref<PreviewRow[]>([])

function toInputDate(raw: string): string {
  if (!raw) return ''
  // YYYY-MM-DD already fine for <input type="date">
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // DD-MM-YYYY or DD.MM.YYYY → YYYY-MM-DD
  const parts = raw.split(/[-.]/)
  if (parts.length === 3 && parts[0]!.length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return raw
}

watch(
  () => pendingPreview.value,
  (preview) => {
    previewRows.value = preview
      ? preview.parsed.entries.map((e) => ({
          date: toInputDate(e.date ?? ''),
          hours: e.hours > 0 ? String(e.hours) : '',
          km: e.mileage > 0 ? String(e.mileage) : '',
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
      mileage: row.km !== '' ? parseFloat(row.km) : orig.mileage,
      project: row.project,
      notes: row.notes,
    }
  })
  await confirmPreview(merged)
  emit('entriesSaved')
}

function handleReset() {
  reset()
  inputText.value = ''
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

</script>

<template>
  <div class="flex flex-col h-[calc(100svh-13rem)]">

    <!-- Chat history -->
    <div ref="chatEl" class="flex-1 min-h-0 overflow-y-auto space-y-3 pb-4">

      <!-- Empty state: guidance text -->
      <div v-if="history.length === 0 && !pendingPreview" class="py-6 space-y-1 text-center">
        <p class="text-sm font-medium text-foreground">{{ t('chat.title') }}</p>
        <p class="text-xs text-muted-foreground max-w-sm mx-auto">{{ t('chat.guidance') }}</p>
      </div>

      <!-- Messages -->
      <div
        v-for="(msg, i) in history"
        :key="i"
        class="flex flex-col"
        :class="msg.role === 'user' ? 'items-end' : 'items-start'"
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
        <button
          v-if="pendingPreview && i === pendingPreview.messageIndex && msg.role === 'assistant'"
          class="mt-1 px-1 text-xs text-muted-foreground hover:text-destructive underline"
          @click="handleReset"
        >
          {{ t('common.cancel') }}
        </button>
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
            <div v-if="row.km !== ''" class="space-y-1">
              <Label class="text-xs">{{ t('employee.preview_km_label') }}</Label>
              <Input v-model="row.km" type="number" min="0" step="1" class="h-8 text-sm" />
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
        <CardFooter class="flex gap-2 border-t-0 bg-transparent pt-2">
          <Button size="sm" :disabled="loading" @click="handleConfirm">
            {{ t('employee.preview_confirm') }}
          </Button>
          <Button size="sm" variant="ghost" @click="handleReset">
            {{ t('common.cancel') }}
          </Button>
        </CardFooter>
      </Card>

    </div>

    <!-- Input strip -->
    <div class="pt-2 space-y-2">
      <Textarea
        v-model="inputText"
        :placeholder="t('chat.placeholder')"
        class="min-h-[8rem] resize-none"
        :disabled="loading"
        @keydown="onKeydown"
      />
      <div class="flex gap-2">
        <Button
          variant="outline"
          :class="isListening ? 'text-destructive border-destructive' : ''"
          @click="startVoice"
        >
          {{ isListening ? `● ${t('chat.listening')}` : `🎤 ${t('chat.voice_button')}` }}
        </Button>
        <Button variant="ghost" @click="handleReset">{{ t('common.cancel') }}</Button>
        <Button class="grow" :disabled="loading || !inputText.trim()" @click="submit">
          {{ t('chat.send_button') }}
        </Button>
      </div>
    </div>

    <!-- 3 most recent entries -->
  </div>
</template>

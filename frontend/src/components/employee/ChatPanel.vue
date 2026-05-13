<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChat } from '@/composables/useChat'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import PreviewCard from '@/components/employee/PreviewCard.vue'
import type { LlmParsedBlock } from '@/types'

const { t } = useI18n({ useScope: 'global' })

const emit = defineEmits<{ entriesSaved: [] }>()

const { history, loading, send, reset, pendingPreview, confirmPreview } = useChat()
const auth = useAuthStore()
const inputText = ref('')
const chatEl = ref<HTMLElement | null>(null)
const isListening = ref(false)

async function handleConfirm(block: LlmParsedBlock) {
  await confirmPreview(block)
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
          <p v-else-if="msg.savedMessage" class="mt-1.5 text-xs opacity-70 font-medium">
            {{ msg.savedMessage }}
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

      <!-- Entry / holiday / absence preview card -->
      <PreviewCard
        v-if="pendingPreview"
        :parsed="pendingPreview.parsed"
        :loading="loading"
        @confirm="handleConfirm"
        @cancel="handleReset"
      />

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

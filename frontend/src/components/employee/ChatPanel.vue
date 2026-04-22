<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChat } from '@/composables/useChat'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const { t } = useI18n({ useScope: 'global' })

const emit = defineEmits<{ entriesSaved: [] }>()

const { history, loading, send, reset } = useChat()
const auth = useAuthStore()
const inputText = ref('')
const chatEl = ref<HTMLElement | null>(null)
const isListening = ref(false)

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

  const last = history.value.at(-1)
  if (last?.savedCount) emit('entriesSaved')
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
  recognition.onresult = (e: any) => {
    inputText.value += e.results[0][0].transcript + ' '
  }
  recognition.onend = () => { isListening.value = false }
  recognition.onerror = () => { isListening.value = false }
  recognition.start()
}

function formatMessage(text: string) {
  // Hide raw JSON block — the saved confirmation replaces it visually
  return text.replace(/```json[\s\S]*?```/g, '').trim()
}
</script>

<template>
  <div class="flex flex-col h-[calc(100vh-12rem)]">

    <!-- Chat history -->
    <div ref="chatEl" class="flex-1 overflow-y-auto space-y-3 pb-4">
      <div v-if="history.length === 0" class="text-center text-sm text-muted-foreground py-12">
        <p class="font-medium">{{ t('chat.title') }}</p>
        <p class="mt-1">{{ t('chat.placeholder') }}</p>
      </div>

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

      <div v-if="loading" class="flex justify-start">
        <div class="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
          <span class="text-sm text-muted-foreground">{{ t('chat.processing') }}</span>
        </div>
      </div>
    </div>

    <!-- Input area -->
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

  </div>
</template>

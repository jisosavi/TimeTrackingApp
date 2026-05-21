<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { lastName, firstNames } from '@/utils/name'

export interface SupervisorProposal {
  id: number
  employee_id: number
  employee_name: string
  start_date: string
  end_date: string
  work_days: number
  label: string | null
  source: string | null
  status: string
  created_at: string
  conflict_warning: string | null
  decision_note: string | null
  employee_clarification: string | null
}

const props = defineProps<{
  proposal: SupervisorProposal
  selected: boolean
}>()

const emit = defineEmits<{
  'update:selected': [value: boolean]
  approve: [id: number]
  reject: [id: number, note: string]
  clarify: [id: number, note: string]
}>()

const { t } = useI18n({ useScope: 'global' })

type ActionState = 'idle' | 'rejecting' | 'clarifying'
const actionState = ref<ActionState>('idle')
const noteText = ref('')

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0]![0] ?? '').toUpperCase()
  return ((parts[0]![0] ?? '') + (parts[parts.length - 1]![0] ?? '')).toUpperCase()
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  if (start === end) return `${DAY[s.getDay()]!} ${s.getDate()} ${MON[s.getMonth()]!} ${s.getFullYear()}`
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${MON[e.getMonth()]!} ${e.getFullYear()}`
  }
  return `${s.getDate()} ${MON[s.getMonth()]!} – ${e.getDate()} ${MON[e.getMonth()]!} ${e.getFullYear()}`
}

function timeSince(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return t('supervisor.pending.submitted_today')
  return t('supervisor.pending.submitted_ago', { age: diff === 1 ? '1 day' : `${diff} days` })
}

function startAction(action: 'rejecting' | 'clarifying') {
  actionState.value = action
  noteText.value = ''
}

function cancelAction() {
  actionState.value = 'idle'
  noteText.value = ''
}

function submitReject() {
  if (!noteText.value.trim()) return
  emit('reject', props.proposal.id, noteText.value.trim())
  actionState.value = 'idle'
  noteText.value = ''
}

function submitClarify() {
  emit('clarify', props.proposal.id, noteText.value.trim())
  actionState.value = 'idle'
  noteText.value = ''
}
</script>

<template>
  <div class="rounded-xl border bg-card p-4 space-y-3">
    <!-- Top row: checkbox + avatar + name/label + submitted time -->
    <div class="flex items-start gap-3">
      <input
        type="checkbox"
        :checked="selected"
        class="h-4 w-4 mt-1 shrink-0 accent-indigo-600"
        @change="emit('update:selected', !selected)"
      />
      <!-- Avatar -->
      <div class="flex-shrink-0 w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 select-none">
        {{ initials(proposal.employee_name) }}
      </div>
      <!-- Name + label -->
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-foreground leading-snug">
          {{ lastName(proposal.employee_name) }}<template v-if="firstNames(proposal.employee_name)">, {{ firstNames(proposal.employee_name) }}</template>
          <span v-if="proposal.label" class="font-normal text-muted-foreground"> · {{ proposal.label }}</span>
        </p>
        <p class="text-sm text-foreground mt-0.5">{{ fmtRange(proposal.start_date, proposal.end_date) }}</p>
        <p class="text-xs text-muted-foreground mt-0.5">{{ t('supervisor.pending.work_days', { count: proposal.work_days }) }}</p>
      </div>
      <!-- Submitted time -->
      <span class="flex-shrink-0 text-xs text-muted-foreground">{{ timeSince(proposal.created_at) }}</span>
    </div>

    <!-- Employee clarification reply -->
    <div
      v-if="proposal.employee_clarification"
      class="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-300"
    >
      <span class="font-semibold">{{ t('pending.employee_reply_label') }}: </span>{{ proposal.employee_clarification }}
    </div>

    <!-- Conflict warning or "no conflicts" -->
    <p
      v-if="proposal.conflict_warning"
      class="text-xs font-medium text-amber-700 flex items-center gap-1"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="flex-shrink-0">
        <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M8 6v4M8 11.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      {{ proposal.conflict_warning }}
    </p>
    <p v-else class="text-xs font-medium text-green-700">{{ t('supervisor.pending.no_conflict') }}</p>

    <!-- Inline note form -->
    <div v-if="actionState !== 'idle'" class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {{ actionState === 'rejecting' ? t('supervisor.pending.reject_note_label') : t('supervisor.pending.clarify_note_label') }}
      </p>
      <textarea
        v-model="noteText"
        :placeholder="actionState === 'rejecting' ? t('supervisor.pending.reject_placeholder') : t('supervisor.pending.clarify_placeholder')"
        :required="actionState === 'rejecting'"
        rows="2"
        class="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
      />
      <div class="flex gap-2">
        <button
          v-if="actionState === 'rejecting'"
          type="button"
          :disabled="!noteText.trim()"
          class="flex-1 rounded-xl bg-red-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50 hover:bg-red-700 transition-colors"
          @click="submitReject"
        >
          {{ t('supervisor.pending.reject_submit') }}
        </button>
        <button
          v-else
          type="button"
          class="flex-1 rounded-xl bg-amber-500 text-white text-sm font-semibold py-2.5 hover:bg-amber-600 transition-colors"
          @click="submitClarify"
        >
          {{ t('supervisor.pending.clarify_submit') }}
        </button>
        <button
          type="button"
          class="rounded-xl border border-input px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
          @click="cancelAction"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>

    <!-- Action buttons (idle state) -->
    <div v-else class="flex gap-2">
      <button
        type="button"
        class="flex-1 rounded-xl border border-input py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        @click="startAction('clarifying')"
      >
        {{ t('supervisor.pending.clarify') }}
      </button>
      <button
        type="button"
        class="flex-1 rounded-xl border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        @click="startAction('rejecting')"
      >
        {{ t('supervisor.pending.reject') }}
      </button>
      <button
        type="button"
        class="flex-1 rounded-xl bg-green-600 text-white py-2.5 text-sm font-semibold hover:bg-green-700 active:bg-green-800 transition-colors"
        @click="emit('approve', proposal.id)"
      >
        {{ t('supervisor.pending.approve') }}
      </button>
    </div>
  </div>
</template>

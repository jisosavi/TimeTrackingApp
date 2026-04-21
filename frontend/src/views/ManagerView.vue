<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApproval, groupByEmployee } from '@/composables/useApproval'

const { t } = useI18n()
const { entries, loading, error, fetchEntries, reviewEntries } = useApproval()

onMounted(fetchEntries)

const needsReview = computed(() =>
  entries.value.filter(e => e.status === 'pending' || e.status === 'clarified'),
)
const approvedEntries = computed(() =>
  entries.value.filter(e => e.status === 'approved'),
)
const rejectedEntries = computed(() =>
  entries.value.filter(e => e.status === 'rejected'),
)
const grouped = computed(() => groupByEmployee(needsReview.value))
const rejectedGrouped = computed(() => groupByEmployee(rejectedEntries.value))

const rejectingId = ref<number | null>(null)
const rejectNote = ref('')

function startReject(id: number) {
  rejectingId.value = id
  rejectNote.value = ''
}

function cancelReject() {
  rejectingId.value = null
  rejectNote.value = ''
}

async function submitReject(id: number) {
  if (!rejectNote.value.trim()) return
  await reviewEntries([id], 'reject', rejectNote.value.trim())
  rejectingId.value = null
  rejectNote.value = ''
}

async function approveGroup(groupName: string) {
  const group = grouped.value.find(g => g.name === groupName)
  if (!group) return
  await reviewEntries(group.entries.map(e => e.id), 'approve')
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:   { label: 'Pending',   variant: 'secondary' },
  clarified: { label: 'Clarified', variant: 'outline' },
  approved:  { label: 'Approved',  variant: 'default' },
  rejected:  { label: 'Rejected',  variant: 'destructive' },
}

const statusKey: Record<string, string> = {
  pending:   'status.pending',
  approved:  'status.approved',
  rejected:  'status.rejected',
  clarified: 'status.clarified',
}

function getCfg(status: string) {
  const base = statusConfig[status] ?? { label: status, variant: 'outline' as const }
  return { ...base, label: statusKey[status] ? t(statusKey[status]!) : base.label }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Approvals</h2>
      <Button variant="ghost" size="sm" :disabled="loading" @click="fetchEntries">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </Button>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <Tabs default-value="review" class="w-full">
      <TabsList class="grid w-full grid-cols-3 mb-4">
        <TabsTrigger value="review" class="gap-1.5">
          Needs Review
          <Badge v-if="needsReview.length > 0" variant="destructive" class="h-4 min-w-4 px-1 text-[10px]">
            {{ needsReview.length }}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="approved">
          Approved ({{ approvedEntries.length }})
        </TabsTrigger>
        <TabsTrigger value="rejected" class="gap-1.5">
          Rejected
          <Badge v-if="rejectedEntries.length > 0" variant="outline" class="h-4 min-w-4 px-1 text-[10px]">
            {{ rejectedEntries.length }}
          </Badge>
        </TabsTrigger>
      </TabsList>

      <!-- Needs Review tab -->
      <TabsContent value="review">
        <div v-if="!loading && needsReview.length === 0" class="text-sm text-muted-foreground text-center py-8">
          {{ t('approval.no_team_entries') }}
        </div>

        <div v-for="group in grouped" :key="group.name" class="space-y-2 mb-6">
          <!-- Employee header -->
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">{{ group.name }}</h3>
            <Button variant="outline" size="sm" @click="approveGroup(group.name)">
              Approve all ({{ group.entries.length }})
            </Button>
          </div>

          <!-- Entry cards -->
          <div
            v-for="entry in group.entries"
            :key="entry.id"
            class="rounded-lg border p-4 space-y-2 bg-card"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5 flex-1">
                <p class="font-medium text-sm">{{ formatDate(entry.entry_date) }}</p>
                <p class="text-sm text-muted-foreground">
                  <span v-if="entry.start_time && entry.end_time">
                    {{ entry.start_time }} – {{ entry.end_time }} &middot; {{ entry.hours }}h
                  </span>
                  <span v-else-if="entry.hours">{{ entry.hours }}h</span>
                  <span v-if="entry.km > 0"> &middot; {{ entry.km }} km</span>
                </p>
                <p v-if="entry.project" class="text-xs text-muted-foreground">{{ entry.project }}</p>
                <p v-if="entry.comment" class="text-xs text-muted-foreground italic">{{ entry.comment }}</p>
              </div>
              <Badge :variant="getCfg(entry.status).variant" class="shrink-0">
                {{ getCfg(entry.status).label }}
              </Badge>
            </div>

            <!-- Employee clarification -->
            <div
              v-if="entry.status === 'clarified' && entry.employee_clarification"
              class="rounded-md bg-muted px-3 py-2 text-sm"
            >
              <span class="font-medium">{{ t('entries.clarification_label') }} </span>{{ entry.employee_clarification }}
            </div>

            <!-- Action buttons -->
            <div v-if="rejectingId !== entry.id" class="flex gap-2 pt-1">
              <Button size="sm" @click="reviewEntries([entry.id], 'approve')">Approve</Button>
              <Button size="sm" variant="outline" @click="startReject(entry.id)">Reject</Button>
            </div>

            <!-- Inline rejection form -->
            <div v-else class="space-y-2 pt-1">
              <Textarea
                v-model="rejectNote"
                placeholder="Reason for rejection…"
                class="text-sm min-h-14 resize-none"
                autofocus
              />
              <div class="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  :disabled="!rejectNote.trim()"
                  @click="submitReject(entry.id)"
                >
                  Reject
                </Button>
                <Button size="sm" variant="ghost" @click="cancelReject">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- Approved tab -->
      <TabsContent value="approved">
        <div v-if="!loading && approvedEntries.length === 0" class="text-sm text-muted-foreground text-center py-8">
          No approved entries yet.
        </div>

        <div class="space-y-2">
          <div
            v-for="entry in approvedEntries"
            :key="entry.id"
            class="rounded-lg border p-4 bg-card"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5">
                <p class="font-medium text-sm">
                  {{ entry.employee_name }} &middot; {{ formatDate(entry.entry_date) }}
                </p>
                <p class="text-sm text-muted-foreground">
                  <span v-if="entry.start_time && entry.end_time">
                    {{ entry.start_time }} – {{ entry.end_time }} &middot; {{ entry.hours }}h
                  </span>
                  <span v-else-if="entry.hours">{{ entry.hours }}h</span>
                  <span v-if="entry.km > 0"> &middot; {{ entry.km }} km</span>
                </p>
                <p v-if="entry.project" class="text-xs text-muted-foreground">{{ entry.project }}</p>
              </div>
              <Badge variant="default" class="shrink-0">Approved</Badge>
            </div>
          </div>
        </div>
      </TabsContent>
      <!-- Rejected tab -->
      <TabsContent value="rejected">
        <div v-if="!loading && rejectedEntries.length === 0" class="text-sm text-muted-foreground text-center py-8">
          No rejected entries.
        </div>

        <div v-for="group in rejectedGrouped" :key="group.name" class="space-y-2 mb-6">
          <h3 class="text-sm font-semibold">{{ group.name }}</h3>

          <div
            v-for="entry in group.entries"
            :key="entry.id"
            class="rounded-lg border p-4 space-y-2 bg-card"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5 flex-1">
                <p class="font-medium text-sm">{{ formatDate(entry.entry_date) }}</p>
                <p class="text-sm text-muted-foreground">
                  <span v-if="entry.start_time && entry.end_time">
                    {{ entry.start_time }} – {{ entry.end_time }} &middot; {{ entry.hours }}h
                  </span>
                  <span v-else-if="entry.hours">{{ entry.hours }}h</span>
                  <span v-if="entry.km > 0"> &middot; {{ entry.km }} km</span>
                </p>
                <p v-if="entry.project" class="text-xs text-muted-foreground">{{ entry.project }}</p>
                <p v-if="entry.comment" class="text-xs text-muted-foreground italic">{{ entry.comment }}</p>
              </div>
              <Badge variant="destructive" class="shrink-0">{{ getCfg(entry.status).label }}</Badge>
            </div>

            <div v-if="entry.rejection_note" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span class="font-medium">Note: </span>{{ entry.rejection_note }}
            </div>

            <div v-if="entry.employee_clarification" class="rounded-md bg-muted px-3 py-2 text-sm">
              <span class="font-medium">{{ t('entries.clarification_label') }} </span>{{ entry.employee_clarification }}
            </div>
          </div>
        </div>
      </TabsContent>

    </Tabs>
  </div>
</template>

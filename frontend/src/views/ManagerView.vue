<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useApproval, groupByEmployee } from '@/composables/useApproval'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import type { TeamMemberDetail } from '@/types'

const { t } = useI18n()
const { entries, loading, error, fetchEntries, reviewEntries } = useApproval()
const auth = useAuthStore()
const { apiFetch } = useApi()

const isSupervisor = computed(() => auth.user?.type === 'supervisor')

const teamMembers = ref<TeamMemberDetail[]>([])
const teamLoading = ref(false)
const teamError = ref<string | null>(null)
const teamLoaded = ref(false)
const teamSearch = ref('')

function teamLastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? parts[parts.length - 1]! : name
}

function teamLastFirst(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`
}

function teamFirstNames(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? parts.slice(0, -1).join(' ') : ''
}

const sortedFilteredTeamMembers = computed(() => {
  const q = teamSearch.value.trim().toLowerCase()
  return [...teamMembers.value]
    .filter(m => !q || teamLastFirst(m.name).toLowerCase().includes(q))
    .sort((a, b) => teamLastName(a.name).localeCompare(teamLastName(b.name), 'fi', { sensitivity: 'base' }))
})

async function loadTeam() {
  if (teamLoaded.value) return
  teamLoading.value = true
  teamError.value = null
  try {
    const data = await apiFetch<{ members: TeamMemberDetail[] }>('/api/my_team.php')
    teamMembers.value = data.members
    teamLoaded.value = true
  } catch (e) {
    teamError.value = e instanceof Error ? e.message : 'Failed to load team'
  } finally {
    teamLoading.value = false
  }
}

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
    <p class="text-xs text-muted-foreground -mb-2">
      {{ (auth.user?.companySlug ?? '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }}
    </p>
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Approvals</h2>
      <Button variant="ghost" size="sm" :disabled="loading" @click="fetchEntries">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </Button>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <Tabs default-value="review" class="w-full">
      <TabsList :class="['grid w-full mb-4', isSupervisor ? 'grid-cols-4' : 'grid-cols-3']">
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
        <TabsTrigger v-if="isSupervisor" value="team" @click="loadTeam">
          Your Team
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
                  <span v-if="entry.km > 0"><template v-if="entry.hours || (entry.start_time && entry.end_time)"> &middot; </template>{{ entry.km }} km</span>
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
                  <span v-if="entry.km > 0"><template v-if="entry.hours || (entry.start_time && entry.end_time)"> &middot; </template>{{ entry.km }} km</span>
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
                  <span v-if="entry.km > 0"><template v-if="entry.hours || (entry.start_time && entry.end_time)"> &middot; </template>{{ entry.km }} km</span>
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

      <!-- Your Team tab -->
      <TabsContent v-if="isSupervisor" value="team">
        <div v-if="teamLoading" class="text-sm text-muted-foreground text-center py-8">
          Loading…
        </div>
        <div v-else-if="teamError" class="text-sm text-destructive text-center py-8">
          {{ teamError }}
        </div>
        <div v-else>
          <div v-if="teamLoaded" class="space-y-2">
            <Input
              v-model="teamSearch"
              placeholder="Search by name…"
              class="h-8 text-sm"
            />
            <div
              v-for="member in sortedFilteredTeamMembers"
              :key="member.id"
              class="rounded-lg border px-3 py-2.5 bg-card"
            >
              <p class="font-medium text-sm"><span class="font-bold">{{ teamLastName(member.name) }}</span><template v-if="teamFirstNames(member.name)">, {{ teamFirstNames(member.name) }}</template></p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ [member.email, member.phone, member.birth_year ? 'b. ' + member.birth_year : null].filter(Boolean).join(' · ') || 'No contact details on file.' }}
              </p>
            </div>
            <p v-if="sortedFilteredTeamMembers.length === 0 && teamSearch" class="text-sm text-muted-foreground text-center py-4">
              No results.
            </p>
            <p v-else-if="teamMembers.length === 0" class="text-sm text-muted-foreground text-center py-8">
              No team members assigned yet.
            </p>
          </div>
        </div>
      </TabsContent>

    </Tabs>
  </div>
</template>

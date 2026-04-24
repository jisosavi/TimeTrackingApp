<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ListChecks, CheckCircle2, XCircle, Users, Search } from 'lucide-vue-next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useApproval } from '@/composables/useApproval'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { useRefresh } from '@/composables/useRefresh'
import type { ReviewEntry, TeamMemberDetail } from '@/types'

const { t } = useI18n({ useScope: 'global' })
const { entries, loading, error, fetchEntries, reviewEntries } = useApproval()
const auth = useAuthStore()
const { apiFetch } = useApi()
const route = useRoute()
const { refreshTick } = useRefresh()
watch(refreshTick, fetchEntries)

const isSupervisor = computed(() => auth.user?.type === 'supervisor')
const filterEmployeeId = computed(() => route.query.employee ? Number(route.query.employee) : null)

// ── Bulk selection ──────────────────────────────────────────────────────────
const activeTab = ref('review')
const selectedKeys = reactive(new Set<string>())
const bulkRejecting = ref(false)
const bulkRejectNote = ref('')
const bulkToast = ref<string | null>(null)
const bulkToastTimer = ref<ReturnType<typeof setTimeout> | null>(null)

function toggleSelected(key: string) {
  if (selectedKeys.has(key)) selectedKeys.delete(key)
  else selectedKeys.add(key)
}

function cancelBulkReject() {
  bulkRejecting.value = false
  bulkRejectNote.value = ''
}

function clearBulkToastTimer() {
  if (bulkToastTimer.value) {
    clearTimeout(bulkToastTimer.value)
    bulkToastTimer.value = null
  }
}

onUnmounted(clearBulkToastTimer)

async function doBulkAction(action: 'approve' | 'reject') {
  const keys = [...selectedKeys]
  const statusIds = keys.filter(k => k.endsWith('-status')).map(k => parseInt(k))
  const kmIds = keys.filter(k => k.endsWith('-km_status')).map(k => parseInt(k))
  const note = action === 'reject' ? bulkRejectNote.value.trim() : ''

  await Promise.all([
    statusIds.length ? reviewEntries(statusIds, action, note, 'status') : Promise.resolve(),
    kmIds.length ? reviewEntries(kmIds, action, note, 'km_status') : Promise.resolve(),
  ])

  const count = keys.length
  selectedKeys.clear()
  bulkRejecting.value = false
  bulkRejectNote.value = ''

  clearBulkToastTimer()
  bulkToast.value = action === 'approve'
    ? t('approval.bulk_approved_toast', { count })
    : t('approval.bulk_rejected_toast', { count })
  bulkToastTimer.value = setTimeout(() => { bulkToast.value = null }, 3000)
}

// ── Team ────────────────────────────────────────────────────────────────────
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

// ── VirtualCards ─────────────────────────────────────────────────────────────
interface VirtualCard {
  key: string
  id: number
  field: 'status' | 'km_status'
  entry: ReviewEntry
  cardStatus: string
  isDual: boolean
}

function makeVirtualCards(rawEntries: ReviewEntry[]): VirtualCard[] {
  const cards: VirtualCard[] = []
  for (const e of rawEntries) {
    const isDual = e.hours > 0 && e.km > 0
    if (isDual) {
      cards.push({ key: `${e.id}-status`, id: e.id, field: 'status', entry: e, cardStatus: e.status, isDual: true })
      cards.push({ key: `${e.id}-km_status`, id: e.id, field: 'km_status', entry: e, cardStatus: e.km_status ?? 'pending', isDual: true })
    } else {
      cards.push({ key: `${e.id}-status`, id: e.id, field: 'status', entry: e, cardStatus: e.status, isDual: false })
    }
  }
  return cards
}

const allCards = computed(() => makeVirtualCards(entries.value))
const needsReviewCards = computed(() =>
  allCards.value.filter(c => c.cardStatus === 'pending' || c.cardStatus === 'clarified'),
)
const approvedCards = computed(() => allCards.value.filter(c => c.cardStatus === 'approved'))
const rejectedCards = computed(() => allCards.value.filter(c => c.cardStatus === 'rejected'))

function cardSortFn(a: VirtualCard, b: VirtualCard): number {
  const nameCmp = teamLastName(a.entry.employee_name).localeCompare(
    teamLastName(b.entry.employee_name), 'fi', { sensitivity: 'base' },
  )
  return nameCmp !== 0 ? nameCmp : a.entry.entry_date.localeCompare(b.entry.entry_date)
}

const sortedNeedsReviewCards = computed(() => [...needsReviewCards.value].sort(cardSortFn))
const visibleNeedsReviewCards = computed(() =>
  filterEmployeeId.value
    ? sortedNeedsReviewCards.value.filter(c => c.entry.employee_id === filterEmployeeId.value)
    : sortedNeedsReviewCards.value,
)
const sortedApprovedCards = computed(() => [...approvedCards.value].sort(cardSortFn))

interface CardGroup { name: string; cards: VirtualCard[] }
const rejectedCardGroups = computed<CardGroup[]>(() => {
  const map = new Map<string, VirtualCard[]>()
  for (const c of rejectedCards.value) {
    const name = c.entry.employee_name
    const group = map.get(name)
    if (group) group.push(c)
    else map.set(name, [c])
  }
  return [...map.entries()]
    .map(([name, cards]) => ({ name, cards }))
    .sort((a, b) => teamLastName(a.name).localeCompare(teamLastName(b.name), 'fi', { sensitivity: 'base' }))
})

// ── Per-card reject ───────────────────────────────────────────────────────────
const rejectingId = ref<string | null>(null)
const rejectNote = ref('')

function startReject(key: string) {
  rejectingId.value = key
  rejectNote.value = ''
}

function cancelReject() {
  rejectingId.value = null
  rejectNote.value = ''
}

async function submitReject(key: string) {
  if (!rejectNote.value.trim()) return
  const dashIdx = key.indexOf('-')
  const id = parseInt(key.slice(0, dashIdx))
  const field = key.slice(dashIdx + 1) as 'status' | 'km_status'
  await reviewEntries([id], 'reject', rejectNote.value.trim(), field)
  rejectingId.value = null
  rejectNote.value = ''
}

// ── Card styling ──────────────────────────────────────────────────────────────
function cardBorderClass(card: VirtualCard): string {
  const isKm = card.field === 'km_status' || (!card.isDual && card.entry.km > 0)
  return isKm ? 'border-l-amber-500' : 'border-l-primary'
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
    <div class="space-y-0.5">
      <p v-if="auth.user?.companyName" class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {{ auth.user.companyName }}
      </p>
      <p class="text-sm text-muted-foreground">{{ auth.user?.name }}</p>
    </div>
    <h2 class="text-lg font-semibold">{{ t('approval.title') }}</h2>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <Tabs v-model="activeTab" class="w-full">
      <TabsList :class="['grid w-full mb-4 !h-auto', isSupervisor ? 'grid-cols-4' : 'grid-cols-3']">
        <TabsTrigger value="review" class="gap-1.5 text-sm py-2">
          {{ t('approval.tab_review') }}
          <Badge v-if="needsReviewCards.length > 0" variant="destructive" class="h-4 min-w-4 px-1 text-[10px]">
            {{ needsReviewCards.length }}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="approved" class="text-sm py-2">
          {{ t('approval.tab_approved', { count: approvedCards.length }) }}
        </TabsTrigger>
        <TabsTrigger value="rejected" class="gap-1.5 text-sm py-2">
          {{ t('approval.tab_rejected') }}
          <Badge v-if="rejectedCards.length > 0" variant="outline" class="h-4 min-w-4 px-1 text-[10px]">
            {{ rejectedCards.length }}
          </Badge>
        </TabsTrigger>
        <TabsTrigger v-if="isSupervisor" value="team" class="text-sm py-2" @click="loadTeam">
          {{ t('approval.tab_team') }}
        </TabsTrigger>
      </TabsList>

      <!-- Needs Review tab -->
      <TabsContent value="review" :class="selectedKeys.size > 0 ? 'pb-24' : ''">
        <!-- Employee filter banner -->
        <div v-if="filterEmployeeId" class="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5 mb-3">
          <span>{{ t('admin.filter_employee') }} <strong>{{ visibleNeedsReviewCards[0]?.entry.employee_name ?? filterEmployeeId }}</strong></span>
          <RouterLink :to="{ name: 'supervisor-home', params: { slug: auth.user?.companySlug } }" class="text-primary hover:underline">
            {{ t('admin.filter_clear') }}
          </RouterLink>
        </div>

        <EmptyState
          v-if="!loading && visibleNeedsReviewCards.length === 0"
          :title="t('empty.needs_review')"
          :body="t('empty.needs_review_body')"
        >
          <ListChecks class="size-10" />
        </EmptyState>

        <div class="space-y-2">
          <div
            v-for="card in visibleNeedsReviewCards"
            :key="card.key"
            class="rounded-lg border border-l-4 p-4 space-y-2 bg-card"
            :class="cardBorderClass(card)"
          >
            <div class="flex items-start gap-3">
              <input
                type="checkbox"
                :checked="selectedKeys.has(card.key)"
                class="h-4 w-4 mt-0.5 shrink-0"
                @change="toggleSelected(card.key)"
              />
              <div class="space-y-0.5 flex-1">
                <p class="font-semibold text-sm">
                  <span class="font-bold">{{ teamLastName(card.entry.employee_name) }}</span><template v-if="teamFirstNames(card.entry.employee_name)">, {{ teamFirstNames(card.entry.employee_name) }}</template>
                </p>
                <p class="font-medium text-sm">{{ formatDate(card.entry.entry_date) }}</p>
                <p class="text-sm text-muted-foreground">
                  <template v-if="!card.isDual">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ card.entry.hours }}h
                    </span>
                    <span v-else-if="card.entry.hours">{{ card.entry.hours }}h</span>
                    <span v-if="card.entry.km > 0"><template v-if="card.entry.hours || (card.entry.start_time && card.entry.end_time)"> &middot; </template>{{ card.entry.km }} km</span>
                  </template>
                  <template v-else-if="card.field === 'status'">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ card.entry.hours }}h
                    </span>
                    <span v-else>{{ card.entry.hours }}h</span>
                  </template>
                  <template v-else>
                    {{ card.entry.km }} km
                  </template>
                </p>
                <p v-if="card.entry.project" class="text-xs text-muted-foreground">{{ card.entry.project }}</p>
                <p v-if="card.entry.comment" class="text-xs text-muted-foreground italic">{{ card.entry.comment }}</p>
              </div>
              <!-- Show badge only for non-pending (clarified) cards -->
              <Badge v-if="card.cardStatus !== 'pending'" :variant="getCfg(card.cardStatus).variant" class="shrink-0">
                {{ getCfg(card.cardStatus).label }}
              </Badge>
            </div>

            <!-- Employee clarification (hours) -->
            <div
              v-if="card.cardStatus === 'clarified' && card.entry.employee_clarification"
              class="rounded-md bg-muted px-3 py-2 text-sm"
            >
              <span class="font-medium">{{ t('entries.clarification_label') }} </span>{{ card.entry.employee_clarification }}
            </div>
            <!-- Employee clarification (km) -->
            <div
              v-else-if="card.field === 'km_status' && card.entry.km_employee_clarification"
              class="rounded-md bg-muted px-3 py-2 text-sm"
            >
              <span class="font-medium">{{ t('entries.clarification_label') }} </span>{{ card.entry.km_employee_clarification }}
            </div>

            <!-- Action buttons -->
            <div v-if="rejectingId !== card.key" class="flex gap-2 pt-1">
              <Button size="sm" @click="reviewEntries([card.id], 'approve', '', card.field)">{{ t('approval.approve') }}</Button>
              <Button size="sm" variant="outline" @click="startReject(card.key)">{{ t('approval.reject') }}</Button>
            </div>

            <!-- Inline rejection form -->
            <div v-else class="space-y-2 pt-1">
              <Textarea
                v-model="rejectNote"
                :placeholder="t('approval.rejection_placeholder')"
                class="text-sm min-h-14 resize-none"
                autofocus
              />
              <div class="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  :disabled="!rejectNote.trim()"
                  @click="submitReject(card.key)"
                >
                  {{ t('approval.reject') }}
                </Button>
                <Button size="sm" variant="ghost" @click="cancelReject">{{ t('common.cancel') }}</Button>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- Approved tab -->
      <TabsContent value="approved">
        <EmptyState
          v-if="!loading && approvedCards.length === 0"
          :title="t('empty.approved')"
        >
          <CheckCircle2 class="size-10" />
        </EmptyState>

        <div class="space-y-2">
          <div
            v-for="card in sortedApprovedCards"
            :key="card.key"
            class="rounded-lg border border-l-4 p-4 bg-card"
            :class="cardBorderClass(card)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5">
                <p class="font-medium text-sm">{{ card.entry.employee_name }} &middot; {{ formatDate(card.entry.entry_date) }}</p>
                <p class="text-sm text-muted-foreground">
                  <template v-if="!card.isDual">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ card.entry.hours }}h
                    </span>
                    <span v-else-if="card.entry.hours">{{ card.entry.hours }}h</span>
                    <span v-if="card.entry.km > 0"><template v-if="card.entry.hours || (card.entry.start_time && card.entry.end_time)"> &middot; </template>{{ card.entry.km }} km</span>
                  </template>
                  <template v-else-if="card.field === 'status'">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ card.entry.hours }}h
                    </span>
                    <span v-else>{{ card.entry.hours }}h</span>
                  </template>
                  <template v-else>
                    {{ card.entry.km }} km
                  </template>
                </p>
                <p v-if="card.entry.project" class="text-xs text-muted-foreground">{{ card.entry.project }}</p>
              </div>
              <Badge variant="default" class="shrink-0">{{ t('status.approved') }}</Badge>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- Rejected tab -->
      <TabsContent value="rejected">
        <EmptyState
          v-if="!loading && rejectedCards.length === 0"
          :title="t('empty.rejected')"
        >
          <XCircle class="size-10" />
        </EmptyState>

        <div v-for="group in rejectedCardGroups" :key="group.name" class="space-y-2 mb-6">
          <h3 class="text-sm font-semibold">{{ group.name }}</h3>

          <div
            v-for="card in group.cards"
            :key="card.key"
            class="rounded-lg border border-l-4 p-4 space-y-2 bg-card"
            :class="cardBorderClass(card)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5 flex-1">
                <p class="font-medium text-sm">{{ formatDate(card.entry.entry_date) }}</p>
                <p class="text-sm text-muted-foreground">
                  <template v-if="!card.isDual">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ card.entry.hours }}h
                    </span>
                    <span v-else-if="card.entry.hours">{{ card.entry.hours }}h</span>
                    <span v-if="card.entry.km > 0"><template v-if="card.entry.hours || (card.entry.start_time && card.entry.end_time)"> &middot; </template>{{ card.entry.km }} km</span>
                  </template>
                  <template v-else-if="card.field === 'status'">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ card.entry.hours }}h
                    </span>
                    <span v-else>{{ card.entry.hours }}h</span>
                  </template>
                  <template v-else>
                    {{ card.entry.km }} km
                  </template>
                </p>
                <p v-if="card.entry.project" class="text-xs text-muted-foreground">{{ card.entry.project }}</p>
                <p v-if="card.entry.comment" class="text-xs text-muted-foreground italic">{{ card.entry.comment }}</p>
              </div>
              <Badge variant="destructive" class="shrink-0">{{ getCfg(card.cardStatus).label }}</Badge>
            </div>

            <div v-if="card.field === 'status' && card.entry.rejection_note" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span class="font-medium">{{ t('approval.rejection_note_label') }} </span>{{ card.entry.rejection_note }}
            </div>
            <div v-else-if="card.field === 'km_status' && card.entry.km_rejection_note" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span class="font-medium">{{ t('approval.rejection_note_label') }} </span>{{ card.entry.km_rejection_note }}
            </div>

            <div v-if="card.field === 'status' && card.entry.employee_clarification" class="rounded-md bg-muted px-3 py-2 text-sm">
              <span class="font-medium">{{ t('entries.clarification_label') }} </span>{{ card.entry.employee_clarification }}
            </div>
            <div v-else-if="card.field === 'km_status' && card.entry.km_employee_clarification" class="rounded-md bg-muted px-3 py-2 text-sm">
              <span class="font-medium">{{ t('entries.clarification_label') }} </span>{{ card.entry.km_employee_clarification }}
            </div>

            <!-- Approve/reject when employee has clarified this field -->
            <template v-if="(card.field === 'status' && card.entry.employee_clarification) || (card.field === 'km_status' && card.entry.km_employee_clarification)">
              <div v-if="rejectingId !== card.key" class="flex gap-2 pt-1">
                <Button size="sm" @click="reviewEntries([card.id], 'approve', '', card.field)">{{ t('approval.approve') }}</Button>
                <Button size="sm" variant="outline" @click="startReject(card.key)">{{ t('approval.reject') }}</Button>
              </div>
              <div v-else class="space-y-2 pt-1">
                <Textarea
                  v-model="rejectNote"
                  :placeholder="t('approval.rejection_placeholder')"
                  class="text-sm min-h-14 resize-none"
                  autofocus
                />
                <div class="flex gap-2">
                  <Button size="sm" variant="destructive" :disabled="!rejectNote.trim()" @click="submitReject(card.key)">
                    {{ t('approval.reject') }}
                  </Button>
                  <Button size="sm" variant="ghost" @click="cancelReject">{{ t('common.cancel') }}</Button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </TabsContent>

      <!-- Your Team tab -->
      <TabsContent v-if="isSupervisor" value="team">
        <div v-if="teamLoading" class="text-sm text-muted-foreground text-center py-8">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="teamError" class="text-sm text-destructive text-center py-8">
          {{ teamError }}
        </div>
        <div v-else>
          <div v-if="teamLoaded" class="space-y-2">
            <Input
              v-model="teamSearch"
              :placeholder="t('approval.search_placeholder')"
              class="h-8 text-sm"
            />
            <div
              v-for="member in sortedFilteredTeamMembers"
              :key="member.id"
              class="rounded-lg border px-3 py-2.5 bg-card"
            >
              <p class="font-medium text-sm"><span class="font-bold">{{ teamLastName(member.name) }}</span><template v-if="teamFirstNames(member.name)">, {{ teamFirstNames(member.name) }}</template></p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ [member.email, member.phone, member.birth_year ? 'b. ' + member.birth_year : null].filter(Boolean).join(' · ') || t('approval.no_contact_details') }}
              </p>
            </div>
            <EmptyState
              v-if="sortedFilteredTeamMembers.length === 0 && teamSearch"
              :title="t('empty.search')"
              :body="t('empty.search_body')"
            >
              <Search class="size-10" />
            </EmptyState>
            <EmptyState
              v-else-if="teamMembers.length === 0"
              :title="t('empty.team_members')"
              :body="t('empty.team_members_body')"
            >
              <Users class="size-10" />
            </EmptyState>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>

  <!-- Sticky bulk action footer -->
  <div
    v-if="selectedKeys.size > 0 && activeTab === 'review'"
    class="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur-sm z-20"
  >
    <div class="max-w-4xl mx-auto px-4 py-3">
      <div class="flex items-center gap-3">
        <span class="text-sm text-muted-foreground flex-1">{{ t('approval.bulk_selected', { count: selectedKeys.size }) }}</span>
        <Button size="sm" :disabled="loading" @click="doBulkAction('approve')">
          {{ t('approval.bulk_approve', { count: selectedKeys.size }) }}
        </Button>
        <Button size="sm" variant="outline" @click="bulkRejecting = !bulkRejecting">
          {{ t('approval.bulk_reject', { count: selectedKeys.size }) }}
        </Button>
      </div>
      <div v-if="bulkRejecting" class="mt-2 space-y-2">
        <Textarea
          v-model="bulkRejectNote"
          :placeholder="t('approval.bulk_rejection_placeholder')"
          class="text-sm min-h-14 resize-none"
          autofocus
        />
        <div class="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            :disabled="!bulkRejectNote.trim() || loading"
            @click="doBulkAction('reject')"
          >
            {{ t('approval.reject') }}
          </Button>
          <Button size="sm" variant="ghost" @click="cancelBulkReject">{{ t('common.cancel') }}</Button>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast notification -->
  <Transition
    enter-active-class="transition-all duration-300"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="bulkToast"
      class="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg whitespace-nowrap"
    >
      {{ bulkToast }}
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ListChecks, CheckCircle2, XCircle, Users, Search, Umbrella, User } from 'lucide-vue-next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import EmptyState from '@/components/ui/EmptyState.vue'
import BottomTabs from '@/components/ui/bottom-tabs/BottomTabs.vue'
import type { BottomTabItem } from '@/components/ui/bottom-tabs/BottomTabs.vue'
import { useApproval } from '@/composables/useApproval'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { useRefresh } from '@/composables/useRefresh'
import { useMobileShell } from '@/composables/useMobileShell'
import { fetchHolidays, COUNTRY_NAMES } from '@/composables/useHolidays'
import type { ReviewEntry, TeamMemberDetail } from '@/types'

const { t } = useI18n({ useScope: 'global' })
const { entries, loading, error, fetchEntries, reviewEntries, deleteEntry } = useApproval()
const auth = useAuthStore()
const { get, post, patch } = useApi()
const route = useRoute()
const router = useRouter()
const { refreshTick } = useRefresh()
const { isMobile } = useMobileShell()
watch(refreshTick, fetchEntries)

const isSupervisor = computed(() => auth.user?.type === 'supervisor')

// Mobile tab state
const MOBILE_TABS = ['approvals', 'team', 'me'] as const
type MobileTab = (typeof MOBILE_TABS)[number]
const mobRaw = route.query.mob as string | undefined
const mobileActiveTab = ref<MobileTab>(
  MOBILE_TABS.includes(mobRaw as MobileTab) ? (mobRaw as MobileTab) : 'approvals',
)
watch(() => route.query.mob, (val) => {
  const v = val as string
  if (MOBILE_TABS.includes(v as MobileTab)) mobileActiveTab.value = v as MobileTab
})

watch(mobileActiveTab, (tab) => {
  if (tab === 'team') loadTeam()
})
const filterEmployeeId = computed(() => route.query.employee ? Number(route.query.employee) : null)

// ── Type filter ──────────────────────────────────────────────────────────────
const typeFilter = ref<'all' | 'hours' | 'km'>('all')
const approvalSearch = ref('')

function isKmCard(card: VirtualCard): boolean {
  return card.field === 'km_status' || (!card.isDual && card.entry.km > 0)
}

function matchesTypeFilter(card: VirtualCard): boolean {
  if (typeFilter.value === 'all') return true
  if (typeFilter.value === 'hours') return !isKmCard(card)
  return isKmCard(card)
}

function matchesSearch(card: VirtualCard): boolean {
  const q = approvalSearch.value.trim().toLowerCase()
  return !q || card.entry.employee_name.toLowerCase().includes(q)
}

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
    const data = await get<{ members: TeamMemberDetail[] }>('/api/my_team')
    teamMembers.value = data.members
    teamLoaded.value = true
  } catch (e) {
    teamError.value = e instanceof Error ? e.message : 'Failed to load team'
  } finally {
    teamLoading.value = false
  }
}

// ── Holidays (admin only) ─────────────────────────────────────────────────────
const countryCode    = ref('FI')
const holidayMarking = ref(false)
const holidayResult  = ref<string | null>(null)
const holidayError   = ref<string | null>(null)

async function saveCountry(code: string) {
  countryCode.value   = code
  holidayResult.value = null
  await patch('/api/admin/country_setting', { country_code: code }).catch(() => {})
}

async function doMarkHolidays() {
  holidayMarking.value = true
  holidayResult.value  = null
  holidayError.value   = null
  try {
    const year     = new Date().getFullYear()
    const holidays = await fetchHolidays(countryCode.value, year)
    const data     = await post<{ success: boolean; updated: number }>(
      '/api/admin/mark_holidays',
      { holidays: holidays.map(h => ({ date: h.date, name: h.localName })) },
    )
    holidayResult.value = data.updated > 0
      ? t('admin.holidays.marked', { count: data.updated })
      : t('admin.holidays.none_found')
  } catch (e) {
    holidayError.value = e instanceof Error ? e.message : t('admin.holidays.error')
  } finally {
    holidayMarking.value = false
  }
}

onMounted(async () => {
  fetchEntries()
  if (!isSupervisor.value) {
    const data = await get<{ success: boolean; country_code: string }>('/api/admin/country_setting').catch(() => null)
    if (data?.success) countryCode.value = data.country_code ?? 'FI'
  }
})

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
const rejectedCards = computed(() => allCards.value.filter(c => c.cardStatus === 'rejected' || c.cardStatus === 'deleted'))

function dateSortDesc(a: VirtualCard, b: VirtualCard): number {
  const dateCmp = b.entry.entry_date.localeCompare(a.entry.entry_date)
  if (dateCmp !== 0) return dateCmp
  return teamLastName(a.entry.employee_name).localeCompare(teamLastName(b.entry.employee_name), 'fi', { sensitivity: 'base' })
}

function reviewSortFn(a: VirtualCard, b: VirtualCard): number {
  // clarified (employee replied) before pending, then newest date first, then last name
  const clarifiedA = a.cardStatus === 'clarified' ? 0 : 1
  const clarifiedB = b.cardStatus === 'clarified' ? 0 : 1
  if (clarifiedA !== clarifiedB) return clarifiedA - clarifiedB
  return dateSortDesc(a, b)
}

const sortedNeedsReviewCards = computed(() =>
  [...needsReviewCards.value].filter(c => matchesTypeFilter(c) && matchesSearch(c)).sort(reviewSortFn),
)
const visibleNeedsReviewCards = computed(() =>
  filterEmployeeId.value
    ? sortedNeedsReviewCards.value.filter(c => c.entry.employee_id === filterEmployeeId.value)
    : sortedNeedsReviewCards.value,
)
const sortedApprovedCards = computed(() =>
  [...approvedCards.value].filter(c => matchesTypeFilter(c) && matchesSearch(c)).sort(dateSortDesc),
)

const rejectedStatusFilter = ref<'all' | 'rejected' | 'deleted'>('all')
const rejectedNameSearch = ref('')

const rejectedCardsFlat = computed(() =>
  rejectedCards.value
    .filter(c => matchesTypeFilter(c))
    .filter(c => rejectedStatusFilter.value === 'all' || c.cardStatus === rejectedStatusFilter.value)
    .filter(c => !rejectedNameSearch.value || c.entry.employee_name.toLowerCase().includes(rejectedNameSearch.value.toLowerCase()))
    .sort(dateSortDesc),
)

// ── Per-card reject ───────────────────────────────────────────────────────────
const rejectingId = ref<string | null>(null)
const rejectNote = ref('')

function startReject(key: string) {
  deletingId.value = null
  deleteReason.value = ''
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

// ── Per-card delete ───────────────────────────────────────────────────────────
const deletingId = ref<string | null>(null)
const deleteReason = ref('')

function startDelete(key: string) {
  rejectingId.value = null
  rejectNote.value = ''
  deletingId.value = key
  deleteReason.value = ''
}

function cancelDelete() {
  deletingId.value = null
  deleteReason.value = ''
}

async function submitDelete(key: string) {
  if (!deleteReason.value.trim()) return
  const dashIdx = key.indexOf('-')
  const id = parseInt(key.slice(0, dashIdx))
  await deleteEntry(id, deleteReason.value.trim())
  deletingId.value = null
  deleteReason.value = ''
}

// ── Card styling ──────────────────────────────────────────────────────────────
function cardBorderClass(card: VirtualCard): string {
  const isKm = card.field === 'km_status' || (!card.isDual && card.entry.km > 0)
  return isKm ? 'border-l-amber-500' : 'border-l-primary'
}

function fmtNum(n: number | string): string {
  const v = Number(n)
  if (isNaN(v)) return String(n)
  return parseFloat(v.toFixed(2)).toString()
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}


const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:   { label: 'Pending',   variant: 'secondary' },
  clarified: { label: 'Clarified', variant: 'outline' },
  approved:  { label: 'Approved',  variant: 'default' },
  rejected:  { label: 'Rejected',  variant: 'destructive' },
  deleted:   { label: 'Deleted',   variant: 'outline' },
}

const statusKey: Record<string, string> = {
  pending:   'status.pending',
  approved:  'status.approved',
  rejected:  'status.rejected',
  clarified: 'status.clarified',
  deleted:   'status.deleted',
}

function getCfg(status: string) {
  const base = statusConfig[status] ?? { label: status, variant: 'outline' as const }
  return { ...base, label: statusKey[status] ? t(statusKey[status]!) : base.label }
}

const slug = computed(() => auth.user?.companySlug ?? '')

const timeOffRoute = computed(() => ({
  name: 'supervisor-time-off' as const,
  params: { slug: slug.value },
}))

const bottomTabItems = computed<BottomTabItem[]>(() => [
  { id: 'team', label: t('nav.team'), icon: Users },
  { id: 'approvals', label: t('nav.approvals'), icon: ListChecks, badge: needsReviewCards.value.length },
  { id: 'timeoff', label: t('timeOff.nav_label'), icon: Umbrella, to: timeOffRoute.value },
  { id: 'me', label: t('nav.me'), icon: User },
])

function setMobileTab(id: string) {
  if (id === 'timeoff') return
  if (MOBILE_TABS.includes(id as MobileTab)) {
    mobileActiveTab.value = id as MobileTab
    router.replace({ query: { mob: id } })
  }
}
</script>

<template>
  <!-- ── Mobile layout ──────────────────────────────────────────────────────── -->
  <template v-if="isMobile">
    <!-- Approvals tab -->
    <div v-if="mobileActiveTab === 'approvals'" class="space-y-3 pb-28">
      <div class="space-y-0.5">
        <p class="text-lg font-bold text-foreground">{{ t('nav.approvals') }}</p>
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      </div>
      <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">{{ t('common.loading') }}</div>
      <EmptyState
        v-else-if="visibleNeedsReviewCards.length === 0"
        :title="t('empty.needs_review')"
        :body="t('empty.needs_review_body')"
      >
        <ListChecks class="size-10" />
      </EmptyState>
      <div v-else class="space-y-3">
        <div
          v-for="card in visibleNeedsReviewCards"
          :key="card.key"
          class="rounded-xl border bg-card p-4 space-y-3"
        >
          <div class="flex items-start gap-2">
            <div class="flex-1 min-w-0">
              <p class="text-sm text-foreground tabular-nums">{{ formatDate(card.entry.entry_date) }}</p>
              <p class="font-bold text-sm text-foreground">{{ teamLastName(card.entry.employee_name) }}<template v-if="teamFirstNames(card.entry.employee_name)">, {{ teamFirstNames(card.entry.employee_name) }}</template></p>
              <p class="text-xs text-muted-foreground">
                <template v-if="!card.isDual">
                  <span v-if="card.entry.start_time && card.entry.end_time">{{ card.entry.start_time }} – {{ card.entry.end_time }} · {{ fmtNum(card.entry.hours) }}h</span>
                  <span v-else-if="Number(card.entry.hours) > 0">{{ fmtNum(card.entry.hours) }}h</span>
                  <span v-if="card.entry.km > 0"><template v-if="Number(card.entry.hours) > 0 || (card.entry.start_time && card.entry.end_time)"> · </template>{{ fmtNum(card.entry.km) }} km</span>
                </template>
                <template v-else-if="card.field === 'status'">
                  <span v-if="card.entry.start_time && card.entry.end_time">{{ card.entry.start_time }} – {{ card.entry.end_time }} · {{ fmtNum(card.entry.hours) }}h</span>
                  <span v-else>{{ fmtNum(card.entry.hours) }}h</span>
                </template>
                <template v-else>{{ fmtNum(card.entry.km) }} km</template>
              </p>
              <p v-if="card.entry.comment" class="text-xs text-muted-foreground italic mt-0.5">{{ card.entry.comment }}</p>
            </div>
          </div>
          <div v-if="rejectingId !== card.key" class="flex gap-2">
            <button type="button" class="flex-1 rounded-xl border border-input py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors" @click="startReject(card.key)">{{ t('approval.reject') }}</button>
            <button type="button" class="flex-1 rounded-xl bg-indigo-600 text-white py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors" @click="reviewEntries([card.id], 'approve', '', card.field)">{{ t('approval.approve') }}</button>
          </div>
          <div v-else class="space-y-2">
            <textarea v-model="rejectNote" :placeholder="t('approval.rejection_placeholder')" rows="2" class="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <div class="flex gap-2">
              <button type="button" :disabled="!rejectNote.trim()" class="flex-1 rounded-xl bg-red-600 text-white py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-red-700 transition-colors" @click="submitReject(card.key)">{{ t('approval.reject') }}</button>
              <button type="button" class="rounded-xl border border-input px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors" @click="cancelReject">{{ t('common.cancel') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Team tab -->
    <div v-else-if="mobileActiveTab === 'team'" class="space-y-3 pb-28">
      <p class="text-lg font-bold text-foreground">{{ t('approval.tab_team') }}</p>
      <div v-if="teamLoading" class="py-8 text-center text-sm text-muted-foreground">{{ t('common.loading') }}</div>
      <div v-else class="space-y-2">
        <Input v-model="teamSearch" :placeholder="t('approval.search_placeholder')" class="h-11 text-sm" />
        <div v-for="member in sortedFilteredTeamMembers" :key="member.id" class="rounded-xl border px-3 py-3 bg-card">
          <p class="font-bold text-sm"><span>{{ teamLastName(member.name) }}</span><template v-if="teamFirstNames(member.name)">, {{ teamFirstNames(member.name) }}</template></p>
          <p class="text-xs text-muted-foreground mt-0.5">{{ [member.email, member.phone].filter(Boolean).join(' · ') || t('approval.no_contact_details') }}</p>
        </div>
        <EmptyState v-if="sortedFilteredTeamMembers.length === 0 && teamSearch" :title="t('empty.search')" :body="t('empty.search_body')"><Search class="size-10" /></EmptyState>
        <EmptyState v-else-if="teamMembers.length === 0" :title="t('empty.team_members')" :body="t('empty.team_members_body')"><Users class="size-10" /></EmptyState>
      </div>
    </div>

    <!-- Me tab -->
    <div v-else class="space-y-3 pb-28">
      <p class="text-lg font-bold text-foreground">{{ t('nav.me') }}</p>
      <div class="rounded-xl border bg-card p-4 space-y-1">
        <p class="font-semibold text-sm text-foreground">{{ auth.user?.name }}</p>
        <p v-if="auth.user?.companyName" class="text-xs text-muted-foreground">{{ auth.user.companyName }}</p>
      </div>
    </div>

    <!-- BottomTabs -->
    <BottomTabs :items="bottomTabItems" :active="mobileActiveTab" @change="setMobileTab" />
  </template>

  <!-- ── Desktop layout ─────────────────────────────────────────────────────── -->
  <div v-else class="space-y-4">
    <div class="space-y-0.5">
      <p v-if="auth.user?.companyName" class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {{ auth.user.companyName }}
      </p>
      <p class="text-sm text-muted-foreground">{{ auth.user?.name }}</p>
    </div>
    <h2 class="text-lg font-semibold">{{ t('approval.title') }}</h2>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <!-- Holidays (admin only) -->
    <div v-if="!isSupervisor" class="rounded border px-4 py-3 bg-card space-y-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('admin.holidays.section_title') }}</p>
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <Label class="text-xs shrink-0">{{ t('admin.holidays.country_label') }}</Label>
          <select
            :value="countryCode"
            class="h-8 rounded-md border border-input bg-background px-2 text-sm"
            @change="saveCountry(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="(name, code) in COUNTRY_NAMES" :key="code" :value="code">{{ name }}</option>
          </select>
        </div>
        <Button size="sm" :disabled="holidayMarking" @click="doMarkHolidays">
          {{ holidayMarking ? t('admin.holidays.marking') : t('admin.holidays.mark_btn') }}
        </Button>
      </div>
      <p v-if="holidayResult" class="text-xs text-green-700 dark:text-green-400">{{ holidayResult }}</p>
      <p v-if="holidayError" class="text-xs text-destructive">{{ holidayError }}</p>
    </div>

    <div class="flex items-center gap-3 flex-wrap">
      <ToggleGroup v-model="typeFilter" type="single" variant="outline" :spacing="1">
        <ToggleGroupItem value="all" class="h-11 px-5 text-sm font-medium">{{ t('approval.filter_all') }}</ToggleGroupItem>
        <ToggleGroupItem value="hours" class="h-11 px-5 text-sm font-medium">{{ t('approval.filter_hours') }}</ToggleGroupItem>
        <ToggleGroupItem value="km" class="h-11 px-5 text-sm font-medium">{{ t('approval.filter_km') }}</ToggleGroupItem>
      </ToggleGroup>
      <Input
        v-model="approvalSearch"
        :placeholder="t('approval.search_placeholder')"
        class="h-11 text-sm flex-1 min-w-[180px]"
      />
    </div>

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
          :title="approvalSearch ? t('empty.search') : t('empty.needs_review')"
          :body="approvalSearch ? t('empty.search_body') : t('empty.needs_review_body')"
        >
          <Search v-if="approvalSearch" class="size-10" />
          <ListChecks v-else class="size-10" />
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
                <p class="text-sm flex items-baseline gap-2">
                  <span class="shrink-0 tabular-nums w-24 font-medium">{{ formatDate(card.entry.entry_date) }}</span>
                  <span class="font-semibold"><span class="font-bold">{{ teamLastName(card.entry.employee_name) }}</span><template v-if="teamFirstNames(card.entry.employee_name)">, {{ teamFirstNames(card.entry.employee_name) }}</template></span>
                </p>
                <p class="text-sm text-muted-foreground">
                  <template v-if="!card.isDual">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ fmtNum(card.entry.hours) }}h
                    </span>
                    <span v-else-if="Number(card.entry.hours) > 0">{{ fmtNum(card.entry.hours) }}h</span>
                    <span v-if="card.entry.km > 0"><template v-if="Number(card.entry.hours) > 0 || (card.entry.start_time && card.entry.end_time)"> &middot; </template>{{ fmtNum(card.entry.km) }} km</span>
                  </template>
                  <template v-else-if="card.field === 'status'">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ fmtNum(card.entry.hours) }}h
                    </span>
                    <span v-else>{{ fmtNum(card.entry.hours) }}h</span>
                  </template>
                  <template v-else>
                    {{ fmtNum(card.entry.km) }} km
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

            <!-- Reviewer info (who requested clarification and when) -->
            <div
              v-if="card.field === 'status' && card.entry.reviewed_by_name && card.entry.reviewed_at"
              class="text-xs text-muted-foreground"
            >
              {{ card.entry.reviewed_by_name }} · {{ formatDateTime(card.entry.reviewed_at) }}
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
            <div v-if="rejectingId !== card.key && deletingId !== card.key" class="flex gap-2 pt-1">
              <Button size="sm" @click="reviewEntries([card.id], 'approve', '', card.field)">{{ t('approval.approve') }}</Button>
              <Button size="sm" variant="outline" @click="startReject(card.key)">{{ t('approval.reject') }}</Button>
              <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" @click="startDelete(card.key)">{{ t('common.delete') }}</Button>
            </div>

            <!-- Inline rejection form -->
            <div v-else-if="rejectingId === card.key" class="space-y-2 pt-1">
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

            <!-- Inline delete reason form -->
            <div v-else class="space-y-2 pt-1">
              <Textarea
                v-model="deleteReason"
                :placeholder="t('entries.delete_reason_placeholder')"
                class="text-sm min-h-14 resize-none"
                autofocus
              />
              <div class="flex gap-2">
                <Button size="sm" variant="destructive" :disabled="!deleteReason.trim()" @click="submitDelete(card.key)">{{ t('common.delete') }}</Button>
                <Button size="sm" variant="ghost" @click="cancelDelete">{{ t('common.cancel') }}</Button>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- Approved tab -->
      <TabsContent value="approved">
        <EmptyState
          v-if="!loading && sortedApprovedCards.length === 0"
          :title="approvalSearch ? t('empty.search') : t('empty.approved')"
          :body="approvalSearch ? t('empty.search_body') : undefined"
        >
          <Search v-if="approvalSearch" class="size-10" />
          <CheckCircle2 v-else class="size-10" />
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
                <p class="font-medium text-sm flex items-baseline gap-2">
                  <span class="shrink-0 tabular-nums w-24">{{ formatDate(card.entry.entry_date) }}</span>
                  <span><span class="font-bold">{{ teamLastName(card.entry.employee_name) }}</span><template v-if="teamFirstNames(card.entry.employee_name)">, {{ teamFirstNames(card.entry.employee_name) }}</template></span>
                </p>
                <p class="text-sm text-muted-foreground">
                  <template v-if="!card.isDual">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ fmtNum(card.entry.hours) }}h
                    </span>
                    <span v-else-if="Number(card.entry.hours) > 0">{{ fmtNum(card.entry.hours) }}h</span>
                    <span v-if="card.entry.km > 0"><template v-if="Number(card.entry.hours) > 0 || (card.entry.start_time && card.entry.end_time)"> &middot; </template>{{ fmtNum(card.entry.km) }} km</span>
                  </template>
                  <template v-else-if="card.field === 'status'">
                    <span v-if="card.entry.start_time && card.entry.end_time">
                      {{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ fmtNum(card.entry.hours) }}h
                    </span>
                    <span v-else>{{ fmtNum(card.entry.hours) }}h</span>
                  </template>
                  <template v-else>
                    {{ fmtNum(card.entry.km) }} km
                  </template>
                </p>
                <p v-if="card.entry.project" class="text-xs text-muted-foreground">{{ card.entry.project }}</p>
                <p v-if="card.entry.comment" class="text-xs text-muted-foreground italic">{{ card.entry.comment }}</p>
              </div>
              <Badge variant="default" class="shrink-0">{{ t('status.approved') }}</Badge>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- Rejected & Deleted tab -->
      <TabsContent value="rejected">
        <!-- Filter pills + name search -->
        <div v-if="!loading && rejectedCards.length > 0" class="flex items-center gap-2 mb-4 flex-wrap">
          <div class="flex gap-1">
            <button
              type="button"
              :class="['px-3 py-1 rounded-full text-xs font-medium transition-colors', rejectedStatusFilter === 'all' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground']"
              @click="rejectedStatusFilter = 'all'"
            >{{ t('approval.filter_all') }}</button>
            <button
              type="button"
              :class="['px-3 py-1 rounded-full text-xs font-medium transition-colors', rejectedStatusFilter === 'rejected' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground hover:text-foreground']"
              @click="rejectedStatusFilter = 'rejected'"
            >{{ t('status.rejected') }}</button>
            <button
              type="button"
              :class="['px-3 py-1 rounded-full text-xs font-medium transition-colors', rejectedStatusFilter === 'deleted' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground']"
              @click="rejectedStatusFilter = 'deleted'"
            >{{ t('status.deleted') }}</button>
          </div>
          <input
            v-model="rejectedNameSearch"
            type="search"
            :placeholder="t('approval.search_placeholder')"
            class="flex-1 min-w-32 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <EmptyState
          v-if="!loading && rejectedCardsFlat.length === 0"
          :title="(rejectedNameSearch || rejectedStatusFilter !== 'all') ? t('empty.search') : t('empty.rejected')"
          :body="(rejectedNameSearch || rejectedStatusFilter !== 'all') ? t('empty.search_body') : undefined"
        >
          <Search v-if="rejectedNameSearch || rejectedStatusFilter !== 'all'" class="size-10" />
          <XCircle v-else class="size-10" />
        </EmptyState>

        <div class="space-y-2">
          <div
            v-for="card in rejectedCardsFlat"
            :key="card.key"
            class="rounded-lg border border-l-4 p-4 space-y-2 bg-card"
            :class="card.cardStatus === 'deleted' ? 'border-l-muted-foreground/50' : cardBorderClass(card)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5 flex-1">
                <p class="text-sm flex items-baseline gap-2">
                  <span class="shrink-0 tabular-nums w-24 font-medium">{{ formatDate(card.entry.entry_date) }}</span>
                  <span><span class="font-bold">{{ teamLastName(card.entry.employee_name) }}</span><template v-if="teamFirstNames(card.entry.employee_name)">, {{ teamFirstNames(card.entry.employee_name) }}</template></span>
                </p>
                <p class="text-sm text-muted-foreground">
                  <template v-if="!card.isDual">
                    <span v-if="card.entry.start_time && card.entry.end_time">{{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ fmtNum(card.entry.hours) }}h</span>
                    <span v-else-if="Number(card.entry.hours) > 0">{{ fmtNum(card.entry.hours) }}h</span>
                    <span v-if="card.entry.km > 0"><template v-if="Number(card.entry.hours) > 0 || (card.entry.start_time && card.entry.end_time)"> &middot; </template>{{ fmtNum(card.entry.km) }} km</span>
                  </template>
                  <template v-else-if="card.field === 'status'">
                    <span v-if="card.entry.start_time && card.entry.end_time">{{ card.entry.start_time }} – {{ card.entry.end_time }} &middot; {{ fmtNum(card.entry.hours) }}h</span>
                    <span v-else>{{ fmtNum(card.entry.hours) }}h</span>
                  </template>
                  <template v-else>{{ fmtNum(card.entry.km) }} km</template>
                </p>
                <p v-if="card.entry.project" class="text-xs text-muted-foreground">{{ card.entry.project }}</p>
                <p v-if="card.entry.comment" class="text-xs text-muted-foreground italic">{{ card.entry.comment }}</p>
              </div>
              <Badge :variant="getCfg(card.cardStatus).variant" class="shrink-0">{{ getCfg(card.cardStatus).label }}</Badge>
            </div>

            <!-- Deletion reason -->
            <div v-if="card.cardStatus === 'deleted' && card.entry.deletion_reason" class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              <span class="font-medium">{{ t('entries.deletion_reason_label') }} </span>{{ card.entry.deletion_reason }}
            </div>

            <!-- Rejection note + reviewer (rejected only) -->
            <template v-if="card.cardStatus !== 'deleted'">
              <div v-if="card.field === 'status' && card.entry.rejection_note" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span class="font-medium">{{ t('approval.rejection_note_label') }} </span>{{ card.entry.rejection_note }}
              </div>
              <div v-else-if="card.field === 'km_status' && card.entry.km_rejection_note" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <span class="font-medium">{{ t('approval.rejection_note_label') }} </span>{{ card.entry.km_rejection_note }}
              </div>
              <div v-if="card.field === 'status' && card.entry.reviewed_by_name && card.entry.reviewed_at" class="text-xs text-muted-foreground">
                {{ card.entry.reviewed_by_name }} · {{ formatDateTime(card.entry.reviewed_at) }}
              </div>
              <div v-if="card.field === 'status' && card.entry.employee_clarification" class="rounded-md bg-muted px-3 py-2 text-sm">
                <span class="font-medium">{{ t('entries.clarification_label') }} </span>{{ card.entry.employee_clarification }}
              </div>
              <div v-else-if="card.field === 'km_status' && card.entry.km_employee_clarification" class="rounded-md bg-muted px-3 py-2 text-sm">
                <span class="font-medium">{{ t('entries.clarification_label') }} </span>{{ card.entry.km_employee_clarification }}
              </div>

              <!-- Approve/reject when employee has clarified -->
              <template v-if="(card.field === 'status' && card.entry.employee_clarification) || (card.field === 'km_status' && card.entry.km_employee_clarification)">
                <div v-if="rejectingId !== card.key" class="flex gap-2 pt-1">
                  <Button size="sm" @click="reviewEntries([card.id], 'approve', '', card.field)">{{ t('approval.approve') }}</Button>
                  <Button size="sm" variant="outline" @click="startReject(card.key)">{{ t('approval.reject') }}</Button>
                </div>
                <div v-else class="space-y-2 pt-1">
                  <Textarea v-model="rejectNote" :placeholder="t('approval.rejection_placeholder')" class="text-sm min-h-14 resize-none" autofocus />
                  <div class="flex gap-2">
                    <Button size="sm" variant="destructive" :disabled="!rejectNote.trim()" @click="submitReject(card.key)">{{ t('approval.reject') }}</Button>
                    <Button size="sm" variant="ghost" @click="cancelReject">{{ t('common.cancel') }}</Button>
                  </div>
                </div>
              </template>

              <!-- Delete button / inline reason form -->
              <div v-if="deletingId !== card.key" class="flex justify-end pt-1">
                <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="startDelete(card.key)">{{ t('common.delete') }}</Button>
              </div>
              <div v-else class="space-y-2 pt-1">
                <Textarea v-model="deleteReason" :placeholder="t('entries.delete_reason_placeholder')" class="text-sm min-h-14 resize-none" autofocus />
                <div class="flex gap-2">
                  <Button size="sm" variant="destructive" :disabled="!deleteReason.trim()" @click="submitDelete(card.key)">{{ t('common.delete') }}</Button>
                  <Button size="sm" variant="ghost" @click="cancelDelete">{{ t('common.cancel') }}</Button>
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

  <!-- Sticky bulk action footer (desktop only) -->
  <div
    v-if="!isMobile && selectedKeys.size > 0 && activeTab === 'review'"
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

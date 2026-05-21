<script setup lang="ts">
import { ref, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import { Search, ChevronDown, ChevronRight } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useApi } from '@/composables/useApi'

interface AuditRow {
  id: number
  company_id: number | null
  ts: string
  event: string
  actor_type: string
  actor_id: number | null
  actor_ip: string | null
  resource: string | null
  resource_id: string | null
  before_json: string | null
  after_json: string | null
  outcome: string
  meta_json: string | null
}

interface Company { id: number; name: string; slug: string }

const { get } = useApi()

const LIMIT = 100

const searchRaw      = ref('')
const search         = refDebounced(searchRaw, 300)
const companyFilter  = ref('all')
const eventFilter    = ref('')
const outcomeFilter  = ref('')
const actorFilter    = ref('')
const page           = ref(0)

const rows      = ref<AuditRow[]>([])
const total     = ref(0)
const companies = ref<Company[]>([])
const loading   = ref(false)
const expanded  = ref<Set<number>>(new Set())

const EVENT_CATEGORIES = [
  { value: '',                label: 'All events' },
  { value: 'auth',            label: 'auth' },
  { value: 'time_entry',      label: 'time_entry' },
  { value: 'employee',        label: 'employee' },
  { value: 'supervisor',      label: 'supervisor' },
  { value: 'payroll',         label: 'payroll' },
  { value: 'holiday_proposal',label: 'holiday_proposal' },
  { value: 'absence',         label: 'absence' },
  { value: 'salaxy',          label: 'salaxy' },
  { value: 'system',          label: 'system' },
]

const ACTOR_TYPES = [
  { value: '', label: 'All actors' },
  { value: 'employee',   label: 'employee' },
  { value: 'supervisor', label: 'supervisor' },
  { value: 'admin',      label: 'admin' },
  { value: 'superadmin', label: 'superadmin' },
  { value: 'system',     label: 'system' },
]

watch([search, companyFilter, eventFilter, outcomeFilter, actorFilter], () => { page.value = 0 })

watch([search, companyFilter, eventFilter, outcomeFilter, actorFilter, page], fetchLog, { immediate: true })

async function fetchLog() {
  loading.value = true
  try {
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(page.value * LIMIT) })
    if (companyFilter.value !== 'all') p.set('company', companyFilter.value)
    if (eventFilter.value)             p.set('event', eventFilter.value)
    if (outcomeFilter.value)           p.set('outcome', outcomeFilter.value)
    if (actorFilter.value)             p.set('actor_type', actorFilter.value)
    if (search.value.trim())           p.set('search', search.value.trim())

    const data = await get<{ rows: AuditRow[]; total: number; companies: Company[] }>(
      `/api/super_admin/audit_log?${p}`,
    )
    rows.value      = data.rows
    total.value     = data.total
    companies.value = data.companies
  } finally {
    loading.value = false
  }
}

function toggleExpand(id: number) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
}

function fmtTs(ts: string): string {
  return new Date(ts).toLocaleString('fi-FI', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtJson(raw: string | null): string {
  if (!raw) return ''
  try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
}

function companyName(id: number | null): string {
  if (id === null) return 'master'
  return companies.value.find(c => c.id === id)?.name ?? String(id)
}

function eventColor(event: string): string {
  if (event.startsWith('auth'))             return 'text-blue-600'
  if (event.startsWith('time_entry'))       return 'text-violet-600'
  if (event.startsWith('payroll'))          return 'text-amber-600'
  if (event.startsWith('holiday_proposal')) return 'text-teal-600'
  if (event.startsWith('absence'))          return 'text-teal-600'
  if (event.startsWith('salaxy'))           return 'text-orange-600'
  if (event.startsWith('system'))           return 'text-red-600'
  return 'text-foreground'
}

const totalPages = ref(0)
watch(total, v => { totalPages.value = Math.max(1, Math.ceil(v / LIMIT)) })
</script>

<template>
  <div class="space-y-4">

    <!-- Testing banner -->
    <div class="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
      <span class="shrink-0">⚠</span>
      Testing environment only — audit log is visible to super-admins only and is not exposed to company admins.
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-end gap-3">

      <!-- Search -->
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input v-model="searchRaw" placeholder="Search event, IP, resource…" class="pl-8 h-9 w-64 text-sm" />
      </div>

      <!-- Company -->
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-muted-foreground">Company</span>
        <select
          v-model="companyFilter"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option value="all">All companies</option>
          <option value="master">master (superadmin)</option>
          <option v-for="c in companies" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
        </select>
      </div>

      <!-- Event category -->
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-muted-foreground">Category</span>
        <select
          v-model="eventFilter"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option v-for="cat in EVENT_CATEGORIES" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
        </select>
      </div>

      <!-- Actor type -->
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-muted-foreground">Actor</span>
        <select
          v-model="actorFilter"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        >
          <option v-for="a in ACTOR_TYPES" :key="a.value" :value="a.value">{{ a.label }}</option>
        </select>
      </div>

      <!-- Outcome pills -->
      <div class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-muted-foreground">Outcome</span>
        <div class="flex gap-1">
          <button
            v-for="opt in [{ value: '', label: 'All' }, { value: 'ok', label: 'ok' }, { value: 'error', label: 'error' }]"
            :key="opt.value"
            type="button"
            class="h-9 px-3 rounded-md text-xs font-semibold border transition-colors"
            :class="outcomeFilter === opt.value
              ? 'bg-foreground text-background border-foreground'
              : 'bg-background text-muted-foreground border-input hover:text-foreground'"
            @click="outcomeFilter = opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div class="ml-auto text-xs text-muted-foreground self-end pb-1">
        {{ total.toLocaleString() }} row{{ total === 1 ? '' : 's' }}
      </div>
    </div>

    <!-- Table -->
    <div class="rounded-lg border overflow-x-auto">
      <Table class="min-w-max w-full text-xs">
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="h-8 px-3 w-4"></TableHead>
            <TableHead class="h-8 px-3">Timestamp</TableHead>
            <TableHead class="h-8 px-3">Company</TableHead>
            <TableHead class="h-8 px-3">Event</TableHead>
            <TableHead class="h-8 px-3">Actor</TableHead>
            <TableHead class="h-8 px-3">IP</TableHead>
            <TableHead class="h-8 px-3">Resource</TableHead>
            <TableHead class="h-8 px-3">Outcome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>

          <TableRow v-if="loading">
            <TableCell colspan="8" class="py-8 text-center text-muted-foreground">Loading…</TableCell>
          </TableRow>

          <TableRow v-else-if="rows.length === 0">
            <TableCell colspan="8" class="py-8 text-center text-muted-foreground">No entries found</TableCell>
          </TableRow>

          <template v-else v-for="row in rows" :key="row.id">
            <TableRow
              class="cursor-pointer"
              :class="expanded.has(row.id) ? 'bg-muted/40' : ''"
              @click="toggleExpand(row.id)"
            >
              <TableCell class="px-3 py-1.5 text-muted-foreground">
                <ChevronDown v-if="expanded.has(row.id)" class="size-3" />
                <ChevronRight v-else class="size-3" />
              </TableCell>
              <TableCell class="px-3 py-1.5 font-mono whitespace-nowrap text-muted-foreground">{{ fmtTs(row.ts) }}</TableCell>
              <TableCell class="px-3 py-1.5 text-muted-foreground">{{ companyName(row.company_id) }}</TableCell>
              <TableCell class="px-3 py-1.5 font-mono" :class="eventColor(row.event)">{{ row.event }}</TableCell>
              <TableCell class="px-3 py-1.5 text-muted-foreground">
                {{ row.actor_type }}<span v-if="row.actor_id" class="text-muted-foreground/50"> #{{ row.actor_id }}</span>
              </TableCell>
              <TableCell class="px-3 py-1.5 font-mono text-muted-foreground">{{ row.actor_ip ?? '—' }}</TableCell>
              <TableCell class="px-3 py-1.5 text-muted-foreground">
                <span v-if="row.resource">{{ row.resource }}<span v-if="row.resource_id"> #{{ row.resource_id }}</span></span>
                <span v-else>—</span>
              </TableCell>
              <TableCell class="px-3 py-1.5">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  :class="row.outcome === 'ok'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'"
                >{{ row.outcome }}</span>
              </TableCell>
            </TableRow>

            <!-- Expanded detail -->
            <TableRow v-if="expanded.has(row.id)" class="bg-muted/20 hover:bg-muted/20">
              <TableCell colspan="8" class="px-6 py-3">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div v-if="row.before_json">
                    <p class="text-[10px] font-semibold text-muted-foreground mb-1">BEFORE</p>
                    <pre class="text-[11px] font-mono bg-background rounded border p-2 overflow-auto max-h-48">{{ fmtJson(row.before_json) }}</pre>
                  </div>
                  <div v-if="row.after_json">
                    <p class="text-[10px] font-semibold text-muted-foreground mb-1">AFTER</p>
                    <pre class="text-[11px] font-mono bg-background rounded border p-2 overflow-auto max-h-48">{{ fmtJson(row.after_json) }}</pre>
                  </div>
                  <div v-if="row.meta_json">
                    <p class="text-[10px] font-semibold text-muted-foreground mb-1">META</p>
                    <pre class="text-[11px] font-mono bg-background rounded border p-2 overflow-auto max-h-48">{{ fmtJson(row.meta_json) }}</pre>
                  </div>
                  <p v-if="!row.before_json && !row.after_json && !row.meta_json" class="text-xs text-muted-foreground">No detail payload</p>
                </div>
              </TableCell>
            </TableRow>
          </template>

        </TableBody>
      </Table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" :disabled="page === 0" @click="page--">← Prev</Button>
      <span class="text-sm text-muted-foreground">Page {{ page + 1 }} of {{ totalPages }}</span>
      <Button variant="outline" size="sm" :disabled="page >= totalPages - 1" @click="page++">Next →</Button>
    </div>

  </div>
</template>

import { ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type { Company } from '@/types'

export interface CompanyAdmin {
  id: number
  email: string
  name: string | null
  role: string
  active: number
}

export function validateSlug(slug: string): string | null {
  const s = slug.trim()
  if (!s) return 'Slug is required'
  if (s.length < 2) return 'Slug must be at least 2 characters'
  if (!/^[a-z0-9-]+$/.test(s)) return 'Lowercase letters, numbers and hyphens only'
  return null
}

export function useSuperAdmin() {
  const companies = ref<Company[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const { apiFetch } = useApi()

  async function fetchCompanies() {
    loading.value = true
    error.value = null
    try {
      const data = await apiFetch<{ companies: Company[] }>('/api/companies.php')
      companies.value = data.companies
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load companies'
    } finally {
      loading.value = false
    }
  }

  async function createCompany(payload: {
    name: string
    slug: string
    email: string
    password: string
    salaxy_account_id?: string
  }): Promise<Company> {
    const data = await apiFetch<{ company: Company }>('/api/companies.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    companies.value.push({ ...data.company, active: 1, approvals_enabled: 0, ui_language: 'en', employee_count: 0, business_id: null })
    await fetchCompanies()
    return data.company
  }

  async function updateCompany(
    id: number,
    fields: Partial<Pick<Company, 'name' | 'slug' | 'active' | 'approvals_enabled' | 'time_app_enabled' | 'supervisor_ui_enabled' | 'business_id' | 'salaxy_api_url' | 'salaxy_username'>> & { salaxy_password?: string },
  ) {
    const data = await apiFetch<{ company: Company }>('/api/companies.php', {
      method: 'POST',
      body: JSON.stringify({ id, ...fields }),
    })
    const idx = companies.value.findIndex(c => c.id === id)
    if (idx >= 0) {
      companies.value[idx] = data.company ?? { ...companies.value[idx]!, ...fields }
    }
  }

  async function fetchBusinessId(companyId: number): Promise<string> {
    const data = await apiFetch<{ business_id: string }>(`/api/fetch_business_id.php?company_id=${companyId}`)
    return data.business_id
  }

  async function fetchCompanyAdmins(companyId: number): Promise<CompanyAdmin[]> {
    const data = await apiFetch<{ admins: CompanyAdmin[] }>(`/api/company_admins.php?company_id=${companyId}`)
    return data.admins
  }

  async function saveAdmin(companyId: number, admin: { id: number; email: string; name: string; password: string }): Promise<void> {
    await apiFetch('/api/company_admins.php', {
      method: 'POST',
      body: JSON.stringify({ company_id: companyId, ...admin }),
    })
  }

  async function deleteAdmin(companyId: number, adminId: number): Promise<void> {
    await apiFetch('/api/company_admins.php', {
      method: 'DELETE',
      body: JSON.stringify({ company_id: companyId, id: adminId }),
    })
  }

  return { companies, loading, error, fetchCompanies, createCompany, updateCompany, fetchBusinessId, fetchCompanyAdmins, saveAdmin, deleteAdmin }
}

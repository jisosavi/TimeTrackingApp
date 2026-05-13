import { test, expect } from '@playwright/test'

// These tests require a running server and valid admin + employee tokens.
// Set env vars to run:
//   ADMIN_TOKEN=<jwt>  ADMIN_SLUG=<slug>
//   EMPLOYEE_TOKEN=<jwt>  EMPLOYEE_SLUG=<slug>  EMPLOYEE_ID=<number>
test.describe('Admin – record absence on behalf', () => {
  const slug = process.env.ADMIN_SLUG ?? 'demo'
  const employeeSlug = process.env.EMPLOYEE_SLUG ?? 'demo'

  function skipIfNoToken() {
    if (!process.env.ADMIN_TOKEN) {
      // eslint-disable-next-line playwright/no-skipped-test
      test.skip()
    }
  }

  test.beforeEach(async ({ context }) => {
    const token = process.env.ADMIN_TOKEN
    if (!token) return
    await context.addInitScript((t) => {
      localStorage.setItem('auth', JSON.stringify({
        token: t,
        user: { type: 'admin', companySlug: 'demo', uiLanguage: 'en' },
      }))
    }, token)
  })

  test('Time off tab is visible in admin nav', async ({ page }) => {
    skipIfNoToken()
    await page.goto(`/${slug}/admin/time-off`)
    await expect(page.getByRole('heading', { name: /time off/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /record absence/i })).toBeVisible()
  })

  test('admin can record absence for an employee via People list', async ({ page }) => {
    skipIfNoToken()
    await page.goto(`/${slug}/admin/dashboard`)

    // Find "Record absence" button on first employee row
    const recordBtn = page.getByRole('button', { name: /record absence/i }).first()
    await expect(recordBtn).toBeVisible()
    await recordBtn.click()

    // Dialog should appear
    await expect(page.getByText('New absence')).toBeVisible()

    // Fill in dates
    const today = new Date()
    const start = today.toISOString().slice(0, 10)
    today.setDate(today.getDate() + 2)
    const end = today.toISOString().slice(0, 10)

    await page.locator('input[type="date"]').nth(0).fill(start)
    await page.locator('input[type="date"]').nth(1).fill(end)

    // Days in period should update
    await expect(page.getByText(/excludes weekends/i)).toBeVisible()

    // Submit
    const saveBtn = page.getByRole('button', { name: /save absence/i })
    await saveBtn.click()

    // Dialog should close
    await expect(page.getByText('New absence')).not.toBeVisible()
  })

  test('admin time-off team calendar shows ribbons', async ({ page }) => {
    skipIfNoToken()
    await page.goto(`/${slug}/admin/time-off`)

    // Stats cards should be visible
    await expect(page.getByText(/holiday proposals/i)).toBeVisible()
    await expect(page.getByText(/on holiday this month/i)).toBeVisible()

    // Team calendar tab content (default)
    await expect(page.locator('canvas, [class*="ribbon"], [class*="PersonRibbon"]').or(
      page.getByText(/no team members/i),
    ).first()).toBeVisible({ timeout: 5000 })
  })

  test('employee sees absence in Overview after admin records it', async ({ page, context }) => {
    const empToken = process.env.EMPLOYEE_TOKEN
    if (!empToken || !process.env.ADMIN_TOKEN) {
      // eslint-disable-next-line playwright/no-skipped-test
      test.skip()
      return
    }

    // Record absence as admin first
    const empId = parseInt(process.env.EMPLOYEE_ID ?? '0', 10)
    const adminToken = process.env.ADMIN_TOKEN!
    const base = process.env.VITE_API_BASE ?? 'http://localhost:8080'
    const today = new Date().toISOString().slice(0, 10)

    const res = await fetch(`${base}/api/admin/record_absence.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ employeeId: empId, startDate: today, endDate: today, isPaid: true, affectsAccrual: true }),
    })
    expect(res.status).toBe(201)

    // Now check as employee
    await context.clearCookies()
    await context.addInitScript((t) => {
      localStorage.setItem('auth', JSON.stringify({ token: t, user: { companySlug: 'demo', uiLanguage: 'en' } }))
    }, empToken)

    await page.goto(`/${employeeSlug}/home/time-off`)
    await page.getByRole('tab', { name: /overview/i }).click()

    // Absence should appear
    await expect(page.getByText(/kertausharjoitus/i)).toBeVisible({ timeout: 5000 })
  })
})

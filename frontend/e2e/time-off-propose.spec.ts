import { test, expect } from '@playwright/test'

// Runs against a 390×844 mobile viewport (iPhone 14 size)
const MOBILE = { width: 390, height: 844 }

// These tests require a logged-in employee session.
// They are skipped when no auth cookie/token is available in the test environment.
// To run locally: set EMPLOYEE_TOKEN env var to a valid JWT for an employee account.
test.describe('Time off – propose holiday flow', () => {
  test.use({ viewport: MOBILE })

  test.beforeEach(async ({ page, context }) => {
    const token = process.env.EMPLOYEE_TOKEN
    const slug = process.env.EMPLOYEE_SLUG ?? 'demo'
    if (!token) {
      // eslint-disable-next-line playwright/no-skipped-test
      test.skip()
      return
    }
    await context.addInitScript((t) => {
      localStorage.setItem('auth', JSON.stringify({ token: t, user: { companySlug: 'demo', uiLanguage: 'en' } }))
    }, token)
    await page.goto(`/${slug}/home/time-off`)
  })

  test('navigates to calendar tab and shows month grid', async ({ page }) => {
    // Click the Calendar seg tab
    await page.getByRole('tab', { name: 'Calendar' }).click()
    // Month label should be visible
    await expect(page.getByText(/january|february|march|april|may|june|july|august|september|october|november|december/i)).toBeVisible()
    // Grid buttons (day cells) should be present
    const dayCells = page.locator('button[type="button"]').filter({ hasText: /^\d+$/ })
    await expect(dayCells.first()).toBeVisible()
  })

  test('select date range and open propose sheet', async ({ page }) => {
    await page.getByRole('tab', { name: 'Calendar' }).click()

    // Tap day 10 (start)
    await page.locator('button[type="button"]').filter({ hasText: /^10$/ }).first().click()
    // Tap day 14 (end)
    await page.locator('button[type="button"]').filter({ hasText: /^14$/ }).first().click()

    // Continue button should appear
    const continueBtn = page.getByRole('button', { name: /continue/i })
    await expect(continueBtn).toBeVisible()
    await continueBtn.click()

    // ProposeSheet should open
    await expect(page.getByText('Propose holiday')).toBeVisible()
    await expect(page.getByPlaceholder(/summer holiday/i)).toBeVisible()
  })

  test('fills form and submits proposal', async ({ page }) => {
    await page.getByRole('tab', { name: 'Calendar' }).click()

    // Select a range
    await page.locator('button[type="button"]').filter({ hasText: /^8$/ }).first().click()
    await page.locator('button[type="button"]').filter({ hasText: /^9$/ }).first().click()

    await page.getByRole('button', { name: /continue/i }).click()

    // Fill label
    await page.getByPlaceholder(/summer holiday/i).fill('Test holiday')
    // Fill note
    await page.getByPlaceholder(/additional information/i).fill('E2E test note')

    // Intercept the POST request
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('holiday_proposals.php') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /submit proposal/i }).click()
    const response = await responsePromise

    expect(response.status()).toBe(201)

    // Sheet should close after success
    await expect(page.getByText('Propose holiday')).not.toBeVisible({ timeout: 5000 })
  })

  test('shows overlap error when proposal conflicts', async ({ page }) => {
    // This test requires that the previous test already submitted a proposal for day 8-9
    // It relies on test ordering — skip if not meaningful in isolation
    await page.getByRole('tab', { name: 'Calendar' }).click()

    await page.locator('button[type="button"]').filter({ hasText: /^8$/ }).first().click()
    await page.locator('button[type="button"]').filter({ hasText: /^8$/ }).first().click()

    await page.getByRole('button', { name: /continue/i }).click()
    await page.getByPlaceholder(/summer holiday/i).fill('Duplicate')
    await page.getByRole('button', { name: /submit proposal/i }).click()

    await expect(page.getByText(/already have a holiday/i)).toBeVisible()
  })

  test('clear resets selection', async ({ page }) => {
    await page.getByRole('tab', { name: 'Calendar' }).click()

    await page.locator('button[type="button"]').filter({ hasText: /^5$/ }).first().click()
    await page.locator('button[type="button"]').filter({ hasText: /^7$/ }).first().click()

    const continueBtn = page.getByRole('button', { name: /continue/i })
    await expect(continueBtn).toBeVisible()

    await page.getByRole('button', { name: /^clear$/i }).click()

    await expect(continueBtn).toBeHidden()
  })
})

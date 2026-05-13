import { test, expect } from '@playwright/test'

// Requires a running server + valid employee token.
// Set env vars: EMPLOYEE_TOKEN=<jwt>  EMPLOYEE_SLUG=<slug>
test.describe('Chat – absence intent', () => {
  const slug = process.env.EMPLOYEE_SLUG ?? 'demo'

  test.beforeEach(async ({ context }) => {
    const token = process.env.EMPLOYEE_TOKEN
    if (!token) {
      // eslint-disable-next-line playwright/no-skipped-test
      test.skip()
      return
    }
    await context.addInitScript((t) => {
      localStorage.setItem('auth', JSON.stringify({
        token: t,
        user: { companySlug: 'demo', uiLanguage: 'fi' },
      }))
    }, token)
  })

  test('employee types kertausharjoitus and confirms absence preview', async ({ page }) => {
    if (!process.env.EMPLOYEE_TOKEN) {
      // eslint-disable-next-line playwright/no-skipped-test
      test.skip()
      return
    }

    await page.goto(`/${slug}/home/log`)

    // Open chat tab if needed
    const chatTab = page.getByRole('tab', { name: /chat|kirjaa/i })
    if (await chatTab.isVisible()) await chatTab.click()

    // Type the absence message
    const textarea = page.locator('textarea')
    await textarea.fill('kertausharjoitus 5.-7.5.')
    await page.keyboard.press('Enter')

    // Wait for the model to respond and the absence preview to appear
    await expect(page.getByText(/🏕️|poissaolo/i)).toBeVisible({ timeout: 20000 })

    // Start date should be pre-filled (2026-05-05)
    const startInput = page.locator('input[type="date"]').first()
    await expect(startInput).toHaveValue('2026-05-05')

    // Confirm the absence
    const confirmBtn = page.getByRole('button', { name: /confirm|vahvista/i })
    await confirmBtn.click()

    // Wait for the success message
    await expect(page.getByText(/poissaolo kirjattu|absence recorded/i)).toBeVisible({ timeout: 5000 })
  })

  test('employee types "lomaa kesäkuussa" → holiday_proposal preview appears', async ({ page }) => {
    if (!process.env.EMPLOYEE_TOKEN) {
      // eslint-disable-next-line playwright/no-skipped-test
      test.skip()
      return
    }

    await page.goto(`/${slug}/home/log`)

    const chatTab = page.getByRole('tab', { name: /chat|kirjaa/i })
    if (await chatTab.isVisible()) await chatTab.click()

    const textarea = page.locator('textarea')
    await textarea.fill('lomaa 23.6.-4.7.')
    await page.keyboard.press('Enter')

    // Either a holiday_proposal preview or a clarification question
    await expect(
      page.getByText(/🌴|loma-ehdotus|holiday proposal/i).or(page.getByText(/päivämäär/i)),
    ).toBeVisible({ timeout: 20000 })
  })
})

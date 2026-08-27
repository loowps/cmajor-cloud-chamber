import { expect, test } from '@playwright/test'

/**
 * The one thing the unit suite cannot answer: that the custom element the host mounts actually
 * boots. `cmaj-view` waits on a stylesheet the dev server does not serve, so a real browser is
 * the only place the fallback that mounts anyway is exercised.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('boots the patch view and signs it in the footer', async ({ page }) => {
  await expect(page.locator('cmaj-view')).toBeVisible()
  await expect(page.locator('footer')).toContainText('Cloud Chamber')
})

test('opens on head one with an empty buffer', async ({ page }) => {
  await expect(page.getByText('Head 1', { exact: true })).toBeVisible()
  await expect(page.getByText('Drop an audio file to fill the buffer')).toBeVisible()
})

test('offers every head, and moves the whole window onto the one that is picked', async ({
  page
}) => {
  /// Selected by title rather than by text: each button carries a pip beside its number, so its
  /// text is not the number alone.
  const heads = page.locator('footer button[title^="Head "]')

  await expect(heads).toHaveCount(8)

  await heads.nth(2).click()

  await expect(page.getByText('Head 3', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Source · H3' })).toBeVisible()
})

test('drags a parameter track and the reading follows', async ({ page }) => {
  const motion = page.getByRole('slider', { name: 'Motion' })
  const before = await motion.getAttribute('aria-valuenow')

  const track = await motion.boundingBox()

  await page.mouse.move(track!.x + track!.width / 2, track!.y + track!.height / 2)
  await page.mouse.down()
  await page.mouse.move(track!.x + track!.width / 2 + 40, track!.y + track!.height / 2)
  await page.mouse.up()

  await expect(motion).not.toHaveAttribute('aria-valuenow', before!)
})

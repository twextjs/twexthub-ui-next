import { expect, test } from "@playwright/test"

import { signIn, visit } from "./helpers"

test("the quota meter works for the default limit and a custom cap", async ({
  page,
}) => {
  await signIn(page)
  await visit(page, "/admin?tab=instance")

  await page.getByLabel("Handle").fill("kamixfox")
  await page.getByRole("button", { name: "Look up" }).click()

  const meter = page.getByRole("progressbar", {
    name: "Storage used by @kamixfox",
  })
  await expect(meter).toBeVisible()
  // 5 MB of the 64 MB registry default.
  await expect(meter).toHaveAttribute(
    "aria-valuetext",
    "5 MB of 64 MB used (8%)"
  )
  await expect(page.getByText("Default limit")).toBeVisible()
  await expect(page.getByText(/registry default 64 MB/)).toBeVisible()
  await expect(page.getByText("59 MB left")).toBeVisible()

  // A custom cap replaces the default and rescales the bar.
  await page.getByLabel("Maximum bytes").fill(String(10 * 1024 * 1024))
  await expect(page.getByText("That is 10 MB.")).toBeVisible()
  await page.getByRole("button", { name: "Save quota" }).click()

  await expect(page.getByText("Custom limit")).toBeVisible()
  await expect(meter).toHaveAttribute(
    "aria-valuetext",
    "5 MB of 10 MB used (50%)"
  )
  await expect(meter).toHaveAttribute("aria-valuenow", "50")

  // A cap below current usage is allowed, and the meter says so plainly.
  await page.getByLabel("Maximum bytes").fill(String(4 * 1024 * 1024))
  await page.getByRole("button", { name: "Save quota" }).click()

  await expect(meter).toHaveAttribute(
    "aria-valuetext",
    "5 MB of 4 MB used (125%)"
  )
  await expect(meter).toHaveAttribute("aria-valuenow", "100")
  await expect(page.getByText("1 MB over")).toBeVisible()
  await expect(page.getByText(/Over the limit/)).toBeVisible()

  // Clearing the field hands the account back to the registry default.
  await page.getByRole("button", { name: "Use the default" }).click()
  await page.getByRole("button", { name: "Save quota" }).click()

  await expect(page.getByText("Default limit")).toBeVisible()
  await expect(meter).toHaveAttribute(
    "aria-valuetext",
    "5 MB of 64 MB used (8%)"
  )
})

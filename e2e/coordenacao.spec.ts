import { expect, test } from '@playwright/test'

test('coordenador entra, cadastra um coroinha e cria uma escala', async ({ page }) => {
  const email = process.env.E2E_EMAIL ?? 'admin@paroquia.local'
  const password = process.env.E2E_PASSWORD ?? 'Coroinhas2026'
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(password)
  await page.getByRole('button', { name: 'Acessar o sistema' }).click()
  await expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible()

  await page.getByRole('link', { name: 'Coroinhas' }).click()
  await page.getByRole('link', { name: 'Novo coroinha' }).click()
  const name = `Coroinha E2E ${Date.now()}`
  await page.getByLabel('Nome completo').fill(name)
  await page.getByLabel('Data de nascimento').fill('2014-04-12')
  await page.getByLabel('Data de entrada').fill('2025-01-15')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()

  await page.getByRole('link', { name: 'Escalas' }).click()
  await page.getByRole('link', { name: 'Nova celebração' }).click()
  await page.getByLabel('Nome ou tipo').fill('Missa de teste')
  await page.getByLabel('Data').fill('2026-12-08')
  await page.getByLabel('Horário').fill('19:00')
  await page.getByRole('button', { name: 'Salvar celebração' }).click()
  await expect(page.getByText('Cruciferário')).toBeVisible()
  await expect(page.getByText('Naveteiro')).toBeVisible()
})

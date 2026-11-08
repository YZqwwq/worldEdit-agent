import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const server = await createServer({
  configFile: false,
  root: resolve('src/renderer'),
  plugins: [vue()],
  resolve: { alias: { '@share': resolve('src/share'), '@renderer': resolve('src/renderer/src') } },
  server: { host: '127.0.0.1', port: 5187, strictPort: false, fs: { allow: [process.cwd()] } }
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text())
  })
  await page.addInitScript(() => {
    let worlds = [
      {
        id: 'one',
        name: '北境编年史',
        summary: '群山、城邦与漫长的冬季',
        status: 'active',
        schemaVersion: 1,
        updatedAt: '2026-09-06'
      },
      {
        id: 'two',
        name: '星海纪事',
        summary: '远航者的记录',
        status: 'draft',
        schemaVersion: 1,
        updatedAt: '2026-09-05'
      }
    ]
    window.api = {
      listWorlds: async () => structuredClone(worlds),
      createWorld: async (input) => {
        const world = { ...input, id: 'new', status: 'active', schemaVersion: 1 }
        worlds.push(world)
        return world
      },
      updateWorld: async (input) => {
        const world = worlds.find((item) => item.id === input.worldId)
        Object.assign(world, input)
        return structuredClone(world)
      },
      deleteWorld: async (id) => {
        worlds = worlds.filter((world) => world.id !== id)
      }
    }
  })
  await page.goto(server.resolvedUrls.local[0])
  await page.getByRole('heading', { name: 'WorldEdit', exact: true }).waitFor()
  await page.getByRole('button', { name: /北境编年史.*群山/ }).waitFor()
  await mkdir('.tmp-home-resources', { recursive: true })
  await page.screenshot({ path: '.tmp-home-resources/default-desktop.png' })
  assert.equal(
    await page.locator('.brand img').evaluate((img) => img.complete && img.naturalWidth > 0),
    true
  )
  await page.getByRole('button', { name: '首页样式设置' }).click()
  await page.locator('.preview-stage canvas').waitFor()
  await page.waitForTimeout(300)
  await page.screenshot({ path: '.tmp-home-resources/style-gallery-desktop.png' })
  assert.equal(await page.locator('.style-thumbnail').count(), 2)
  assert.notEqual(
    await page
      .locator('.settings-panel')
      .evaluate((element) => getComputedStyle(element).backdropFilter),
    'none'
  )
  await page.getByRole('radio', { name: /动态世界/ }).check()
  await page.keyboard.press('Escape')
  await page.locator('canvas.home-canvas').waitFor()
  await page.waitForTimeout(300)
  assert.equal(
    await page
      .locator('canvas.home-canvas')
      .evaluate((canvas) => canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3]),
    255
  )
  await page.locator('canvas.home-canvas').click({ position: { x: 1440 * 0.815, y: 45 } })
  await page.locator('.world-index-layer.is-open').waitFor()
  await page.getByRole('button', { name: '首页样式设置' }).click()
  assert.equal(await page.getByRole('radio', { name: /动态世界/ }).isChecked(), true)
  await page.getByRole('button', { name: '移除 动态世界', exact: true }).click()
  await page.getByRole('button', { name: '移除', exact: true }).click()
  await page.getByRole('heading', { name: 'WorldEdit', exact: true }).waitFor()
  await page.getByRole('button', { name: '添加样式资源', exact: true }).click()
  await page.getByRole('button', { name: '安装动态世界', exact: true }).waitFor()
  const resource = resolve('resources/home-styles/bookshelf.home.json')
  await page.locator('input[type=file]').setInputFiles(resource)
  const shelf = page.frameLocator('.home-host iframe')
  await shelf.getByRole('button', { name: '北境编年史', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await shelf.getByRole('button', { name: '创建世界观', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await shelf.getByRole('button', { name: '编辑', exact: true }).first().click()
  await page.getByLabel('世界观名称').fill('北境新篇')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await shelf.getByRole('button', { name: '北境新篇', exact: true }).waitFor()
  await shelf.getByRole('button', { name: '删除', exact: true }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await shelf.getByRole('button', { name: '北境新篇', exact: true }).count(), 1)
  const isolated = await (await page.locator('.home-host iframe').elementHandle())
    .contentFrame()
    .then((frame) =>
      frame.evaluate(() => {
        try {
          return !!parent.document
        } catch {
          return false
        }
      })
    )
  assert.equal(isolated, false)
  await page.reload()
  await page
    .frameLocator('.home-host iframe')
    .getByRole('heading', { name: '世界观书架' })
    .waitFor()
  await page.getByRole('button', { name: '首页样式设置' }).click()
  await page.locator('input[type=file]').setInputFiles(resource)
  await page.getByRole('alert').filter({ hasText: '该样式已安装' }).waitFor()
  await page.getByRole('button', { name: '移除 世界观书架', exact: true }).click()
  await page.getByRole('button', { name: '移除', exact: true }).click()
  await page.getByRole('heading', { name: 'WorldEdit', exact: true }).waitFor()
  const malformed = { ...JSON.parse(await readFile(resource, 'utf8')), apiVersion: 2 }
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(malformed))
    })
  await page.getByRole('alert').filter({ hasText: '不支持此样式接口版本' }).waitFor()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '.tmp-home-resources/default-mobile.png' })
  assert.equal(
    await page
      .locator('.home-host .default-home')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
    true
  )
  if (!(await page.locator('.settings-panel').isVisible()))
    await page.getByRole('button', { name: '首页样式设置' }).click()
  await page.locator('.settings-panel').waitFor()
  const bounds = await page.locator('.settings-panel').boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390)
  await page.screenshot({ path: '.tmp-home-resources/settings-mobile.png' })
  assert.deepEqual(errors, [])
  console.log(
    'PASS: default, assets, canvas, internal index, uninstall fallback, resource import, shared data, edit, create/delete dialogs, sandbox, reload restore, duplicate and invalid resource, mobile layout'
  )
} finally {
  await browser?.close()
  await server.close()
}

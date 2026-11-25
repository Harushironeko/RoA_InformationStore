// 画像のシートを描き、目次（index.json）に画像の位置（images）を書き足す。
// world/build.js の後に、配信するときだけ動かす（画像の取得に時間がかかるため）
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { cellOf, LAYOUTS, PAD, SHEET, uvOf } from './images.js'

export const MEDIA = 'https://media.vrcroa.net'
// 透過のある画像の下に敷く色。ワールドの板の地色に合わせる
export const BACKGROUND = { r: 16, g: 18, b: 20 }
const QUALITY = 80

// 1枚をマスの大きさに縮め、端の色を PAD だけ伸ばす。返すのは絵の部分の幅と高さ
async function fit(source, cell) {
  const inner = cell - PAD * 2
  const { data, info } = await sharp(source)
    .rotate()
    .resize({ width: inner, height: inner, fit: 'inside', withoutEnlargement: false })
    .flatten({ background: BACKGROUND })
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'copy' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, info, width: info.width - PAD * 2, height: info.height - PAD * 2 }
}

// 目次の rev は画像の取得より前に決まるので、一時的な失敗で欠けると次に内容が変わるまで直らない。3回まで試す
async function download(name, fetcher) {
  let last = ''
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetcher(`${MEDIA}/${name}`)
      if (res.ok) return Buffer.from(await res.arrayBuffer())
      last = String(res.status)
      if (res.status === 404) break
    } catch (e) {
      last = e.message
    }
  }
  throw new Error(`取得できませんでした（${last}）`)
}

// 同時に取りに行く数を絞って順に処理する
async function eachLimited(items, limit, run) {
  const queue = [...items]
  await Promise.all(Array.from({ length: limit }, async () => {
    while (queue.length) await run(queue.shift())
  }))
}

// index: build.js が書いた目次（imageSlots に 名前 → { thumb, full } のマス番号）
export async function renderSheets(index, out, { fetcher = fetch } = {}) {
  const slots = index.imageSlots ?? {}
  const names = Object.keys(slots)
  const sizes = {}
  const pieces = { thumb: {}, full: {} }
  const failed = []
  await eachLimited(names, 6, async (name) => {
    try {
      const source = await download(name, fetcher)
      for (const [kind, layout] of Object.entries(LAYOUTS)) {
        const piece = await fit(source, layout.cell)
        pieces[kind][name] = piece
        ;(sizes[name] ??= {})[kind] = [piece.width, piece.height]
      }
    } catch (e) {
      failed.push(`${name}: ${e.message}`)
    }
  })

  for (const [kind, layout] of Object.entries(LAYOUTS)) {
    const used = new Set(names.filter((n) => pieces[kind][n]).map((n) => cellOf(layout, slots[n][kind]).sheet))
    for (const sheet of used) {
      const composite = names
        .filter((n) => pieces[kind][n] && cellOf(layout, slots[n][kind]).sheet === sheet)
        .map((n) => {
          const { x, y } = cellOf(layout, slots[n][kind])
          const { data, info } = pieces[kind][n]
          return { input: data, raw: { width: info.width, height: info.height, channels: info.channels }, left: x, top: y }
        })
      await sharp({ create: { width: SHEET, height: SHEET, channels: 3, background: BACKGROUND } })
        .composite(composite)
        .jpeg({ quality: QUALITY, mozjpeg: true })
        .toFile(join(out, layout.file(sheet)))
    }
  }

  // 取得できなかった画像は目次に載せない（ワールドは画像なしとして本文だけ出す）
  const images = {}
  for (const name of names) {
    if (!sizes[name]?.thumb || !sizes[name]?.full) continue
    images[name] = [...uvOf(LAYOUTS.thumb, slots[name].thumb, ...sizes[name].thumb), ...uvOf(LAYOUTS.full, slots[name].full, ...sizes[name].full)]
  }
  const { imageSlots, ...rest } = index
  return { index: { ...rest, images }, failed }
}

async function main([out = '_site/v1']) {
  const path = join(out, 'index.json')
  const built = JSON.parse(readFileSync(path, 'utf8'))
  // 描いた後の目次には imageSlots が無い。2回続けて動かすと画像の位置が消えるので止める
  if (!built.imageSlots) throw new Error('先に world/build.js を動かしてください（この目次はシートを描いた後のものです）')
  const { index, failed } = await renderSheets(built, out)
  writeFileSync(path, JSON.stringify(index))
  console.log(`画像 ${Object.keys(index.images).length} 枚、一覧用シート ${index.thumbs.filter(Boolean).length} 枚、詳細用シート ${index.fulls.filter(Boolean).length} 枚`)
  for (const line of failed) console.log(`取得できなかった画像 ${line}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}

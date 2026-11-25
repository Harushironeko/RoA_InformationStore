// 画像のシートへの割り付け（描画は sheets.js）。
// ワールドは画像を 2048×2048 のシートにまとめて読む。VRCUrl は実行中に作れないので、シートの URL は固定の本数。
// 画像は置き場のファイル名（uuid.拡張子）で区別し、同じ名前の中身は変わらない（差し替えると名前が変わる）。
// そのため、前の版のマスを引き継げば、画像を1枚足しても変わるシートは1〜2枚で済む

export const SHEET = 2048
// 一覧用は 256px を 8×8、詳細用は 1024px を 2×2
export const LAYOUTS = {
  thumb: { cell: 256, cols: 8, sheets: 2, file: (i) => `thumb-${i}.jpg` },
  full: { cell: 1024, cols: 2, sheets: 32, file: (i) => `full-${String(i).padStart(2, '0')}.jpg` },
}
// マスの縁。隣の絵がにじまないよう、絵の端の色をこの幅だけ伸ばす
export const PAD = 2
// 描き方を変えたら上げる（シートのハッシュが変わり、ワールドが読み直す）
export const SHEET_VERSION = 1

export const perSheet = (layout) => layout.cols * layout.cols
export const capacity = (layout) => perSheet(layout) * layout.sheets

// 記事の画像と本文の img 行から、出てくる順に画像の名前を集める
export function imageNames(lists) {
  const names = []
  const add = (name) => name && !names.includes(name) && names.push(name)
  for (const [kind, list] of Object.entries(lists)) {
    if (kind === 'timeline') continue
    for (const x of list) {
      add(x.image)
      for (const page of x.pages ?? []) for (const line of page.body) if (line[0] === 'img') add(line[1])
    }
  }
  return names
}

// マスの通し番号 → シートの中での位置（左上が原点、ピクセル）
export function cellOf(layout, slot) {
  const at = slot % perSheet(layout)
  return { sheet: Math.floor(slot / perSheet(layout)), x: (at % layout.cols) * layout.cell, y: Math.floor(at / layout.cols) * layout.cell }
}

const round = (v) => Math.round(v * 1e5) / 1e5
// RawImage.uvRect にそのまま入れる値。Unity の UV は左下が原点
export function uvOf(layout, slot, width, height) {
  const { sheet, x, y } = cellOf(layout, slot)
  return [sheet, round((x + PAD) / SHEET), round(1 - (y + PAD + height) / SHEET), round(width / SHEET), round(height / SHEET)]
}

// uvOf の逆。前の版の目次からマスの番号を取り戻す
export function slotOf(layout, [sheet, u, v, , h]) {
  const col = Math.floor(u * SHEET / layout.cell)
  const row = Math.floor((1 - v - h) * SHEET / layout.cell)
  return sheet * perSheet(layout) + row * layout.cols + col
}

// 目次の images（名前 → [一覧用の5つ, 詳細用の5つ]）から、前の版の割り付けを取り戻す
export function previousSlots(images = {}) {
  const out = { thumb: {}, full: {} }
  for (const [name, uv] of Object.entries(images)) {
    if (!Array.isArray(uv) || uv.length !== 10) continue
    out.thumb[name] = slotOf(LAYOUTS.thumb, uv.slice(0, 5))
    out.full[name] = slotOf(LAYOUTS.full, uv.slice(5))
  }
  return out
}

// 前の版と同じマスを使い、新しい画像は空いている一番若いマスに入れる。
// 入りきらない画像は外し（本文は出る）、dropped に返す
export function assign(names, previous = { thumb: {}, full: {} }) {
  const slots = {}
  const dropped = new Set()
  for (const [kind, layout] of Object.entries(LAYOUTS)) {
    const taken = new Map()
    for (const name of names) {
      const s = previous[kind]?.[name]
      if (Number.isInteger(s) && s >= 0 && s < capacity(layout) && !taken.has(s)) taken.set(s, name)
    }
    const used = new Set(taken.keys())
    let next = 0
    for (const name of names) {
      let s = [...taken].find(([, n]) => n === name)?.[0]
      if (s === undefined) {
        while (used.has(next)) next++
        if (next >= capacity(layout)) {
          dropped.add(name)
          continue
        }
        s = next
        used.add(s)
      }
      ;(slots[name] ??= {})[kind] = s
    }
  }
  for (const name of dropped) delete slots[name]
  return { slots, dropped: [...dropped] }
}

// シートごとの中身（マス → 名前）。何も入らないシートは null
export function sheetsOf(slots) {
  const out = {}
  for (const [kind, layout] of Object.entries(LAYOUTS)) {
    out[kind] = Array.from({ length: layout.sheets }, () => null)
    for (const [name, s] of Object.entries(slots)) {
      const { sheet } = cellOf(layout, s[kind])
      ;(out[kind][sheet] ??= {})[s[kind] % perSheet(layout)] = name
    }
  }
  return out
}

// 公式サイトの公開データ（public.json）を、VRChat のワールドが String Loading で読む形に直す。
// 入力は公開判定を通った後の JSON だけ。ここでは項目を拾い直さず、並べ替えと整形だけを行う。
// 形式の説明は world/FORMAT.md
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assign, imageNames, previousSlots, SHEET_VERSION, sheetsOf } from './images.js'

export const SCHEMA_VERSION = 1
export const PART_SLOTS = 8
export const PART_BYTES = 300 * 1024
export const LINE_CHARS = 2000
// 目次に載せる順（＝枠に詰める順）。短くてよく見るものを前に置く
export const KINDS = ['news', 'contents', 'staff', 'qa', 'guideline', 'timeline', 'characters', 'organizations', 'nations', 'lore', 'disasters', 'stories']
// ワールドの一覧に出す名前（目次の kinds）。並びは KINDS と同じ
export const KIND_LABELS = {
  news: 'ニュース', contents: '公式コンテンツ', staff: 'クレジット', qa: 'Q&A', guideline: '二次創作ガイドライン', timeline: '年表',
  characters: 'キャラクター', organizations: '組織', nations: '国家', lore: '社会', disasters: '根源災害', stories: '物語',
}

// TextMeshPro がタグとして読まないよう < を全角にする。改行は \n にそろえる。
// 両端の空白と改行は落とすが、全角の空白は字下げに使われるので残す
export const clean = (v) => (v === undefined || v === null ? '' : String(v)).replace(/\r\n?/g, '\n').replace(/</g, '＜').replace(/^[ \t\n]+|[ \t\n]+$/g, '')
// 画像・音声は置き場のファイル名（uuid.拡張子）で指す。ワールドは目次の対応表か同梱の一覧で引く
export const mediaKey = (url) => clean(url).split('/').pop()
const pairs = (list) => list.map(([label, value]) => [label, clean(value)]).filter(([, value]) => value)
const first = (text, max = 80) => {
  const line = clean(text).split('\n')[0]
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// 長い文章は改行の位置で LINE_CHARS 以下に分ける（1行だけで超えるものは文字数で切る）
export function paragraphs(text, max = LINE_CHARS) {
  const out = []
  let buf = ''
  for (const raw of clean(text).split('\n')) {
    for (let line = raw; ; line = line.slice(max)) {
      const piece = line.slice(0, max)
      if (buf && buf.length + 1 + piece.length > max) {
        out.push(buf)
        buf = piece
      } else buf = buf ? `${buf}\n${piece}` : piece
      if (line.length <= max) break
    }
  }
  if (buf.trim()) out.push(buf)
  return out.map((p) => ['p', p.replace(/^\n+|\n+$/g, '')])
}
const heading = (type, text) => (clean(text) ? [[type, clean(text)]] : [])

// 関連記事の href（/disasters/ID/ など）を [種類, ID] に直す
const linkOf = (r) => {
  const m = clean(r.href).match(/^\/(\w+)\/([^/]+)\/$/)
  return m && clean(r.name) ? [['link', clean(r.name), m[1], m[2]]] : []
}

// 演出。ワールドが再現しないときは読み飛ばせば、続きの本文がそのまま出る
const sceneLine = (s) => ['scene', s.kind, clean(s.title), clean(s.button), (s.lines ?? []).map(clean).join('\n'), (s.lines2 ?? []).map(clean).join('\n'), s.after ?? 'reveal', clean(s.page), mediaKey(s.audio), String(s.interval ?? 600), String(s.delay ?? 0)]

// カードの中身（子要素・演出）を行の並びにする
function flowLines(items = []) {
  return items.flatMap((x) => {
    if (x.kind === 'scene') return [sceneLine(x.scene)]
    if (x.kind === 'audioFile' || x.kind === 'audio') return x.audio ? [['audio', mediaKey(x.audio), clean(x.title), clean(x.caption)]] : []
    if (x.kind === 'region') return []
    const head = heading('h2', x.title)
    if (x.kind === 'dialogue') return [...head, ...(x.lines ?? []).map((l) => (l.type === 'direction' ? ['dir', clean(l.text)] : ['say', clean(l.speaker), clean(l.text)]))]
    if (x.kind === 'experiment') return (x.fields ?? []).map((f) => ['kv', clean(f.label), clean(f.text)])
    if (x.kind === 'diary') return [...head, ...(x.entries ?? []).map((e) => ['kv', clean(e.date), clean(e.text)])]
    if (x.kind === 'steps') return [...head, ...(x.items ?? []).map((t, i) => ['li', String(i + 1), clean(t)])]
    if (x.kind === 'image') return x.image ? [...head, ['img', mediaKey(x.image), clean(x.caption)]] : head
    if (x.kind === 'reference') return linkOf({ name: x.label || x.name, href: x.href })
    return [...head, ...paragraphs(x.body)]
  })
}

// 国家・組織・社会・キャラクター・根源災害のカード1枚
function cardLines(c, title) {
  return [
    ...heading('h', title),
    ...(c.gate ? [['gate', clean(c.gate)]] : []),
    ...flowLines(c.before),
    ...paragraphs(c.description ?? c.body),
    ...flowLines(c.contents),
  ]
}

const image = (x) => (x.mainImage ? { image: mediaKey(x.mainImage) } : {})
const article = (x, extra, info, pages) => ({ id: x.id, ...extra, ...image(x), info: pairs(info), pages })
const page = (name, body, extra = {}) => ({ name, ...extra, body })

const birthday = (v) => {
  const m = clean(v).match(/^(\d+)(?:-(\d\d)-(\d\d))?$/)
  return m ? `${m[1]}年${m[2] ? `${Number(m[2])}月${Number(m[3])}日` : ''}` : ''
}

const worldItem = (x, sub, info) => article(x, { title: clean(x.name), sub: clean(sub), summary: clean(x.summary), ...(x.pin ? { pin: [x.pin.x, x.pin.y] } : {}) }, info, [
  page('', (x.sections ?? []).flatMap((s) => [['tab', clean(s.tab)], ...s.cards.flatMap((c) => cardLines(c, c.title || c.type))])),
])

const CONVERT = {
  news: (d) => (d.news ?? []).map((n) => article(n, { title: clean(n.title), sub: clean(n.date), summary: first(n.body) }, [], [
    page('', [...paragraphs(n.body), ...(n.link ? [['url', 'リンク', clean(n.link)]] : [])]),
  ])),

  contents: (d) => (d.contents ?? []).map((c) => article(c, { title: clean(c.name), sub: clean(c.state), summary: clean(c.summary), kind: c.kind },
    [['状態', c.state], ['対応', c.platform], ['開催日程', c.schedule], ['開催時間', c.time], ['インスタンス', c.instance]], [
      page('', [...(clean(c.howto) ? [['h', '参加方法'], ...paragraphs(c.howto)] : []), ...(c.url ? [['url', clean(c.linkLabel) || 'リンク', clean(c.url)]] : [])]),
    ])),

  // 班ごとに1件。リーダーの肩書が空で他にメンバーがいれば「リーダー」
  staff: (d) => (d.staff?.groups ?? []).map((g, i) => ({
    id: `staff-${i}`, title: clean(g.name), sub: `${(g.leader ? 1 : 0) + g.members.length}名`, summary: [g.leader, ...g.members].filter(Boolean).map((m) => clean(m.name)).join('、'), info: [],
    pages: [page('', [
      ...(g.leader ? [['kv', clean(g.leader.title) || (g.members.length ? 'リーダー' : ''), clean(g.leader.name), clean(g.leader.url)]] : []),
      ...g.members.map((m) => ['kv', clean(m.title), clean(m.name), clean(m.url)]),
    ])],
  })),

  // Q&A は分類ごとに1件。質問が小見出し、答えが段落
  qa: (d) => (d.qa?.groups ?? []).map((g, i) => ({
    id: `qa-${i}`, title: clean(g.title), sub: `${g.items.length}件`, summary: first(g.items[0]?.q), info: [],
    pages: [page('', g.items.flatMap((x) => [...heading('h2', x.q), ...paragraphs(x.a)]))],
  })),

  // 二次創作ガイドラインは3つの欄をそれぞれ1件にする（空の欄は出さない）
  guideline: (d) => [['allowed', '許可される行為'], ['banned', '禁止される行為'], ['event', '公式イベントにおける制限']]
    .filter(([key]) => clean(d.guideline?.[key]))
    .map(([key, title]) => ({ id: `guideline-${key}`, title, sub: '', summary: first(d.guideline[key]), info: [], pages: [page('', paragraphs(d.guideline[key]))] })),

  // [年, 月, 日, 種類, 名前, タグ, 本文, 記事の種類, 記事の ID]。月・日が無ければ 0
  timeline: (d) => (d.timeline ?? []).map((e) => [e.year ?? 0, e.month ?? 0, e.day ?? 0, e.type, clean(e.name), clean(e.tag), clean(e.body),
    { birth: 'characters', organization: 'organizations', lore: 'lore' }[e.type] ?? '', e.id ?? '']),

  characters: (d) => (d.characters ?? []).map((c) => article(c, { title: clean(c.name), sub: clean(c.affiliation), summary: clean(c.summary), tag: clean(c.tag), performer: clean(c.performer) },
    [['演者', c.performer], ['性別', c.gender], ['身長', c.height], ['誕生日', birthday(c.birthday)], ['国籍', c.nationality], ['所属', c.affiliation], ['影響力（CL）', c.influence], ['特技', c.skills], ['好きなもの', c.likes], ['苦手なもの', c.dislikes]], [
      page('', [...(clean(c.overview) ? [['h', '概要'], ...paragraphs(c.overview)] : []), ...(c.cards ?? []).flatMap((x) => cardLines(x, x.type))]),
    ])),

  organizations: (d) => (d.organizations ?? []).map((x) => worldItem(x, [x.members && `構成人数 ${clean(x.members)}`, x.year && `${clean(x.year)}年設立`].filter(Boolean).join(' / '), [['構成人数', x.members], ['設立年', x.year]])),
  nations: (d) => (d.nations ?? []).map((x) => worldItem(x, x.population && `人口 ${clean(x.population)}`, [['人口', x.population]])),
  lore: (d) => (d.lore ?? []).map((x) => worldItem(x, x.year && `${clean(x.year)}年`, [['年代', x.year]])),

  // 本体がページ「Top」、Log が続く。危険度は "0" が危険度0、空文字が調査中（記事もページも同じ）
  disasters: (d) => (d.disasters ?? []).map((x) => {
    const body = (p) => [...(clean(p.overview) ? [['h', '概要'], ...paragraphs(p.overview)] : []), ...(p.cards ?? []).flatMap((c) => cardLines(c, c.title))]
    return article(x, { title: clean(x.name), sub: clean(x.number), summary: clean(x.note) || first(x.overview), number: clean(x.number), danger: clean(x.danger), category: clean(x.category), note: clean(x.note) },
      [['番号', x.number], ['タイプ', x.category], ['危険度', clean(x.danger) || '調査中']], [
        page('Top', [...body(x), ...(x.related ?? []).flatMap(linkOf)], { id: 'top', danger: clean(x.danger) }),
        ...(x.pages ?? []).map((p) => page(clean(p.name), body(p), { id: p.id, danger: clean(p.danger) })),
      ])
  }),

  stories: (d) => (d.stories ?? []).map((s) => article(s, { title: clean(s.title), sub: [clean(s.author), clean(s.date)].filter(Boolean).join(' / '), summary: clean(s.summary), author: clean(s.author), date: clean(s.date) }, [], [
    page('', [
      ...(s.warning ? [['note', clean(s.warning)]] : []),
      ...(s.blocks ?? []).flatMap((b) => {
        if (b.kind === 'dialogue') return [['say', clean(b.speaker), clean(b.text)]]
        if (b.kind === 'image') return b.image ? [['img', mediaKey(b.image), clean(b.caption)]] : []
        if (b.kind === 'divider') return [['hr']]
        if (b.kind === 'record') return [...heading('h2', b.title), ...paragraphs(b.body)]
        return paragraphs(b.body)
      }),
      ...(s.related ?? []).flatMap(linkOf),
    ]),
  ])),
}

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12)
// 記事ごとの rev（中身のハッシュ）。ワールドは前の版と比べて、足された・変わった・消えた記事を数える。年表は1行ずつが記事の代わり
const withRev = (kind, list) => (kind === 'timeline' ? list : list.map((x) => ({ ...x, rev: hash(JSON.stringify(x)) })))
// フォントに無い字が、どの記事に出てくるか（1字につき5件まで）
function glyphPlaces(lists, missing) {
  const places = {}
  for (const kind of KINDS) {
    for (const x of lists[kind]) {
      const text = JSON.stringify(x)
      const title = kind === 'timeline' ? clean(x[4]) : x.title
      const id = kind === 'timeline' ? '' : x.id
      for (const c of missing) if (text.includes(c) && (places[c] ??= []).length < 5) places[c].push([kind, id, title])
    }
  }
  return places
}
const bytes = (text) => Buffer.byteLength(text)

// 種類を順に枠へ詰める。1つの種類は分けない（1種類だけで上限を超えたら、その種類だけで1枠使う）
export function pack(sections, limit = PART_BYTES, slots = PART_SLOTS) {
  const parts = [[]]
  let size = 0
  for (const [kind, json] of sections) {
    if (parts.at(-1).length && size + bytes(json) > limit) {
      parts.push([])
      size = 0
    }
    parts.at(-1).push([kind, json])
    size += bytes(json)
  }
  if (parts.length > slots) throw new Error(`本文が ${slots} 枠に収まりません（${parts.length} 枠必要）`)
  return parts
}

// charset: ワールドのフォントに入っている文字（無ければ照合しない）
// previous: 配信中の目次。画像のマスを引き継ぐ（無ければ詰めて割り付ける）
export function buildWorld(data, { now = new Date(), charset = null, previous = null } = {}) {
  const lists = Object.fromEntries(KINDS.map((kind) => [kind, withRev(kind, CONVERT[kind](data))]))
  const packed = pack(KINDS.map((kind) => [kind, JSON.stringify(lists[kind])]))
  const files = {}
  const parts = Array(PART_SLOTS).fill('')
  const where = {}
  packed.forEach((sections, i) => {
    const body = sections.map(([kind, json]) => `${JSON.stringify(kind)}:${json}`).join(',')
    parts[i] = hash(body)
    sections.forEach(([kind]) => { where[kind] = i })
    files[`part-${i}.json`] = `{"rev":"${parts[i]}",${body}}`
  })
  const all = Object.keys(files).sort().map((name) => files[name]).join('')
  const chars = [...new Set(all)].filter((c) => c > ' ').sort().join('')
  const missing = charset ? [...chars].filter((c) => !charset.includes(c)) : []
  // 画像のシート。中身（マス → 名前）だけでハッシュを決めるので、描く前に目次の rev が決まる
  const { slots, dropped } = assign(imageNames(lists), previousSlots(previous?.images))
  const sheets = sheetsOf(slots)
  const sheetRevs = (list) => list.map((cells) => (cells ? hash(`${SHEET_VERSION}:${JSON.stringify(cells)}`) : ''))
  const thumbs = sheetRevs(sheets.thumb)
  const fulls = sheetRevs(sheets.full)
  const index = {
    schemaVersion: SCHEMA_VERSION,
    // rev は中身だけで決まる。配信側はこれが同じなら置き換えない（generatedAt だけの違いで読み直させない）
    rev: hash([...parts, ...thumbs, ...fulls].join('.')),
    generatedAt: new Date(now.getTime() + 9 * 3600e3).toISOString().replace(/\.\d+Z$/, '+09:00'),
    parts,
    // シートごとのハッシュ（空文字は未使用）。images は sheets.js が描いた後に入る
    thumbs,
    fulls,
    where,
    // 一覧に出す種類の順と名前。種類が増えてもワールドを作り直さずに済む
    kinds: KINDS.map((kind) => [kind, KIND_LABELS[kind]]),
    // 種類ごとの中身のハッシュ。変わった種類だけ一覧を差し替える
    kindRevs: Object.fromEntries(KINDS.map((kind) => [kind, hash(JSON.stringify(lists[kind]))])),
    counts: Object.fromEntries(KINDS.map((kind) => [kind, lists[kind].length])),
    bytes: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, bytes(text)])),
    missingGlyphs: missing.join(''),
    // 字 → [[種類, 記事の ID, 題]]。公式サイト編集のトップに出して直してもらう
    missingAt: glyphPlaces(lists, missing),
    // シートに入りきらなかった画像（ワールドでは画像なしで出る）
    droppedImages: dropped,
    // sheets.js が images に置き換える
    imageSlots: slots,
  }
  return { index, files: { ...files, 'index.json': JSON.stringify(index), 'chars.txt': chars } }
}

// previousUrl: 配信中の目次。REPACK=1 のときは読まずに、画像を詰め直す
async function main([source = 'https://vrcroa.net/data/public.json', out = '_site/v1', previousUrl = 'https://harushironeko.github.io/RoA_InformationStore/v1/index.json']) {
  const text = /^https?:/.test(source) ? await (await fetch(source)).text() : readFileSync(source, 'utf8')
  const data = JSON.parse(text)
  if (data.schemaVersion !== 1) throw new Error(`public.json の schemaVersion が ${data.schemaVersion} です（1 だけ扱えます）`)
  // charset.txt はワールドの本体フォントの収録文字、charset-fallback.txt は本体に無くてもフォールバックで出る字
  const read = (name) => {
    try {
      return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
    } catch {
      return null
    }
  }
  const main = read('charset.txt')
  const charset = main === null ? null : main + (read('charset-fallback.txt') ?? '')
  let previous = null
  if (process.env.REPACK !== '1') {
    try {
      const res = await fetch(previousUrl, { cache: 'no-store' })
      if (res.ok) previous = await res.json()
    } catch { /* 初回や通信の失敗では詰めて割り付ける */ }
  }
  const { index, files } = buildWorld(data, { charset, previous })
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(out, name), body)
  console.log(`rev ${index.rev}: ${Object.entries(index.counts).map(([k, n]) => `${k} ${n}`).join(' / ')}`)
  console.log(Object.entries(index.bytes).map(([name, n]) => `${name} ${(n / 1024).toFixed(1)}KB`).join(' / '))
  console.log(`画像 ${Object.keys(index.imageSlots).length} 枚（一覧用シート ${index.thumbs.filter(Boolean).length} 枚・詳細用 ${index.fulls.filter(Boolean).length} 枚）${previous ? '' : '、前の版を使わずに割り付け'}`)
  if (index.droppedImages.length) console.log(`シートに入りきらない画像: ${index.droppedImages.join(', ')}`)
  for (const [c, places] of Object.entries(index.missingAt)) console.log(`フォントに無い字 ${c}（U+${c.codePointAt(0).toString(16).toUpperCase()}）: ${places.map(([kind, , title]) => `${kind}「${title}」`).join('、')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}

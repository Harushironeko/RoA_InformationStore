import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildWorld, clean, KINDS, mediaKey, pack, paragraphs, PART_SLOTS } from './build.js'

const MEDIA = 'https://media.vrcroa.net/00000000-0000-4000-8000-000000000000'
const empty = { schemaVersion: 1, nations: [], organizations: [], lore: [], disasters: [], characters: [], stories: [], timeline: [], contents: [], news: [], qa: null, guideline: null, staff: null }
const part = (data, kind) => JSON.parse(buildWorld({ ...empty, ...data }).files['part-0.json'])[kind]
const body = (data, kind) => part(data, kind)[0].pages[0].body

describe('文字の整形', () => {
  it('< を全角にし、改行をそろえ、全角の字下げは残す', () => {
    assert.equal(clean(' <b>a</b>\r\nb \n'), '＜b>a＜/b>\nb')
    assert.equal(clean('　　：'), '　　：')
    assert.equal(clean(null), '')
  })
  it('画像は置き場のファイル名で指す', () => assert.equal(mediaKey(`${MEDIA}.webp`), '00000000-0000-4000-8000-000000000000.webp'))
  it('長い文章を改行の位置で分ける', () => {
    assert.deepEqual(paragraphs('aaa\nbbb\nccc', 7), [['p', 'aaa\nbbb'], ['p', 'ccc']])
    assert.deepEqual(paragraphs('abcdefgh', 3), [['p', 'abc'], ['p', 'def'], ['p', 'gh']])
    assert.deepEqual(paragraphs('一\n\n二'), [['p', '一\n\n二']])
    assert.deepEqual(paragraphs(''), [])
  })
})

describe('枠への割り付け', () => {
  it('上限を超えたら次の枠へ送る', () => {
    const parts = pack([['a', 'x'.repeat(60)], ['b', 'x'.repeat(60)], ['c', 'x'.repeat(10)]], 100)
    assert.deepEqual(parts.map((p) => p.map(([kind]) => kind)), [['a'], ['b', 'c']])
  })
  it('1種類だけで上限を超えても、その種類で1枠使う', () => {
    assert.deepEqual(pack([['a', 'x'.repeat(500)], ['b', 'x']], 100).map((p) => p.length), [1, 1])
  })
  it('枠が足りなければ止める', () => assert.throws(() => pack([['a', 'xx'], ['b', 'xx'], ['c', 'xx']], 1, 2), /枠に収まりません/))
})

describe('目次', () => {
  it('全種類の場所と件数を持ち、未使用の枠は空文字', () => {
    const { index, files } = buildWorld(empty, { now: new Date('2026-11-26T00:00:00Z') })
    assert.deepEqual(Object.keys(index.where), KINDS)
    assert.equal(index.parts.length, PART_SLOTS)
    assert.equal(index.parts.filter(Boolean).length, 1)
    assert.equal(index.generatedAt, '2026-11-26T09:00:00+09:00')
    assert.equal(JSON.parse(files['part-0.json']).rev, index.parts[0])
    assert.deepEqual(JSON.parse(files['index.json']), index)
  })
  it('中身が同じなら時刻が違っても rev は同じ、変われば変わる', () => {
    const a = buildWorld(empty, { now: new Date(1) }).index
    const b = buildWorld(empty, { now: new Date(2) }).index
    const c = buildWorld({ ...empty, news: [{ id: 'n', title: 't', date: '', body: '', link: '' }] }).index
    assert.equal(a.rev, b.rev)
    assert.notEqual(a.rev, c.rev)
  })
  it('フォントに無い字を挙げる', () => {
    const data = { ...empty, news: [{ id: 'n', title: '杖', date: '', body: '', link: '' }] }
    const { files } = buildWorld(data)
    assert.equal(buildWorld(data, { charset: files['chars.txt'] }).index.missingGlyphs, '')
    assert.equal(buildWorld(data, { charset: files['chars.txt'].replace('杖', '') }).index.missingGlyphs, '杖')
  })
})

describe('種類ごとの変換', () => {
  it('ニュース', () => {
    const [n] = part({ news: [{ id: 'n1', title: '告知', date: '2026-11-20', body: '一行目\n二行目', link: 'https://example.com/' }] }, 'news')
    assert.deepEqual({ id: n.id, title: n.title, sub: n.sub, summary: n.summary }, { id: 'n1', title: '告知', sub: '2026-11-20', summary: '一行目' })
    assert.deepEqual(n.pages[0].body, [['p', '一行目\n二行目'], ['url', 'リンク', 'https://example.com/']])
  })

  it('公式コンテンツは空の項目を出さない', () => {
    const [c] = part({ contents: [{ id: 'c', kind: 'event', name: '催し', summary: '', mainImage: '', images: [], state: '開催中', platform: '', schedule: '隔週', time: '', instance: '', howto: '来てください' }] }, 'contents')
    assert.deepEqual(c.info, [['状態', '開催中'], ['開催日程', '隔週']])
    assert.deepEqual(c.pages[0].body, [['h', '参加方法'], ['p', '来てください']])
    assert.equal('image' in c, false)
  })

  it('クレジットはリーダーの肩書を補う', () => {
    const person = (name, title = '') => ({ name, title, url: '' })
    const staff = { groups: [{ name: '制作', namesOnly: false, leader: person('甲'), members: [person('乙', '美術')] }, { name: '協力', namesOnly: true, leader: null, members: [person('丙')] }] }
    const list = part({ staff }, 'staff')
    assert.deepEqual(list[0].pages[0].body, [['kv', 'リーダー', '甲', ''], ['kv', '美術', '乙', '']])
    assert.deepEqual(list[1].pages[0].body, [['kv', '', '丙', '']])
  })

  it('Q&A は分類ごと、ガイドラインは欄ごとに1件', () => {
    const qa = { groups: [{ title: '世界観', items: [{ q: '国は作れますか？', a: 'お控えください。' }, { q: '二問目', a: '答え' }] }] }
    const [g] = part({ qa }, 'qa')
    assert.deepEqual({ id: g.id, title: g.title, sub: g.sub, summary: g.summary }, { id: 'qa-0', title: '世界観', sub: '2件', summary: '国は作れますか？' })
    assert.deepEqual(g.pages[0].body, [['h2', '国は作れますか？'], ['p', 'お控えください。'], ['h2', '二問目'], ['p', '答え']])
    const list = part({ guideline: { allowed: '自由です', banned: '', event: '制限あり' } }, 'guideline')
    assert.deepEqual(list.map((x) => [x.id, x.title, x.pages[0].body]), [['guideline-allowed', '許可される行為', [['p', '自由です']]], ['guideline-event', '公式イベントにおける制限', [['p', '制限あり']]]])
    assert.deepEqual(part({}, 'qa'), [])
    assert.deepEqual(part({}, 'guideline'), [])
  })

  it('年表は月・日が無ければ 0、元の記事を指す', () => {
    const timeline = [{ type: 'birth', id: 'c1', name: '甲', year: 2019, month: null, day: null }, { type: 'event', name: '開戦', tag: '戦争', body: '本文', year: 2036, month: 9, day: 1 }]
    assert.deepEqual(part({ timeline }, 'timeline'), [[2019, 0, 0, 'birth', '甲', '', '', 'characters', 'c1'], [2036, 9, 1, 'event', '開戦', '戦争', '本文', '', '']])
  })

  it('キャラクターは演者と基本情報、カードを出す', () => {
    const character = { id: 'c1', name: '甲', tag: 'RoA職員', performer: '演者', summary: '概要', mainImage: `${MEDIA}.webp`, gender: '', height: '170cm', birthday: '2019-03-03', nationality: '', affiliation: 'RoA (総務部)', influence: '', skills: '', likes: '', dislikes: '', overview: '詳しい概要', cards: [{ type: '性格', body: '明るい', contents: [] }] }
    const [c] = part({ characters: [character] }, 'characters')
    assert.equal(c.performer, '演者')
    assert.equal(c.sub, 'RoA (総務部)')
    assert.equal(c.image, '00000000-0000-4000-8000-000000000000.webp')
    assert.deepEqual(c.info, [['演者', '演者'], ['身長', '170cm'], ['誕生日', '2019年3月3日'], ['所属', 'RoA (総務部)']])
    assert.deepEqual(c.pages[0].body, [['h', '概要'], ['p', '詳しい概要'], ['h', '性格'], ['p', '明るい']])
  })

  it('誕生年だけのキャラクター', () => {
    const [c] = part({ characters: [{ id: 'c', name: '甲', birthday: '1939', cards: [] }] }, 'characters')
    assert.deepEqual(c.info, [['誕生日', '1939年']])
  })

  it('国家は札の位置を持ち、節とカードを並べる', () => {
    const nation = { id: 'n', name: '甲国', summary: '概要', population: '約5億', pin: { x: 0.9, y: 0.7 }, sections: [{ tab: '文化', cards: [{ type: '食', title: '料理', description: '説明', contents: [{ kind: 'text', title: '主食', body: '米' }, { kind: 'region', title: '地図', crop: null, shapes: [] }] }] }] }
    const [n] = part({ nations: [nation] }, 'nations')
    assert.deepEqual(n.pin, [0.9, 0.7])
    assert.equal(n.sub, '人口 約5億')
    assert.deepEqual(n.pages[0].body, [['tab', '文化'], ['h', '料理'], ['p', '説明'], ['h2', '主食'], ['p', '米']])
  })

  it('根源災害は Top と Log に分け、子要素と演出を行にする', () => {
    const scene = { kind: 'auth', title: '警告', lines: ['一', '二'], button: '閲覧する', lines2: ['三'], interval: 500, delay: 0, inline: false, audio: `${MEDIA}.mp3`, after: 'reveal' }
    const contents = [
      { kind: 'dialogue', title: '記録', lines: [{ type: 'line', speaker: '甲', text: 'やあ' }, { type: 'direction', speaker: '', text: '沈黙' }] },
      { kind: 'experiment', fields: [{ label: '対象', text: '乙' }] },
      { kind: 'diary', title: '', entries: [{ date: '1日', text: '晴れ' }] },
      { kind: 'steps', title: '', items: ['開ける', '閉める'] },
      { kind: 'image', title: '', image: `${MEDIA}.webp`, caption: '写真' },
      { kind: 'audioFile', title: '音声', audio: `${MEDIA}.mp3`, caption: '' },
      { kind: 'reference', title: '', label: 'Alc-1 何か', name: 'Alc-1 何か', href: '/disasters/d2/' },
    ]
    const disaster = { id: 'd1', category: '根源事象', number: 'Alcase-12', danger: '', name: '妄信', note: '注意', overview: '概要文', related: [{ name: '甲国', href: '/nations/n/' }], cards: [{ type: '記録', title: '記録 1', body: '本文', gate: 'CL3以上', before: [{ kind: 'scene', scene }], contents }], pages: [{ id: 'log-1', name: 'Log-1', danger: '15', overview: '', cards: [{ type: '通達', title: '通達', body: '過去', contents: [] }] }] }
    const [d] = part({ disasters: [disaster] }, 'disasters')
    assert.deepEqual(d.info, [['番号', 'Alcase-12'], ['タイプ', '根源事象'], ['危険度', '調査中']])
    assert.equal(d.summary, '注意')
    assert.deepEqual(d.pages.map((p) => [p.id, p.name, p.danger]), [['top', 'Top', ''], ['log-1', 'Log-1', '15']])
    assert.deepEqual(d.pages[0].body, [
      ['h', '概要'], ['p', '概要文'],
      ['h', '記録 1'], ['gate', 'CL3以上'],
      ['scene', 'auth', '警告', '閲覧する', '一\n二', '三', 'reveal', '', '00000000-0000-4000-8000-000000000000.mp3', '500', '0'],
      ['p', '本文'],
      ['h2', '記録'], ['say', '甲', 'やあ'], ['dir', '沈黙'],
      ['kv', '対象', '乙'],
      ['kv', '1日', '晴れ'],
      ['li', '1', '開ける'], ['li', '2', '閉める'],
      ['img', '00000000-0000-4000-8000-000000000000.webp', '写真'],
      ['audio', '00000000-0000-4000-8000-000000000000.mp3', '音声', ''],
      ['link', 'Alc-1 何か', 'disasters', 'd2'],
      ['link', '甲国', 'nations', 'n'],
    ])
    assert.deepEqual(d.pages[1].body, [['h', '通達'], ['p', '過去']])
  })

  it('物語はブロックを行にし、閲覧注意を先頭に置く', () => {
    const story = { id: 's', title: '題', summary: 'あらすじ', author: '著者', date: '2026-11-05', warning: '注意', related: [], blocks: [{ kind: 'text', body: '本文' }, { kind: 'dialogue', speaker: '甲', text: '台詞' }, { kind: 'divider' }, { kind: 'record', title: '記録', body: '中身' }, { kind: 'image', image: '', caption: '' }] }
    assert.equal(part({ stories: [story] }, 'stories')[0].sub, '著者 / 2026-11-05')
    assert.deepEqual(body({ stories: [story] }, 'stories'), [['note', '注意'], ['p', '本文'], ['say', '甲', '台詞'], ['hr'], ['h2', '記録'], ['p', '中身']])
  })

  it('行の要素はすべて文字列', () => {
    const { files } = buildWorld({ ...empty, disasters: [{ id: 'd', name: 'n', cards: [{ title: 't', body: 'b', contents: [{ kind: 'scene', scene: { kind: 'error', lines: [], lines2: [] } }] }] }] })
    for (const line of JSON.parse(files['part-0.json']).disasters[0].pages[0].body) for (const v of line) assert.equal(typeof v, 'string')
  })
})

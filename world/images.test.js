import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assign, capacity, cellOf, imageNames, LAYOUTS, PAD, previousSlots, SHEET, sheetsOf, slotOf, uvOf } from './images.js'

const names = (n) => Array.from({ length: n }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000.webp`)
const uvs = (slots, size = [100, 50]) => Object.fromEntries(Object.entries(slots).map(([name, s]) => [name, [...uvOf(LAYOUTS.thumb, s.thumb, ...size), ...uvOf(LAYOUTS.full, s.full, ...size)]]))

describe('画像の名前', () => {
  it('記事の画像と img 行を、出てくる順に重複なく集める', () => {
    const lists = {
      timeline: [[2020, 1, 0, 'event', 'x', '', '', '', '']],
      characters: [{ image: 'a.webp', pages: [{ body: [['p', 'x'], ['img', 'b.webp', '']] }] }, { pages: [{ body: [['img', 'a.webp', '']] }] }],
      stories: [{ image: 'c.png', pages: [{ body: [] }] }],
    }
    assert.deepEqual(imageNames(lists), ['a.webp', 'b.webp', 'c.png'])
  })
})

describe('マスの位置', () => {
  it('一覧用は8列、詳細用は2列で、シートをまたいで数える', () => {
    assert.deepEqual(cellOf(LAYOUTS.thumb, 9), { sheet: 0, x: 256, y: 256 })
    assert.deepEqual(cellOf(LAYOUTS.thumb, 64), { sheet: 1, x: 0, y: 0 })
    assert.deepEqual(cellOf(LAYOUTS.full, 7), { sheet: 1, x: 1024, y: 1024 })
  })
  it('UV は左下が原点で、縁の分だけ内側', () => {
    const [sheet, u, v, w, h] = uvOf(LAYOUTS.full, 0, 1020, 510)
    assert.equal(sheet, 0)
    assert.equal(u, Math.round(PAD / SHEET * 1e5) / 1e5)
    assert.equal(v, Math.round((1 - (PAD + 510) / SHEET) * 1e5) / 1e5)
    assert.equal(w, Math.round(1020 / SHEET * 1e5) / 1e5)
    assert.equal(h, Math.round(510 / SHEET * 1e5) / 1e5)
  })
  it('UV からマスの番号を取り戻せる', () => {
    for (const [layout, size] of [[LAYOUTS.thumb, [252, 100]], [LAYOUTS.thumb, [40, 252]], [LAYOUTS.full, [1020, 1020]], [LAYOUTS.full, [300, 700]]]) {
      for (const slot of [0, 1, 5, capacity(layout) - 1]) assert.equal(slotOf(layout, uvOf(layout, slot, ...size)), slot)
    }
  })
})

describe('割り付け', () => {
  it('前の版が無ければ出てくる順に詰める', () => {
    const { slots, dropped } = assign(names(3))
    assert.deepEqual(Object.values(slots), [{ thumb: 0, full: 0 }, { thumb: 1, full: 1 }, { thumb: 2, full: 2 }])
    assert.deepEqual(dropped, [])
  })

  it('前の版のマスを引き継ぎ、新しい画像は空きの若い順に入れる', () => {
    const [a, b, c, d] = names(4)
    const first = assign([a, b, c]).slots
    // b を外し、d を足す。a と c はそのまま、d は b のいたマスに入る
    const { slots } = assign([d, a, c], previousSlots(uvs(first)))
    assert.deepEqual(slots[a], first[a])
    assert.deepEqual(slots[c], first[c])
    assert.deepEqual(slots[d], first[b])
  })

  it('入りきらない画像は外す', () => {
    const list = names(capacity(LAYOUTS.thumb) + 2)
    const { slots, dropped } = assign(list)
    assert.equal(Object.keys(slots).length, capacity(LAYOUTS.thumb))
    assert.deepEqual(dropped, list.slice(-2))
  })

  it('壊れた前の版は無視する', () => {
    const [a] = names(1)
    assert.deepEqual(assign([a], previousSlots({ [a]: [1, 2, 3] })).slots[a], { thumb: 0, full: 0 })
  })
})

describe('シートの中身', () => {
  it('シートごとにマス → 名前を持ち、使わないシートは null', () => {
    const list = names(5)
    const sheets = sheetsOf(assign(list).slots)
    assert.equal(sheets.thumb.length, 2)
    assert.equal(sheets.full.length, 32)
    assert.deepEqual(sheets.thumb[0], Object.fromEntries(list.map((n, i) => [i, n])))
    assert.equal(sheets.thumb[1], null)
    assert.deepEqual(Object.keys(sheets.full[1]), ['0'])
    assert.equal(sheets.full[2], null)
  })
})

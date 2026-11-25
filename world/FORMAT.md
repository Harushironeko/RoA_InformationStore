# ワールド用データの形式（v1）

公式サイトの公開データを、VRChat のワールドが String Loading で読む形に直したもの。`world/build.js` が作り、`.github/workflows/world.yml` が GitHub Pages に出す。
中身は公式サイトで公開済みの情報だけで、文章はすべてプレーンテキスト（`<` は全角の `＜` に置き換え済み、改行は `\n`）。

## URL

`https://harushironeko.github.io/RoA_InformationStore/v1/` の下に置く。ワールドにはこの固定の URL を先に登録する。

| ファイル | 本数 | 中身 |
| --- | --- | --- |
| `index.json` | 1 | 目次。更新の確認はこれだけを読む（約0.5KB） |
| `part-0.json` 〜 `part-7.json` | 8 | 本文の枠。使っていない枠はファイルが無い（404） |
| `chars.txt` | 1 | 全文に出てくる文字の一覧。フォントの確認用で、ワールドからは読まない |
| `thumb-0〜1.jpg` / `full-00〜31.jpg` | 34 | 画像のシート。**未実装**（URL の枠だけ先に決めてある） |

形式を互換性なく変えるときは `v2/` を作り、`v1/` は残す。

## index.json

```json
{
  "schemaVersion": 1,
  "rev": "1ccd44e191b3",
  "generatedAt": "2026-11-26T04:04:55+09:00",
  "parts": ["02b41871701b", "", "", "", "", "", "", ""],
  "thumbs": [],
  "fulls": [],
  "where": { "news": 0, "contents": 0, "staff": 0, "qa": 0, "guideline": 0, "timeline": 0, "characters": 0,
             "organizations": 0, "nations": 0, "lore": 0, "disasters": 0, "stories": 0 },
  "counts": { "news": 0, "contents": 2, "staff": 0, "qa": 3, "guideline": 3, "timeline": 49, "characters": 38,
              "organizations": 6, "nations": 8, "lore": 1, "disasters": 10, "stories": 4 },
  "bytes": { "part-0.json": 188842 },
  "missingGlyphs": ""
}
```

- `schemaVersion` — 1 以外なら読まずに、同梱のスナップショットのまま表示する
- `rev` — 本文全体のハッシュ。前に読んだ値と同じなら何も読み直さない
- `generatedAt` — 作った時刻（日本時間）。「○月○日 ○時の版」の表示用。`rev` が同じ間は変わらない
- `parts[i]` — `part-i.json` のハッシュ。空文字は未使用。持っている値と違う枠だけ読み直す
- `where[種類]` — その種類が入っている枠の番号。**種類と枠の対応は書き出しのたびに変わりうる**ので、決め打ちしない
- `counts[種類]` — 件数。「新着あり」の表示用
- `bytes` — 各ファイルの大きさ
- `missingGlyphs` — `world/charset.txt`（ワールドのフォントに入っている文字）を置いたとき、そこに無い文字が入る

## part-N.json

```json
{ "rev": "02b41871701b", "news": [...], "contents": [...], "characters": [...] }
```

- `rev` は目次の `parts[N]` と同じ値。**違っていたら表示を変えず、60秒後に取り直す**（配信の切り替わりで、目次だけ新しく本文が古い瞬間がある）
- 残りのキーは種類（`where` でこの枠に割り当てられたもの）。値は記事の配列で、並び順は公式サイトと同じ
- 1つの種類が複数の枠に分かれることは無い

## 記事（timeline 以外の11種類で共通）

```json
{
  "id": "Y1aglpZdSIpIZrxJonKH",
  "title": "AIC33(アイシー)",
  "sub": "RodofAsclepius (総務部 元ティルカルテル)",
  "summary": "アンダーグラウンドで注目を集めるドリルラッパー。…",
  "image": "2a1e99e1-09f1-44f0-9928-3c0788b4358e.webp",
  "info": [["演者", "yukuru04"], ["性別", "男性"], ["身長", "170cm"]],
  "pages": [{ "name": "", "body": [["h", "概要"], ["p", "…"]] }]
}
```

- 一覧は `title`・`sub`・`summary` の3つで作れる。詳細は `info`（見出しと値の組。空の項目は入らない）と `pages`
- `image` は画像の名前（置き場のファイル名）。画像が無い記事には `image` が無い。シートが入るまでは使えない
- `pages` は必ず1つ以上。根源災害だけ複数（`Top` と Log）で、ページに `id` と `danger` が付く。ほかの種類は `name` が空の1ページ
- 種類ごとに足される項目

| 種類 | `title` | `sub` | 足される項目 |
| --- | --- | --- | --- |
| `news` ニュース | 題 | 日付 `YYYY-MM-DD` | — |
| `contents` 公式コンテンツ | 名前 | 状態（開催中 など） | `kind`: `event` / `world` / `other` |
| `staff` クレジット | 班の名前 | 空 | —（人は `body` の `kv` 行） |
| `qa` Q&A | 分類の名前 | 件数 | —（質問が `h2`、答えが `p`） |
| `guideline` 二次創作ガイドライン | 欄の名前（許可される行為 など） | 空 | — |
| `characters` キャラクター | 名前 | 所属 | `tag`、`performer`（演者名） |
| `organizations` 組織 | 名前 | 構成人数 / 設立年 | — |
| `nations` 国家 | 名前 | 人口 | `pin`: `[x, y]`（地図 `world.webp` 上の 0〜1 の位置。無い国もある） |
| `lore` 社会 | 名前 | 年代 | — |
| `disasters` 根源災害 | 名前 | 番号（`Alc-330` など） | `number`、`danger`（空は調査中）、`category`、`note`（一覧の注意書き） |
| `stories` 物語 | 題 | 著者 / 公開日 | `author`、`date` |

## 本文の行（`pages[].body`）

行は `[種類, 文字列, …]` の配列で、**要素はすべて文字列**。上から順に部品を置けば記事になる。知らない種類の行は読み飛ばす（後から種類が増えても古いワールドが壊れないように）。
1つの文字列は 2,000字以下（長い文章は書き出し側で複数の `p` に分けてある）。

| 行 | 意味 |
| --- | --- |
| `["tab", 名前]` | 大きな区切り（国家・組織・社会の「政治・軍事」「文化」など） |
| `["h", 文字]` | 見出し（カードの題） |
| `["h2", 文字]` | 小見出し（カードの中の項目の題） |
| `["p", 文字]` | 段落。中に `\n` を含む |
| `["say", 話者, 台詞]` | 台詞。話者は空のことがある |
| `["dir", 文字]` | ト書き |
| `["kv", 見出し, 値]` | 見出しと値（実験記録の項目、日記の日付と本文）。クレジットでは `["kv", 肩書, 名前, URL]` |
| `["li", 番号, 文字]` | 手順の1項目。番号は `"1"` から |
| `["img", 画像の名前, 説明文]` | 画像。シートが入るまでは説明文だけ出すか、読み飛ばす |
| `["audio", 音声の名前, 題, 説明文]` | 音声の添付。ワールドに同梱した同じ名前の音声があれば再生ボタンを出し、無ければ読み飛ばす |
| `["hr"]` | 区切り線 |
| `["note", 文字]` | 注意書き（物語の閲覧注意） |
| `["gate", 文字]` | 閲覧制限の表示（「CL3以上」など）。飾りで、実際には隠さない |
| `["link", 名前, 種類, ID]` | 別の記事へのリンク。種類は `where` のキーと同じ |
| `["url", 名前, URL]` | 外部リンク。ワールドでは文字として出す |
| `["scene", …]` | 演出。下記。再現しないなら読み飛ばせば、続きの本文がそのまま出る |

### 演出の行

```
["scene", kind, title, button, lines, lines2, after, page, audio, interval, delay]
```

- `kind` — `auth`（認証）/ `error`（エラー）/ `interrupt`（割り込み）/ `transition`（遷移）
- `title`・`button` — 画面の題とボタンの文字
- `lines` — ボタンを押す前に出す文。`\n` 区切りで1行ずつ出す
- `lines2` — ボタンを押した後に出す文。同じく `\n` 区切り
- `after` — 終わった後。`reveal`（続きの本文を出す）/ `link`（`page` のページへ移る）/ `disconnect`（切断の表示で止める）
- `page` — 移動先のページの `id`（同じ記事の `pages[].id`）
- `audio` — 一緒に鳴らす音声の名前（無ければ空）
- `interval` — 1行を出す間隔（ミリ秒、文字列）。`delay` — 始まるまでの待ち（ミリ秒、文字列）

## 年表（`timeline`）

記事ではなく、1件1行の配列。年の古い順。

```json
[1958, 6, 11, "birth", "逢魔幻斎", "", "", "characters", "rKBoqirdCY2qGS8tlLsj"]
```

`[年, 月, 日, 種類, 名前, タグ, 本文, 記事の種類, 記事の ID]`。年・月・日は数値で、月・日が分からなければ 0。
種類は `event`（出来事）/ `birth`（誕生）/ `organization`（設立）/ `lore`。誕生・設立・lore は元の記事を指す（`event` は空）。
RoA の「現在」は現実の13年後。

## 公式サイトにあってワールド用に入れていないもの

- 画像のトリミング指定、区域の地図（`region`）、カードの見た目（コンソール風・報告書風など）と文字の乱れ（`glitch` / `delay`）
- ニュースの埋め込み（YouTube / X）。URL は `url` 行で出す

## 手元で作る

```sh
npm test
node world/build.js https://vrcroa.net/data/public.json _site/v1
```

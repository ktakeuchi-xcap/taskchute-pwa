# Taskchute PWA

タスクシュート方式の個人タスク管理ツールを、モダンな技術スタックで再構築するプロジェクト。

現行 Google Apps Script (GAS) 版を置き換える後継アプリケーションの設計・実装を行う。サーバーコスト ¥0、Google 公式 API を直接利用する PWA として構築する。

---

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロジェクト名 | Taskchute PWA |
| プロジェクトコード | tcp |
| 開始日 | 2026-05-19 |
| オーナー | 竹内（k.takeuchi@xcap.co.jp） |
| 形態 | 個人開発・個人利用 |
| 予算 | ¥0（金銭コストゼロ） |

---

## ドキュメント

レビュー時はこの順序で読むと全体像が把握できる。

| # | ドキュメント | 内容 |
|---|--------|------|
| 0 | [README.md](./README.md) | プロジェクト概要（本文書） |
| 1 | [docs/01_要件定義書.md](./docs/01_要件定義書.md) | 背景・スコープ・機能要件・非機能要件 |
| 2 | [docs/02_機能仕様書.md](./docs/02_機能仕様書.md) | 画面一覧・画面遷移・機能詳細 |
| 3 | [docs/03_アーキテクチャ設計書.md](./docs/03_アーキテクチャ設計書.md) | 技術スタック・システム構成・認証 |
| 4 | [docs/04_データモデル設計書.md](./docs/04_データモデル設計書.md) | データ定義・型・API契約 |
| 5 | [docs/05_テスト計画書.md](./docs/05_テスト計画書.md) | テスト戦略・主要ケース |
| 6 | [docs/06_開発計画書.md](./docs/06_開発計画書.md) | マイルストーン・WBS・移行計画 |

---

## 主要機能（現行GASからの継承＋新規）

### 継承
- タスクの追加・開始・終了（タスクシュート方式の時間追跡）
- Google Calendar との双方向同期（タスク = カレンダーイベント）
- 確認待ちタスクの管理（Google ToDo 連携）
- ルーチンタスクの週次自動生成
- カテゴリマスタ管理

### 新規
- リアルタイムタイマー（経過時間・進捗バー・見積超過警告）
- PWA 化（モバイルでホーム画面に追加可能）
- オフライン対応（IndexedDB キャッシュ）
- 楽観的更新による即応 UI
- 型安全（TypeScript 全面採用）
- 自動テスト（Vitest + Playwright）

---

## 技術スタック（概要）

```
フロントエンド : React 18 + TypeScript 5 + Vite 5
UI           : Tailwind CSS 3 + shadcn/ui
状態管理      : TanStack Query 5 (サーバー状態) + Zustand 4 (UI状態)
認証         : Google Identity Services (OAuth 2.0 implicit + silent renewal)
データ        : Google Sheets API v4 (既存シート流用) + IndexedDB cache
外部連携      : Google Calendar API v3, Google Tasks API v1
PWA          : vite-plugin-pwa (Workbox)
テスト        : Vitest + Testing Library + Playwright
ホスティング   : GitHub Pages または Cloudflare Pages (いずれも無料)
```

詳細は [docs/03_アーキテクチャ設計書.md](./docs/03_アーキテクチャ設計書.md) を参照。

---

## ディレクトリ構造（予定）

```
taskchute-pwa/
├── README.md                # 本文書
├── docs/                    # 設計ドキュメント
│   ├── 01_要件定義書.md
│   ├── 02_機能仕様書.md
│   ├── 03_アーキテクチャ設計書.md
│   ├── 04_データモデル設計書.md
│   ├── 05_テスト計画書.md
│   └── 06_開発計画書.md
├── src/                     # 実装（次フェーズで作成）
├── tests/                   # E2E テスト
└── public/                  # 静的アセット
```

---

## 開発フェーズ

| Phase | 内容 | ステータス |
|-------|------|----------|
| 0. 設計レビュー | 本ドキュメント一式の作成・承認 | **完了** |
| 1. 環境構築 | Vite + React + TS + Tailwind スキャフォールド | **完了** |
| 2. 認証実装 | Google OAuth 接続・スコープ取得 | 未着手 |
| 3. コア機能 | タスク CRUD + タスクシュート（開始/終了） | 未着手 |
| 4. 同期機能 | Calendar/Tasks 同期 + ルーチン生成 | 未着手 |
| 5. PWA 化 | Service Worker・オフライン・インストール対応 | 未着手 |
| 6. テスト | 単体・結合・E2E | 未着手 |
| 7. デプロイ | 本番環境へのリリース・移行 | 未着手 |

---

## ローカル開発

```bash
npm install         # 初回のみ
npm run dev         # http://localhost:5173 で起動（自分のPCのみ）
npm run typecheck   # tsc -b --noEmit
npm run lint        # ESLint
npm run test        # Vitest
npm run build       # 本番ビルド
```

---

## スマホ実機テスト（開発時）

スマホからアプリの動作を確認する方法は 2 種類。用途で使い分ける。

### 方法 1: 同一 Wi-Fi の LAN 直アクセス（UIだけ見たいとき）

```bash
npm run lan-ip      # 例: 192.168.1.42
npm run dev:host    # 0.0.0.0:5173 で起動
```

スマホで `http://192.168.1.42:5173/` を開く。

**制約**: HTTPS ではないため Google OAuth は動作しない。UI レイアウト・タッチ操作の確認のみ。

### 方法 2: Cloudflare Tunnel で HTTPS 経由（OAuth テストもしたいとき）

事前に `cloudflared` を入れる（無料、Cloudflare アカウント不要）：

```bash
brew install cloudflared
```

2 つのターミナルで並行起動：

```bash
# Terminal A
npm run dev

# Terminal B
npm run dev:tunnel
# → https://xxxx-xxxx.trycloudflare.com が発行される
```

スマホでその URL を開く。OAuth 動作確認可。

> **注意**: 起動のたびにトンネル URL が変わるため、Google Cloud Console の「承認済みの JavaScript 生成元」に毎回追加する必要がある。本格的な実機 OAuth テストは M7 デプロイ後の GitHub Pages URL を使うのが楽。

### PWA としてインストール

- **iOS Safari**: 共有ボタン →「ホーム画面に追加」
- **Android Chrome**: メニュー →「アプリをインストール」

各フェーズの詳細は [docs/06_開発計画書.md](./docs/06_開発計画書.md) を参照。

---

## 重要な前提・注意

- **Google Drive 同期の取り扱い**: コード実装フェーズに入る前に、本プロジェクトを Google Drive 同期対象外のディレクトリ（例：`~/dev/taskchute-pwa/`）へ移動する。`node_modules` の大量小ファイルが Drive 同期を圧迫するため。
- **OAuth クライアント ID**: 実装フェーズ開始時に Google Cloud Console で OAuth 2.0 クライアント ID（Web アプリケーション型）を発行する必要がある。
- **GAS 版との並行稼働**: 移行期間中は GAS 版と新版を並行稼働可能。データは同一スプレッドシートを参照するため、いつでも切り戻し可能。

---

## 改訂履歴

| 日付 | バージョン | 内容 | 担当 |
|------|----------|------|------|
| 2026-05-19 | 0.1 | 初版作成・設計レビュー用 | 竹内 |
| 2026-05-19 | 0.2 | M1 環境構築完了。スマホ要件を必須化、実機テスト手順追加 | 竹内 |

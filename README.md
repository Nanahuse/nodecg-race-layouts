# nodecg-race-layouts

RTAレース運営用のNodeCGバンドルです。Race Controlダッシュボード、Player Mappingダッシュボード、レース状態およびSpeedrun.com連携、スプレッドシート保存、OBS向けGraphicsを提供します。

レース当日の操作手順とスプレッドシートの設定は、[オペレーターガイド](docs/operator-guide.md)を参照してください。

## 概要

このバンドルでは、編集中のレース情報をDraft、現在放送に反映されている情報をActiveとして分離します。RaceTime.ggのレースを読み込み、参加者とカテゴリを確認し、Speedrun.com Snapshotを更新してから、準備完了したDraftをBroadcastへApplyします。DashboardからReplicantを直接変更せず、NodeCGのMessage APIを通じて操作します。

主なディレクトリ:

```text
src/domain/       レース、Player、検証、投影のドメインロジック
src/extension/    NodeCGサービス、Message handler、外部連携
src/replicants/   Replicant名、型、安全な初期値、宣言
src/protocol/     共有Message contract
ui/dashboard/     Race Control / Player Mappingパネル
ui/graphics/      Race / Participants / Leaderboard / Result Graphics
schemas/          Replicantから生成されたJSON Schema
test/             単体・統合フロー・Schemaテスト
```

## 必要環境

- Node.js 24以降（`.node-version` / `.nvmrc`を参照）
- npm
- NodeCG 2.xホスト（このリポジトリはバンドルであり、NodeCGサーバー本体は含みません）
- Player、Category、RaceHistoryのスプレッドシート連携を使う場合は、Google SpreadsheetとGoogle Application Default Credentials

## クイックスタート

1. NodeCG 2.xホストを別途インストールまたは用意します。
2. このリポジトリをNodeCGのバンドルとして配置します。例: `nodecg/bundles/nodecg-race-layouts`
3. バンドルのディレクトリで依存関係をインストールし、すべての成果物をビルドします。

   ```sh
   npm ci
   npm run build
   ```

   `npm run build`はExtensionを`dist/`へ出力し、Dashboardパネルと4種類のGraphicsを生成します。生成物はGit管理対象外です。

4. `config.example.json`をNodeCGホストの`cfg/nodecg-race-layouts.json`へコピーし、イベント情報とSpreadsheet IDを設定します。シート名が既定値と異なる場合はそれも指定します。
5. NodeCGを起動するプロセスからGoogle ADCを利用できるようにします。サービスアカウントの鍵ファイルを使う場合は、そのプロセスの環境変数`GOOGLE_APPLICATION_CREDENTIALS`に設定し、該当アカウントにSpreadsheetへのアクセス権を付与します。認証情報をバンドル設定やリポジトリへ保存しないでください。
6. ホスト環境の通常の手順でNodeCGを起動し、Dashboardを開きます。Race ControlとPlayer Mappingのパネルはバンドルの`package.json`で登録されています。

RaceTime.ggとSpeedrun.comの検索は各サービスの公開APIを利用します。Spreadsheet設定や認証に問題がある場合はDashboardの連携ステータスに表示され、スプレッドシート依存機能が利用できないことがあります。

## 設定

`config.example.json`を設定のひな型として使います。バンドル設定には`spreadsheet.spreadsheetId`が必要です。シート名は省略でき、省略時は`Players`、`CategoryMappings`、`CategoryPresentation`、`RaceHistory`が使われます。Graphicsには空でない`event.name`が必要です。`shortName`と`logoUrl`は任意です。

```json
{
  "event": {
    "name": "RTA Race Event",
    "shortName": "RTA Race",
    "logoUrl": "/bundles/nodecg-race-layouts/assets/event-logo.png"
  },
  "spreadsheet": {
    "spreadsheetId": "your-spreadsheet-id",
    "playersSheet": "Players",
    "categoryMappingsSheet": "CategoryMappings",
    "categoryPresentationSheet": "CategoryPresentation",
    "raceHistorySheet": "RaceHistory"
  }
}
```

このファイルにGoogleの認証情報や秘密鍵を記載しないでください。Spreadsheetへのアクセスには、NodeCGプロセス環境で利用可能なADCを使います。必要なシートヘッダーは[オペレーターガイド](docs/operator-guide.md#スプレッドシートの準備)に記載しています。

## Graphics

バンドルは透明背景の1920×1080 NodeCG Graphicsを4種類登録します。

| ページ              | 表示内容                                                  |
| ------------------- | --------------------------------------------------------- |
| `race.html`         | Raceヘッダー、4つのPlayer HUD、World Record、Commentators |
| `participants.html` | レース参加者一覧                                          |
| `leaderboard.html`  | 順位、名前、補助名、タイム                                |
| `result.html`       | レース結果                                                |

GraphicsはActive broadcastから投影されたページデータを参照し、RaceTimeやSpeedrun.comへ直接アクセスしません。LeaderboardやResultのタイトル・背景、ゲーム映像、タイマー、イベント装飾などはOBSで別途構成できます。NodeCGでのGraphics追加と有効化はオペレーターガイドを参照してください。

## アーキテクチャ概要

- **Dashboard**: Message API経由でDraftを編集し、連携・Broadcast・保存状態を表示します。
- **Extension / application services**: 操作を検証し、状態変更を管理します。
- **Domain / Replicants**: Draft、Active、Session、Snapshot、Graphics投影データを定義します。
- **Integrations**: RaceTime.gg、Speedrun.com、Google Sheetsと連携します。
- **Graphics**: Active状態の投影データを描画し、最終的なシーン合成はOBSが担います。

Broadcast Applyが成功するまでDraftは放送に反映されません。Apply開始時点でDraftとSnapshotの独立した値を取得します。Active状態はActive用RaceTime Sessionの読み込み後に確定されます。その後のSpreadsheet保存は別のキュー処理であり、Active更新の成功を取り消しません。

## 開発

`npm ci`で依存関係をインストールし、次のコマンドを実行します。

```sh
npm run typecheck       # Extension、Dashboard、Graphics、テストの型チェック
npm run lint            # oxlint
npm run schema:check    # 管理対象Schemaとの一致を確認
npm run test            # Vitestテストスイート
npm run build           # Extension、Dashboard、Graphicsのビルド
npm run format:check    # Prettierチェック
npm run verify          # typecheck、lint、schema:check、test
```

Replicant Schemaを意図的に更新する場合のみ`npm run schema:generate`を実行します。`schemas/`内の生成ファイルはリポジトリで管理しており、手作業で編集しないでください。NodeCGホストはこのリポジトリとは別に起動します。

## オペレーターガイド

[docs/operator-guide.md](docs/operator-guide.md)に、スプレッドシートの準備、レース当日の操作、Draft/Activeの説明、Graphics設定、トラブルシューティングを記載しています。

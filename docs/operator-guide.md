# オペレーターガイド

このガイドでは、`nodecg-race-layouts`バンドルの初期設定と、レース当日の基本的な操作手順を説明します。

## レース前の準備

### バンドルのインストールと設定

このバンドルは、別途用意したNodeCG 2.xホスト上で動作します。バンドルのディレクトリで依存関係をインストールし、Extension、Dashboard、Graphicsをビルドしてください。

```sh
npm ci
npm run build
```

`config.example.json`をNodeCGホストの`cfg/nodecg-race-layouts.json`へコピーします。空でないイベント名とGoogle Spreadsheet IDを設定してください。シート名は変更できます。省略時の既定値は`Players`、`CategoryMappings`、`CategoryPresentation`、`RaceHistory`です。

NodeCGプロセスからGoogle Application Default Credentials（ADC）を利用できるようにしてください。一般的には環境変数`GOOGLE_APPLICATION_CREDENTIALS`を設定し、その認証情報のアカウントへSpreadsheetを共有します。認証ファイルや秘密情報をバンドル設定やリポジトリに保存しないでください。プロセス環境またはバンドル設定を変更したら、NodeCGを再起動してください。

### スプレッドシートの準備

設定した各シートにヘッダー行を作成してください。連携処理は列の位置ではなくヘッダー名で列を判別します。大文字・小文字、綴り、アンダースコアを含め、次の名称を正確に使用してください。列の順番は変更できますが、必須ヘッダーは削除しないでください。データがまだないシートにも、ヘッダー行は必要です。

**Players**

```text
player_id, manual_display_name, racetime_state, racetime_user_id, racetime_name, racetime_twitch_login, speedruncom_state, speedruncom_user_id, speedruncom_name, speedruncom_twitch_login, twitch_state, twitch_user_id, twitch_login, updated_at
```

**CategoryMappings**

```text
racetime_category_slug, racetime_category_name, racetime_goal, src_game_id, src_game_name, src_category_id, src_category_name, src_level_id, src_variables, src_platform_id, src_region_id, src_emulator, src_timing_method, updated_at
```

**CategoryPresentation**

```text
racetime_category_slug, racetime_goal, display_title, display_subtitle, rule_heading, rule_text, leaderboard_heading, updated_at
```

**RaceHistory**

```text
racetime_url, racetime_race_id, category_slug, category_name, goal, participants_json, race_screen_slots_json, commentators_json, active_revision, first_applied_at, last_applied_at
```

バンドル起動時にPlayersディレクトリを読み込みます。CategoryMappingsとCategoryPresentationは保存済みプリセットとして使用されます。RaceHistoryはBroadcast Apply成功後に書き込まれます。`src_variables`、`participants_json`、`race_screen_slots_json`、`commentators_json`などのJSON列はバンドルが管理します。期待される形式を把握していない場合は、保存済みのJSON値を直接編集しないでください。

### 連携とDashboardの確認

NodeCGを起動してDashboardを開きます。Race ControlのステータスバーでRaceTime、Speedrun.com、Spreadsheet、Broadcastの状態を確認してください。Player Mappingを開き、Player一覧が読み込まれていることを確認します。シートやアクセス権の問題を修正した後は、**Reload from Spreadsheet**を実行します。

Player Mappingは再利用可能なID情報のディレクトリです。レース参加者はPlayerレコードに紐づきますが、RaceTime entrantはRaceTime user IDを保持します。Draft、Active broadcast、または保存待ち処理で使用中のPlayerは、更新や削除が制限される場合があります。

## レース当日の手順

### 1. Draftにレースを読み込む

Race Control → Draft RaceでRaceTime.ggのレースURLを入力し、**Load Race**を選択します。レースを編集可能なDraftへ読み込み、RaceTime Sessionを監視します。この操作だけでは放送に反映されません。Entrantは最初にRaceTime user ID、次に一意に一致するTwitch loginでPlayerと照合されます。名前の類似度による推測は行いません。参加者を確認し、未一致または曖昧なIDを解決してください。

読み込み後にRaceTime側の構造変更が検出されると、BroadcastステータスにReconcileが必要であることが表示されます。変更内容を確認して**Reconcile Draft**を選択すると、可能な範囲でオペレーターの編集を維持しながらDraftを更新します。順位やタイムなどの結果だけの変更では、通常Reconcileは必要ありません。

### 2. 参加者とID情報を確認する

参加者ごとに、関連付けられたPlayerと解決済み表示名を確認します。必要に応じてPlayer Mappingまたは参加者のPlayer割り当てを修正してください。Leaderboardや画面表示に必要なSpeedrun.com / Twitch IDも確認します。IDの重複や未解決の参加者があると、DraftがApply可能にならないことがあります。使用中PlayerのPlayer Mapping変更が制限された場合は、該当するDraft、Active broadcast、または保存待ち処理を先に解消してください。

### 3. Categoryと表示内容を選ぶ

**Category / Speedrun.com**でゲームを検索し、カテゴリを選択します。必要に応じてLevel、Variables、Platform、Region、Emulator、Timing Methodを指定してください。必須のSpeedrun.com Variableはすべて選択し、選択内容をDraftへ適用します。保存済みCategory Mappingは同じセクションから登録・更新・復元できます。Category PresentationにTitleが設定されていればRace GraphicではそのTitleを表示し、未設定または空欄ならSpeedrun.comのカテゴリ名を表示します。

**Leaderboard Presentation**ではTitle、Subtitle、Rule Heading / Lines、Leaderboard Headingを編集します。まず**Update Draft**で編集中の内容をDraftへ反映し、プリセットとして保存する場合は**Save Preset**を選択します。**Revert to Saved**で保存済み内容へ戻し、**Clear Presentation**で表示設定を消去できます。

Leaderboardの取得条件を変更すると、現在のSnapshotは無効になります。表示名、ルールやPresentation、Slots、Commentatorsの変更はLeaderboard取得条件を変えません。

### 4. Race Screen SlotsとCommentatorsを設定する

**Race Screen**のP1～P4は、左上・右上・左下・右下に対応します。参加者または**Unassigned**を選び、**Save Slots**を押してください。同じ参加者を複数Slotに割り当てることはできません。Slotは内部的にRaceTime user IDを使用します。未割り当てSlotは許可され、Applyを妨げません。該当するRace GraphicのHUD位置は非表示になります。不明な参加者や重複割り当ては無効です。

Commentatorは0～3人を順番に選び、**Save Commentators**を押します。候補はPlayerディレクトリとDraft Playerから選ばれ、レース参加者である必要はありません。参加者をCommentatorにすることもできますが、同じPlayerを複数のCommentator枠に設定できません。

### 5. Speedrun Snapshotを更新・確認する

Categoryと参加者IDを整えた後、**Refresh Snapshot**を選択します。SnapshotにはWorld Record、Leaderboard（同率を含む上位20位まで）、取得可能な参加者のPB / Rankが含まれます。状態が`ready`になるまで待ってください。取得失敗やPB未取得はDashboard上で確認します。Category変更前の古いSnapshotが現在の条件に一致しているとは限らないため注意してください。

### 6. DraftをBroadcastへApplyする

Broadcast Applyの概要とステータスを確認します。Applyには、準備完了したDraft、有効なレース・Category・参加者ID、現在のDraft revisionとLeaderboard条件に一致する`ready`なSnapshotが必要です。**4つすべてのSlotを埋める必要はありません**。**Apply Draft to Broadcast**を選択してください。

新しいActive設定とSnapshotを確定する前に、バンドルはActive用RaceTime Sessionを読み込みます。読み込みに失敗した場合、以前のActive状態が維持されます。成功後はActive revisionとBroadcastステータスを確認してからGraphicsを放送に使用してください。以後のDraft編集は、次回Applyが成功するまで放送に反映されません。

### 7. Apply後の保存状態を確認する

Active broadcastの確定とSpreadsheetへの保存は別処理です。Applyが成功して放送に反映されても、PlayersまたはRaceHistoryへの書き込みが保留中・失敗中の場合があります。**Persistence**で状態、キュー数、各項目の試行回数、直近のエラーを確認してください。Spreadsheetやアクセス権の問題を修正し、利用可能になったら**Retry Persistence**を実行します。キューはFIFO順で処理され、Extension起動時にも再開します。保存失敗によってActive broadcastが取り消されることはありません。

## OBS Graphics

NodeCGには1920×1080のGraphicsが4種類登録されています。

| NodeCG Graphicsページ | 用途                                        |
| --------------------- | ------------------------------------------- |
| `race.html`           | Category、4つのPlayer HUD、WR、Commentators |
| `participants.html`   | 参加者一覧                                  |
| `leaderboard.html`    | 順位、名前、任意の補助名、タイム            |
| `result.html`         | レース結果                                  |

NodeCGのGraphics UIから該当するバンドルGraphicsを追加してください。ホストのURL形式を使う場合は、通常`http://localhost:9090/bundles/nodecg-race-layouts/graphics/<page>`です。Graphicsは透明背景で、Active broadcastの投影データを使用します。Leaderboard / Resultのタイトルや背景、イベント装飾、タイマー、ゲーム映像、最終的なシーン配置はOBSで構成します。

### Race画面の配置

`race.html`は1920×1080固定レイアウトです。P1 / P2を上段、P3 / P4を下段に配置し、各映像枠は**880×495px（16:9）**です。左右の余白は56px、中央の間隔は48px、上下段の間には高さ90pxのCategory / WR / Commentary帯があります。空SlotはRace Graphic全体から取り除かれますが、他Slotの配置は変わりません。

各映像枠の下部にPlayer情報バーが重なります。タイマー用の透明枠は各Player情報バー内の右端に同じ相対位置で配置され、サイズは**214×62px**です。1920×1080のNodeCG Graphics全体を最前面に置くと、映像の枠線、Player情報、P番号、タイマー枠が重なります。イベント名・ロゴとゲーム名はこのGraphicには表示されません。必要であればOBS側の固定要素として追加してください。

OBSの推奨レイヤー順（下から上）は次のとおりです。

1. 背景・イベント装飾
2. P1～P4のゲーム映像
3. 各Playerに対応するタイマーCrop（各タイマー枠の位置・サイズに合わせる）
4. NodeCGの`race.html`

配信前に1920×1080で表示し、上下左右の対称性、映像枠との位置対応、PlayerバーとタイマーCropの重なり、長い名前、Commentator最大3人、WRなし、未割当Slotを確認してください。可能であればOBSのゲーム映像を一時的に色付き矩形へ置き換え、各枠との位置合わせを確認します。

## トラブルシューティング

| 症状                               | 確認事項                                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DashboardまたはGraphicsが空白      | バンドルが`package.json`とともにNodeCGの`bundles`ディレクトリに配置されているか確認します。バンドル内で`npm ci`と`npm run build`を実行し、NodeCGを再起動してログを確認します。                             |
| Spreadsheetステータスが`error`     | Spreadsheet ID、設定したタブ名、ヘッダー行、Google APIのアクセス権、NodeCGプロセスからADCを利用できるかを確認します。原因を修正した後、Reload from Spreadsheetを実行します。                               |
| Playersシートを読み込めない        | Playersのヘッダーに上記の必須列がすべてあること、linked状態の行に有効な状態・ID情報があることを確認します。データが空のシートにもヘッダー行が必要です。                                                    |
| Applyできない                      | BroadcastとSnapshotの状態を確認します。Category選択、必須Variable、参加者ID、Race Reconcileの要否、Snapshotのrevision・取得条件、検証メッセージを確認してください。Race Screenの空Slotは許可されています。 |
| Speedrun Snapshot取得に失敗する    | Speedrun.comステータス、選択中のゲーム・カテゴリ・フィルター、必須Variable、Snapshotが現在のDraft向けかを確認します。Leaderboard条件を変更した後は再取得してください。                                     |
| Persistenceキューが保留または失敗  | キュー項目の直近エラーと試行回数を確認し、Spreadsheetやアクセス権の問題を修正してから再試行します。保存エラーでActive broadcastが取り消されることはありません。                                            |
| Graphicsにレース情報が表示されない | Draftを正常にApplyしたか、正しいGraphicsページを使っているか、Activeの投影データがあるかを確認します。イベント情報を使うGraphicsでは`event.name`の設定も確認してください。                                 |

問題を報告するときは、該当操作前後のNodeCGログ、Dashboard上のステータスやメッセージ、Active状態が変化したかを添えてください。認証ファイル、アクセストークン、秘密鍵は共有しないでください。

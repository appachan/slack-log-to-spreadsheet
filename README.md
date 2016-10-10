# slack-logger-to-spreadsheet
# パンデパSlackLogger
## 用途
- 過去メッセージの参照
- 範囲はpublic channelのログのみ
- private channelとDMは無視で

## 仕様 (優先度 降順)
2. 新規メッセージを差分で自動取得→DB追記
3. チャンネル毎に記録、時系列を維持
4. 全文検索
1. ExportデータからDB構成

## 構成
- Clientでメッセージ取得 js
- DB: GoogleDrive...?

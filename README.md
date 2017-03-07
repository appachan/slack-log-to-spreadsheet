# slack-log-to-spreadsheet
## Running this
1. open [GoogleDrive](https://drive.google.com GoogleDrive).
2. create a new project.
3. copy app.js.
4. get your slack team's API token from [here](https://api.slack.com/custom-integrations/legacy-tokens).
5. set the token to "slack_api_token" property. 
6. set a trigger with `run()`.

This app expects `SlackLogs` to be Logs' root directory. 
If you do not have the directory `SlackLogs`, prease create it.

ご利用は自己責任でお願いします．

## Exported data table
| ts(Unix)         | ts                  | @user     | text  |
| :-:              | :-:                 | :-:       | :-:   |
| xxxxxxxxxxx.xxxx | yyyy/MM/dd HH:mm:ss | @appachan | わかり |

## ToDos
- [ ] urlのエスケープを解除
- [ ] プロパティを利用した，ディレクトリのメモ化
- [ ] @channel(`<!channel>`)等の置換
- [ ] `シート１`の削除

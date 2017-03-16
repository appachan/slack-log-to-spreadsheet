const API_TOKEN = PropertiesService.getScriptProperties().getProperty('slack_api_token');
if (!API_TOKEN) {
  throw 'API token not found. You shold set "slack_api_token" property.'
}
const ROOT_DIR_NAME = 'SlackLogs'; // ログを保管用のディレクトリ

interface SlackResponse {
  ok: boolean;
  error: string;
}

interface SlackUser {
  id: string;
  name: string;
}

interface SlackChannel {
  id: string;
  name: string;
}

interface SlackMessage {
  ts: string;
  user: string;
  text: string;
}

interface FormattedMessage {
  ts: string;
  ts_formatted: string;
  user: string;
  text: string;
}

interface SlackUsersResponse extends SlackResponse {
  members: SlackUser[];
}

interface SlackChannelsResponse extends SlackResponse {
  channels: SlackChannel[];
}

interface SlackMessagesResponse extends SlackResponse {
  messages: SlackMessage[];
  has_more: boolean;
}

interface SlackTeamInfoResponse extends SlackResponse {
  team: {
    name: string;
  }
}

class SlackChannelHistory {
  memberNames: { [id: string]: string } = {};
  channelNames: { [id: string]: string } = {};
  teamName: string;

  constructor() {
  }

  requestAPI(apiMethod: string, options: { [q: string]: string } = {}): SlackResponse {
    let baseUrl = `https://slack.com/api/${apiMethod}?`;
    baseUrl += `token=${encodeURIComponent(API_TOKEN)}`;
    for (let q in options) {
      baseUrl += `&${encodeURIComponent(q)}=${encodeURIComponent(options[q])}`;
    }
    let data = <SlackResponse>JSON.parse(UrlFetchApp.fetch(baseUrl));
    if (data.error) {
      throw `GET ${apiMethod}: ${data.error}`;
    }
    return data;
  }

  run() {
    // create users table
    let usersResponse = <SlackUsersResponse>this.requestAPI('users.list');
    usersResponse.members.forEach((member) => {
      this.memberNames[member.id] = member.name;
    });

    // create channels table
    let channelsResponse = <SlackChannelsResponse>this.requestAPI('channels.list');
    channelsResponse.channels.forEach((channel) => {
      this.channelNames[channel.id] = channel.name;
    });

    // get team's name
    let teamInfoResponse = <SlackTeamInfoResponse>this.requestAPI('team.info');
    this.teamName = teamInfoResponse.team.name;

    // import history
    let spreadsheet = this.getSpreadsheet();
    for (let chId in this.channelNames) {
      // get sheet
      let sheet = this.getSheet(this.channelNames[chId], spreadsheet);
      // emit logs
      let has_more = true;
      while (has_more) {
        has_more = this.emitMessages(sheet, chId);
      }
    }
  }

  emitMessages(sheet: SpreadsheetApp.Spreadsheet.Sheet, chId: string): boolean {
    // シートの最新（最下）を取得メッセージの最古に
    let lastRow = sheet.getLastRow();
    let oldest = lastRow < 1? 1 : sheet.getRange(lastRow, 1).getValue().replace(/"/, ''); // when set "0", only latest 100 msgs offered?
    // メッセージの取得
    let options: { [q: string]: string } = {};
    options['channel'] = chId;
    options['oldest'] = oldest;
    let messagesResponse = <SlackMessagesResponse>this.requestAPI('channels.history', options);
    // メッセージ整形
    let formattedMessages: FormattedMessage[] = [];
    messagesResponse.messages.forEach((msg) => {
      formattedMessages.push(this.formatMessage(msg));
    });
    formattedMessages.reverse();
    // メッセージ書き込み
    let records = formattedMessages.map((msg) => {
      return [`"${msg.ts}"`, msg.ts_formatted, msg.user, msg.text];
    });
    if (records.length > 0) {
      let range = sheet.insertRowsAfter(lastRow || 1, records.length).getRange(lastRow+1, 1, records.length, 4);
      range.setValues(records);
    }
    return messagesResponse.has_more;
  }

  // format message
  formatMessage(src: SlackMessage): FormattedMessage {
    //let msg = new FormattedMessage;
    let msg: FormattedMessage = {
      ts: src.ts,
      ts_formatted: this.formatTimeStamp(src.ts),
      user: this.unescapeUserId(src.user),
      text: this.unescapeText(src.text)
    }
    return msg;
  }

  formatTimeStamp(ts: string): string {
    let date = new Date(+ts * 1000);
    return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  }

  unescapeText(text?: string): string {
    return (text || '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/<@(.+?)>/g, ($0, userId) => {
        let name = this.memberNames[userId];
        return name ? `@${name}` : $0;
      })
      .replace(/<@(.+?)\|(.+?)>/g, ($0, userId) => {
        let name = this.memberNames[userId];
        return name ? `@${name}` : $0;
      })
      .replace(/<#(.+?)>/g, ($0, chId) => {
        let ch = this.channelNames[chId];
        return ch ? `#${ch}` : $0;
      })
      .replace(/<#(.+?)\|(.+?)>/g, ($0, chId) => {
        let ch = this.channelNames[chId];
        return ch ? `#${ch}` : $0;
      });
  }

  unescapeUserId(userId: string): string {
    return this.memberNames[userId];
  }

  // ディレクトリの取得
  getDir(): GoogleAppsScript.Drive.Folder {
    let dirs = DriveApp.getFolders();
    let resDir;
    while (dirs.hasNext()) {
      resDir = dirs.next();
      if (resDir.getName() == ROOT_DIR_NAME) {
        break;
      }
    }
    if (resDir.getName() != ROOT_DIR_NAME) {
      throw `Log's root directory not found. You should make "${ROOT_DIR_NAME}"`;
    }
    return resDir;
  }

  // チームのスプレッドシートを取得
  getSpreadsheet(): GoogleAppsScript.Spreadsheet.spreadSheet {
    let spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet;
    let dir = this.getDir();
    let fIt = dir.getFilesByName(this.teamName);
    if (fIt.hasNext()) {
      // when spread sheet found.
      let file = fIt.next();
      spreadsheet = SpreadsheetApp.openById(file.getId());
    } else {
      // when spread sheet don't exists.
      spreadsheet = SpreadsheetApp.create(this.teamName);
      let file = DriveApp.getFileById(spreadsheet.getId());
      dir.addFile(file);
      DriveApp.getRootFolder().removeFile(file); // rootに残ったリンクを消す．
    }
    return spreadsheet;
  }

  // 各チャンネルに対応したシートを取得
  getSheet(chName: string, spreadsheet: GoogleAppsScript.Spreadsheet.spreadSheet) {
    let sheet: GoogleAppsScript.Spreadsheet.Sheet;
    sheet = spreadsheet.getSheetByName(chName);
    if (sheet != null) {
      // when sheet exists.
    } else {
      // when sheet not found.
      sheet = spreadsheet.insertSheet(chName);
    }
    return sheet;
  }
}

function run() {
  let slackChannelHistory = new SlackChannelHistory;
  slackChannelHistory.run();
}

var API_TOKEN = PropertiesService.getScriptProperties().getProperty('slack_api_token');
if (!API_TOKEN) {
    throw 'API token not found. You shold set "slack_api_token" property.';
}
// ToDo: コミット時に戻す
//const ROOT_DIR_NAME = 'SlackLogs'; // ログを保管用のディレクトリ
var ROOT_DIR_NAME = 'SlackLogsTest'; // ログを保管するルートディレクトリ
var SlackChannelHistory = (function () {
    function SlackChannelHistory() {
        this.memberNames = {};
        this.channelNames = {};
    }
    SlackChannelHistory.prototype.requestAPI = function (apiMethod, options) {
        if (options === void 0) { options = {}; }
        var baseUrl = "https://slack.com/api/" + apiMethod + "?";
        baseUrl += "token=" + encodeURIComponent(API_TOKEN);
        for (var q in options) {
            baseUrl += "&" + encodeURIComponent(q) + "=" + encodeURIComponent(options[q]);
        }
        var data = JSON.parse(UrlFetchApp.fetch(baseUrl));
        if (data.error) {
            throw "GET " + apiMethod + ": " + data.error;
        }
        return data;
    };
    SlackChannelHistory.prototype.run = function () {
        var _this = this;
        // create users table
        var usersResponse = this.requestAPI('users.list');
        usersResponse.members.forEach(function (member) {
            _this.memberNames[member.id] = member.name;
        });
        // create channels table
        var channelsResponse = this.requestAPI('channels.list');
        channelsResponse.channels.forEach(function (channel) {
            _this.channelNames[channel.id] = channel.name;
        });
        // get team's name
        var teamInfoResponse = this.requestAPI('team.info');
        this.teamName = teamInfoResponse.team.name;
        // import history
        var spreadsheet = this.getSpreadsheet();
        for (var chId in this.channelNames) {
            // get sheet
            var sheet = this.getSheet(this.channelNames[chId], spreadsheet);
            // emit logs
            var has_more = true;
            while (has_more) {
                has_more = this.emitMessages(sheet, chId);
            }
        }
    };
    SlackChannelHistory.prototype.emitMessages = function (sheet, chId) {
        var _this = this;
        // シートの最新（最下）を取得メッセージの最古に
        var lastRow = sheet.getLastRow();
        var oldest = lastRow < 1 ? 1 : sheet.getRange(lastRow, 1).getValue().replace(/"/, ''); // when set "0", only latest 100 msgs offered?
        // メッセージの取得
        var options = {};
        options['channel'] = chId;
        options['oldest'] = oldest;
        var messagesResponse = this.requestAPI('channels.history', options);
        // メッセージ整形
        var formattedMessages = [];
        messagesResponse.messages.forEach(function (msg) {
            formattedMessages.push(_this.formatMessage(msg));
        });
        formattedMessages.reverse();
        // メッセージ書き込み
        var records = formattedMessages.map(function (msg) {
            return [("\"" + msg.ts + "\""), msg.ts_formatted, msg.user, msg.text];
        });
        if (records.length > 0) {
            var range = sheet.insertRowsAfter(lastRow || 1, records.length).getRange(lastRow + 1, 1, records.length, 4);
            range.setValues(records);
        }
        return messagesResponse.has_more;
    };
    // format message
    SlackChannelHistory.prototype.formatMessage = function (src) {
        //let msg = new FormattedMessage;
        var msg = {
            ts: src.ts,
            ts_formatted: this.formatTimeStamp(src.ts),
            user: this.unescapeUserId(src.user),
            text: this.unescapeText(src.text)
        };
        return msg;
    };
    SlackChannelHistory.prototype.formatTimeStamp = function (ts) {
        var date = new Date(+ts * 1000);
        return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    };
    SlackChannelHistory.prototype.unescapeText = function (text) {
        var _this = this;
        return (text || '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/<@(.+?)>/g, function ($0, userId) {
            var name = _this.memberNames[userId];
            return name ? "@" + name : $0;
        })
            .replace(/<@(.+?)\|(.+?)>/g, function ($0, userId) {
            var name = _this.memberNames[userId];
            return name ? "@" + name : $0;
        })
            .replace(/<#(.+?)>/g, function ($0, chId) {
            var ch = _this.channelNames[chId];
            return ch ? "#" + ch : $0;
        })
            .replace(/<#(.+?)\|(.+?)>/g, function ($0, chId) {
            var ch = _this.channelNames[chId];
            return ch ? "#" + ch : $0;
        });
    };
    SlackChannelHistory.prototype.unescapeUserId = function (userId) {
        return this.memberNames[userId];
    };
    // ディレクトリの取得
    SlackChannelHistory.prototype.getDir = function () {
        var dirs = DriveApp.getFolders();
        var resDir;
        while (dirs.hasNext()) {
            resDir = dirs.next();
            if (resDir.getName() == ROOT_DIR_NAME) {
                break;
            }
        }
        if (resDir.getName() != ROOT_DIR_NAME) {
            throw "Log's root directory not found. You should make \"" + ROOT_DIR_NAME + "\"";
        }
        return resDir;
    };
    // チームのスプレッドシートを取得
    SlackChannelHistory.prototype.getSpreadsheet = function () {
        var spreadsheet;
        var dir = this.getDir();
        var fIt = dir.getFilesByName(this.teamName);
        if (fIt.hasNext()) {
            // when spread sheet found.
            var file = fIt.next();
            spreadsheet = SpreadsheetApp.openById(file.getId());
        }
        else {
            // when spread sheet don't exists.
            spreadsheet = SpreadsheetApp.create(this.teamName);
            var file = DriveApp.getFileById(spreadsheet.getId());
            dir.addFile(file);
            DriveApp.getRootFolder().removeFile(file); // rootに残ったリンクを消す．
        }
        return spreadsheet;
    };
    // 各チャンネルに対応したシートを取得
    SlackChannelHistory.prototype.getSheet = function (chName, spreadsheet) {
        var sheet;
        sheet = spreadsheet.getSheetByName(chName);
        if (sheet != null) {
        }
        else {
            // when sheet not found.
            sheet = spreadsheet.insertSheet(chName);
        }
        return sheet;
    };
    return SlackChannelHistory;
}());
function run() {
    var slackChannelHistory = new SlackChannelHistory;
    slackChannelHistory.run();
}

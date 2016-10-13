function myFunction() {
  var API_KEY = PropertiesService.getScriptProperties().getPtoperty('slack_api_token');
  var BASE_URL = "https://slack.com/api/channels.history?channel=C2DF1NNUB";

  var resp = UrlFetchApp.fetch(BASE_URL + "&token=" + API_KEY);
  var json = JSON.parse(res != null? resp : '[]')['messages'];
  var msg = [];

  Object.keys(msg).forEach(function(v, k) {
    var m = json[k];
    msg.push( [m['ts'], m['user'], m['text']] );
  });

  Logger.log(msg);

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet();
  var range = sheet.getRange(1,1,msg.length,3);
  range.setValues(msg);
}

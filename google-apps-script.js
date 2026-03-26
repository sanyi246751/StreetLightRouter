// Google Apps Script (GAS) 程式碼
// 請將此內容貼入 Google Sheet 的「擴充功能 > Apps Script」編輯器中

function doGet() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = sheet.getDataRange().getValues();

    // 如果表單是空的，回傳空陣列
    if (data.length <= 1) {
        return ContentService.createTextOutput(JSON.stringify({ lights: [] }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    const headers = data.shift(); // 移除標題列

    const lights = data.map(row => ({
        id: String(row[0]),
        name: String(row[1]),
        lat: Number(row[2]),
        lng: Number(row[3]),
        group: String(row[4] || ''),
        clicks: Number(row[5] || 0)
    }));

    return ContentService.createTextOutput(JSON.stringify({ lights }))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    let params;
    try {
        params = JSON.parse(e.postData.contents);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid JSON" }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();

    if (params.action === 'sync') {
        sheet.clear();
        // 寫入標題
        sheet.appendRow(['id', 'name', 'lat', 'lng', 'group', 'clicks']);

        // 寫入路燈資料
        if (params.lights && params.lights.length > 0) {
            params.lights.forEach(light => {
                sheet.appendRow([light.id, light.name, light.lat, light.lng, light.group || '', light.clicks || 0]);
            });
        }

        return ContentService.createTextOutput(JSON.stringify({ success: true }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'reset_clicks') {
        const data = sheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            sheet.getRange(i + 1, 6).setValue(0);
        }
        return ContentService.createTextOutput(JSON.stringify({ success: true }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unknown action" }))
        .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Google Apps Script Web App for Mockup dataset.
 * Deploy as Web App and set execute as script owner.
 */

const SHEET_NAME = "Mockups";
const REQUIRED_HEADERS = [
  "mock_id",
  "nama_mock",
  "sektor",
  "keywords",
  "path_image",
  "created_at",
];

const SEKTOR_PREFIX = {
  Kuliner: "mkl",
  Perdagangan: "mpd",
  "Kesehatan Kecantikan": "mks",
  Pendidikan: "mpn",
  "Jasa Profesional": "mjs",
  "Pemerintah dan Sosial": "mpmt",
  Keuangan: "mkeu",
  Logistik: "mlg",
  "Kreatif dan Digital": "mkr",
  "Gaya Hidup": "mgl",
  Agrikultur: "mag",
  Otomotif: "mot",
};

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const action = String(payload.action || "create_mock").trim();

    if (action === "next_mock_id") {
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const sektor = requireField_(payload, "sektor");
        const prefix = String(payload.prefix || getPrefix_(sektor)).trim();
        const mockId = getNextMockId_(sektor, prefix);
        return json_({ success: true, mock_id: mockId, sektor: sektor });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === "create_mock") {
      const result = createMock_(payload);
      return json_(result);
    }

    return json_({ success: false, error: "Unknown action: " + action });
  } catch (error) {
    return json_({ success: false, error: error.message });
  }
}

function createMock_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sektor = requireField_(payload, "sektor");
    const namaMock = requireField_(payload, "nama_mock");
    const keywords = requireField_(payload, "keywords");
    const pathImage = requireField_(payload, "path_image");
    const prefix = getPrefix_(sektor);

    const inputMockId = String(payload.mock_id || "").trim();
    const ids = getAllMockIds_();
    const mockId =
      inputMockId && !ids[inputMockId]
        ? inputMockId
        : getNextMockId_(sektor, prefix);

    if (ids[mockId]) {
      throw new Error("Mock ID sudah dipakai: " + mockId);
    }

    const sheet = getOrCreateSheet_();
    const row = [
      mockId,
      namaMock,
      sektor,
      keywords,
      pathImage,
      new Date().toISOString(),
    ];
    sheet.appendRow(row);

    return {
      success: true,
      mock_id: mockId,
      nama_mock: namaMock,
      sektor: sektor,
      keywords: keywords,
      path_image: pathImage,
    };
  } finally {
    lock.releaseLock();
  }
}

function getNextMockId_(sektor, prefix) {
  const ids = getAllMockIds_();
  let maxNumber = 0;
  const regex = new RegExp("^" + escapeRegex_(prefix) + "(\\d+)$", "i");

  Object.keys(ids).forEach(function (id) {
    const match = id.match(regex);
    if (!match) return;
    const number = parseInt(match[1], 10);
    if (!isNaN(number) && number > maxNumber) {
      maxNumber = number;
    }
  });

  return prefix + padNumber_(maxNumber + 1, 3);
}

function getAllMockIds_() {
  const sheet = getOrCreateSheet_();
  const headerMap = getHeaderMap_(sheet);
  const mockIdCol = headerMap["mock_id"];
  if (!mockIdCol) return {};

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {};

  const values = sheet.getRange(2, mockIdCol, lastRow - 1, 1).getValues();
  const ids = {};

  values.forEach(function (row) {
    const id = String(row[0] || "").trim();
    if (id) ids[id] = true;
  });

  return ids;
}

function getOrCreateSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  const headerMap = getHeaderMap_(sheet);
  if (!headerMap["mock_id"]) {
    sheet.clear();
    sheet.getRange(1, 1, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
  }

  return sheet;
}

function getHeaderMap_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return {};
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  const map = {};
  headers.forEach(function (name, index) {
    const key = String(name || "").trim();
    if (key) map[key] = index + 1;
  });
  return map;
}

function getPrefix_(sektor) {
  return SEKTOR_PREFIX[String(sektor || "").trim()] || "mxx";
}

function requireField_(payload, key) {
  const value = String(payload[key] || "").trim();
  if (!value) throw new Error("Field wajib diisi: " + key);
  return value;
}

function padNumber_(value, size) {
  const text = String(value);
  if (text.length >= size) return text;
  return new Array(size - text.length + 1).join("0") + text;
}

function escapeRegex_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  return JSON.parse(e.postData.contents);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

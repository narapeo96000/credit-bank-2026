/**
 * ============================================================
 *  ระบบค้นหารายชื่อผู้ผ่านการอบรม + ออกเกียรติบัตร (PDF) / ส่งอีเมล
 *  Google Apps Script Web App + Google Sheets + SweetAlert2
 * ============================================================
 *
 *  วิธีติดตั้ง
 *  1. เปิด https://script.google.com  > โครงการใหม่
 *  2. วางไฟล์ Code.gs, Index.html, appsscript.json
 *  3. Deploy > New deployment > Web app
 *       - Execute as : Me (อีเมลของคุณ)
 *       - Who has access : Anyone (ผู้ใดก็ได้ที่มีลิงก์)
 *  4. เปิดลิงก์ /exec
 *
 *  เทมเพลตต้นฉบับเป็น Google Slides (ไฟล์ "cer-1")
 *  ให้ใส่ตัวแปรแทนค่าในสไลด์ (กล่องข้อความ/ตาราง/รูปทรง):
 *    <<cer_id>>   รหัสผู้ผ่านการอบรม
 *    <<fname>>    ชื่อ-สกุล
 *    <<position>> ตำแหน่ง
 *    <<school>>   สถานศึกษา
 *    <<dept>>     สังกัด
 *    <<project>>  ชื่อโครงการ
 *    <<activity>> ชื่อกิจกรรม
 *    <<venue>>    สถานที่
 *    <<date>>     วันที่จัดโครงการ
 *    <<organizer>>ผู้จัดโครงการ
 *  (รองรับทั้งรูปแบบ <<key>>  {{key}}  และ [[key]])
 */

const CFG = {
  // ฐานข้อมูลรายชื่อ
  SHEET_ID: '1Bnk2zAYb4-kCy4LeycTOAtZcK_0ehxD7wOASsEDrcdE',
  SHEET_NAME: 'Cer',
  // เทมเพลตเกียรติบัตร (Google Slides)
  TEMPLATE_ID: '11ar1y5muLLLDxmZyVmIHFBqAVcjT2tXtAzx2XJ4MCrs',
  // โฟลเดอร์เก็บ PDF บน Google Drive
  FOLDER_ID: '1D7cZVWGcenh0zn8_jeLZ2Fru59gy5XA_',
  // คอลัมน์หลัก (ต้องตรงกับหัวตารางในชีต)
  KEY_FIELD: 'cer_id',
  FIELDS: ['cer_id', 'fname', 'position', 'school', 'dept'],
  MAX_RESULTS: 30,

  // ข้อมูลโครงการ (ใช้แทนค่าในเทมเพลต + แสดงผลหน้าเว็บ/อีเมล)
  EVENT: {
    project: 'โครงการพัฒนารูปแบบการจัดการศึกษาเพื่อการมีอาชีพในพื้นที่กลุ่มจังหวัดภาคใต้ชายแดน',
    activity: 'กิจกรรมพัฒนาการออกแบบหลักสูตรสถานศึกษาที่ส่งเสริมสมรรถนะอาชีพของผู้เรียน โดยบูรณาการกับหลักสูตรอาชีวศึกษา ปีงบประมาณ พ.ศ. 2569',
    venue: 'ณ ห้องประชุมผกากรอง วิทยาลัยชุมชนนราธิวาส อำเภอเมืองนราธิวาส จังหวัดนราธิวาส',
    date: 'ระหว่างวันที่ 6 - 7 ตุลาคม 2569',
    organizer: 'จัดโดยสำนักงานศึกษาธิการจังหวัดนราธิวาส สำนักงานปลัดกระทรวงศึกษาธิการ'
  }
};

/* ============================ WEB APP ============================ */

/**
 * Backend API (frontend อยู่บน GitHub Pages)
 *   GET ?api=stats
 *   GET ?api=search&q=<คำค้น>
 *   GET ?api=issue&id=<รหัส>&force=1     -> { base64, fileName } (ใช้ไฟล์เดิมถ้าเคยสร้าง)
 *   GET ?api=mail&id=<รหัส>&email=...    -> ส่งเกียรติบัตรทางอีเมล
 *   เพิ่ม &callback=fn เพื่อเรียกแบบ JSONP (กรณี fetch ติด CORS)
 * เปิด /exec ตรง ๆ จะแสดงหน้าเว็บสำรอง (Index.html)
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.api) return apiOut_(apiHandle_(params), params.callback);

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ค้นหาเกียรติบัตรการอบรม | สำนักงานศึกษาธิการจังหวัดนราธิวาส')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function apiHandle_(p) {
  try {
    switch (p.api) {
      case 'stats':
        return getStats();
      case 'search':
        return searchRoster(p.q || p.query || '');
      case 'issue':
        return apiIssue_(p);
      case 'mail':
        return sendCertificate(p.id || p.cer_id || '', p.email || '');
      default:
        return { ok: false, message: 'unknown api: ' + p.api };
    }
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
}

/** เปิด CORS ให้ frontend บน GitHub Pages และรองรับ JSONP */
function apiOut_(payload, callback) {
  const json = JSON.stringify(payload);
  const cb = String(callback || '').replace(/[^A-Za-z0-9_$.\[\]]/g, '');
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function apiIssue_(p) {
  const result = issueCertificate(p.id || p.cer_id || '', p.force === '1');
  if (result.ok) result.mime = 'application/pdf';
  return result;
}




function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ============================ ค้นหา ============================ */

/** นับจำนวนรายชื่อทั้งหมด (แสดงผลหน้าเว็บ) */
function getStats() {
  try {
    return { ok: true, total: readRows_().length };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/** ค้นหารายชื่อจาก รหัส / ชื่อ / ตำแหน่ง / สถานศึกษา / สังกัด */
function searchRoster(query) {
  try {
    const q = norm_(query);
    if (!q) {
      return { ok: false, message: 'กรุณากรอกคำค้นหา เช่น ชื่อ-สกุล หรือรหัสผู้ผ่านการอบรม' };
    }
    const rows = readRows_();
    const hits = rows.filter(function (r) {
      return CFG.FIELDS.some(function (f) {
        return norm_(r[f]).indexOf(q) !== -1;
      });
    });
    return {
      ok: true,
      total: rows.length,
      count: hits.length,
      results: hits.slice(0, CFG.MAX_RESULTS).map(publicRec_)
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/** สร้าง/ค้น PDF เกียรติบัตร แล้วส่งกลับเป็น base64 ให้ดาวน์โหลดทันที */
function issueCertificate(cerId, force) {
  try {
    const rec = findRecord_(cerId);
    if (!rec) return { ok: false, message: 'ไม่พบรายชื่อจากรหัส ' + cerId };
    const found = getPdf_(rec, !!force);
    const file = found.file;
    return {
      ok: true,
      cached: found.cached,
      fileName: file.getName(),
      base64: Utilities.base64Encode(file.getBlob().getBytes()),
      driveUrl: file.getUrl()
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/** ส่งเกียรติบัตรทางอีเมล (เว้นว่างเพื่อใช้อีเมลที่ลงทะเบียนในชีต) */
function sendCertificate(cerId, emailInput) {
  try {
    const rec = findRecord_(cerId);
    if (!rec) return { ok: false, message: 'ไม่พบรายชื่อจากรหัส ' + cerId };

    let target = String(emailInput || '').trim();
    if (!target) target = rec.email || rec.e_mail || '';
    if (!target) {
      return { ok: false, needInput: true, message: 'ไม่พบอีเมลของผู้นี้ในชีต กรุณาระบุอีเมลผู้รับ' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      return { ok: false, needInput: true, message: 'รูปแบบอีเมลไม่ถูกต้อง' };
    }

    const file = getPdf_(rec, false).file;
    MailApp.sendEmail({
      to: target,
      subject: 'เกียรติบัตรการเข้ารับการอบรม - ' + (rec.fname || '') + ' (' + (rec.cer_id || '') + ')',
      htmlBody: emailHtml_(rec),
      attachments: [file.getBlob()]
    });
    logSend_(rec, target);
    return { ok: true, message: 'ส่งเกียรติบัตรไปยัง ' + maskEmail_(target) + ' เรียบร้อยแล้ว' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/* ============================ สร้าง PDF ============================ */

/**
 * หา PDF ของผู้นี้ก่อน (ไม่สร้างใหม่ถ้าเคยสร้างแล้ว)
 *  1) ดูจากบันทึก fileId ที่ระบบเคยสร้าง (Script Properties) - ไม่หน่วงจาก index ของ Drive
 *  2) ค้นหาไฟล์เดิมในโฟลเดอร์ Drive (ทุกรูปแบบชื่อไฟล์)
 * force = true -> ลบไฟล์เดิมแล้วสร้างใหม่
 * คืนค่า { file, cached }
 */
function getPdf_(rec, force) {
  const folder = DriveApp.getFolderById(CFG.FOLDER_ID);
  const props = PropertiesService.getScriptProperties();
  const propKey = propKey_(rec);

  if (!force) {
    const byProp = getFileOrNull_(props.getProperty(propKey));
    if (byProp) return { file: byProp, cached: true };

    const existed = findExistingPdf_(folder, rec);
    if (existed) {
      props.setProperty(propKey, existed.getId());
      return { file: existed, cached: true };
    }
  } else {
    const old = getFileOrNull_(props.getProperty(propKey)) || findExistingPdf_(folder, rec);
    if (old) {
      try { old.setTrashed(true); } catch (ignore) {}
      props.deleteProperty(propKey);
    }
  }

  const file = buildPdf_(rec, folder, pdfName_(rec));
  props.setProperty(propKey, file.getId());
  return { file: file, cached: false };
}

function getFileOrNull_(fileId) {
  if (!fileId) return null;
  try {
    const file = DriveApp.getFileById(fileId);
    return file.isTrashed() ? null : file;
  } catch (err) {
    return null;
  }
}

function propKey_(rec) {
  return 'cert_' + normName_(rec[CFG.KEY_FIELD]);
}

/** ค้นหาไฟล์เกียรติบัตรเดิมในโฟลเดอร์ (รองรับทุกรูปแบบชื่อไฟล์) */
function findExistingPdf_(folder, rec) {
  const key = rec[CFG.KEY_FIELD];
  if (!key) return null;

  // 1) ชื่อไฟล์มาตรฐานของระบบ
  const exact = folder.getFilesByName(pdfName_(rec));
  if (exact.hasNext()) return exact.next();

  // 2) ไล่ดูไฟล์ PDF ในโฟลเดอร์ แล้วเทียบรหัสในชื่อไฟล์
  const files = folder.getFiles();
  let guard = 0;
  while (files.hasNext() && guard++ < 5000) {
    const file = files.next();
    if (file.getMimeType() !== 'application/pdf') continue;
    if (nameHasKey_(file.getName(), key)) return file;
  }
  return null;
}

/** ตรวจว่าชื่อไฟล์มีรหัสนี้อยู่ (รองรับทั้ง 2569/1919 และ 2569_1919 - ...) */
function nameHasKey_(name, key) {
  const fileName = normName_(name);
  const keyNorm = normName_(key);
  if (!keyNorm) return false;

  let from = 0;
  let idx;
  while ((idx = fileName.indexOf(keyNorm, from)) !== -1) {
    if (!/[0-9]/.test(fileName.charAt(idx + keyNorm.length))) return true;  // ต้องไม่ตามด้วยเลข (2569/191 ต้องไม่ตรงกับ 2569/1919)
    from = idx + 1;
  }
  return false;
}

function buildPdf_(rec, folder, pdfName) {
  const template = DriveApp.getFileById(CFG.TEMPLATE_ID);
  const copy = template.makeCopy('tmp-' + rec[CFG.KEY_FIELD] + '-' + Date.now());
  try {
    const ppt = SlidesApp.openById(copy.getId());
    applyFields_(ppt, rec);
    ppt.saveAndClose();

    const blob = exportPdf_(copy.getId());
    blob.setName(pdfName);
    return folder.createFile(blob);
  } finally {
    try { copy.setTrashed(true); } catch (ignore) {}
  }
}

/** แปลง Google Slides -> PDF (สำรองด้วย Drive API export) */
function exportPdf_(fileId) {
  try {
    return DriveApp.getFileById(fileId).getBlob().getAs('application/pdf');
  } catch (ignore) {
    const resp = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + fileId + '/export?mimeType=application%2Fpdf',
      {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      }
    );
    if (resp.getResponseCode() >= 400) {
      throw new Error('แปลงไฟล์ PDF ไม่สำเร็จ (' + resp.getResponseCode() + ')');
    }
    return resp.getBlob();
  }
}

/** แทนค่าตัวแปรในเทมเพลตสไลด์ (ทุกสไลด์/กล่องข้อความ/ตาราง) */
function applyFields_(ppt, rec) {
  const map = {
    cer_id: rec.cer_id,
    fname: rec.fname,
    lname: '',
    title: rec.position,
    position: rec.position,
    school: rec.school,
    dept: rec.dept,
    project: CFG.EVENT.project,
    activity: CFG.EVENT.activity,
    venue: CFG.EVENT.venue,
    date: CFG.EVENT.date,
    organizer: CFG.EVENT.organizer
  };
  Object.keys(map).forEach(function (key) {
    const value = map[key] === undefined || map[key] === null ? '' : String(map[key]);
    ['<<' + key + '>>', '{{' + key + '}}', '[[' + key + ']]'].forEach(function (ph) {
      try { ppt.replaceAllText(ph, value, true); } catch (ignore) {}
    });
  });
}

function pdfName_(rec) {
  const raw = (rec[CFG.KEY_FIELD] || 'cert') + ' - ' + (rec.fname || '');
  return raw.replace(/[\\/:*?"<>|]/g, '_').trim() + '.pdf';
}

/* ============================ อีเมล ============================ */

function emailHtml_(rec) {
  const e = CFG.EVENT;
  const row = function (label, value) {
    return value ? '<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap">' +
      label + '</td><td style="padding:4px 0;color:#0f172a;font-weight:600">' + escHtml_(value) + '</td></tr>' : '';
  };
  return '' +
    '<div style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.7;color:#0f172a">' +
    '<div style="background:#0f4c81;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0">' +
    '<div style="font-size:13px;opacity:.85">' + escHtml_(e.date) + '</div>' +
    '<div style="font-size:17px;font-weight:700;margin-top:4px">เกียรติบัตรการเข้ารับการอบรม</div></div>' +
    '<div style="border:1px solid #e2e8f0;border-top:0;padding:18px 22px;border-radius:0 0 10px 10px">' +
    '<p>เรียน คุณ ' + escHtml_(rec.fname || '') + '</p>' +
    '<p>ขอขอบคุณที่เข้าร่วมโครงการ รายละเอียดเกียรติบัตรการอบรมแนบมากับอีเมลนี้</p>' +
    '<table>' +
    row('รหัส', rec.cer_id) +
    row('ตำแหน่ง', rec.position) +
    row('สถานศึกษา', rec.school) +
    row('สังกัด', rec.dept) +
    '</table>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">' +
    '<div style="color:#334155;font-size:14px">' +
    '<div style="font-weight:700">' + escHtml_(e.project) + '</div>' +
    '<div style="margin-top:4px">' + escHtml_(e.activity) + '</div>' +
    '<div style="margin-top:8px">' + escHtml_(e.venue) + '<br>' + escHtml_(e.date) + '</div>' +
    '<div style="margin-top:8px;color:#64748b">' + escHtml_(e.organizer) + '</div>' +
    '</div></div></div>';
}

function logSend_(rec, email) {
  try {
    const sheet = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName('Log');
    if (sheet) sheet.appendRow([new Date(), rec.cer_id, rec.fname, email]);
  } catch (ignore) {}
}

/* ============================ ตัวช่วย ============================ */

function readRows_() {
  const sheet = SpreadsheetApp.openById(CFG.SHEET_ID).getSheetByName(CFG.SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต "' + CFG.SHEET_NAME + '"');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const line = values[i];
    if (line.join('').trim() === '') continue;
    const rec = {};
    headers.forEach(function (h, idx) { if (h) rec[h] = cell_(line[idx]); });
    if (!rec[CFG.KEY_FIELD]) continue;
    rows.push(rec);
  }
  return rows;
}

function findRecord_(cerId) {
  const key = norm_(cerId);
  return readRows_().filter(function (r) { return norm_(r[CFG.KEY_FIELD]) === key; })[0] || null;
}

function publicRec_(r) {
  const out = {};
  CFG.FIELDS.forEach(function (f) { out[f] = r[f] || ''; });
  out.hasEmail = !!(r.email || r.e_mail);
  out.emailMasked = out.hasEmail ? maskEmail_(r.email || r.e_mail) : '';
  return out;
}

function maskEmail_(email) {
  const e = String(email || '');
  const at = e.indexOf('@');
  if (at < 1) return e;
  const name = e.slice(0, at);
  const head = name.length <= 2
    ? name.charAt(0) + '*'
    : name.charAt(0) + '***' + name.charAt(name.length - 1);
  return head + e.slice(at);
}

function norm_(v) {
  return String(v === undefined || v === null ? '' : v)
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

/** ตัดอักขระคั่นออกจากชื่อไฟล์/รหัส เพื่อเทียบกันได้ (2569/1919 -> 25691919) */
function normName_(v) {
  return String(v === undefined || v === null ? '' : v)
    .toLowerCase()
    .replace(/[\\/:*?"<>|_\-.#%{}~&()\[\]\s]/g, '');
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  return String(v).trim();
}

function escHtml_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

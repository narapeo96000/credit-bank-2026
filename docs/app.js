/**
 * Frontend (GitHub Pages) -> Google Apps Script backend API
 * เปลี่ยน API_URL เป็น URL ของ Web App deployment ได้ที่บรรทัดถัดไป
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbxjlq9iY8_6eIfWEKUAv8phOQmbdZf4s45eItBwULl5sGz-4lJReYcXQHGp5e8NSBSpQA/exec';

const $ = (id) => document.getElementById(id);
const results = $('results');
const swal = Swal;

let useFetch = true;

/* ============================ API client ============================ */

function buildUrl(action, params) {
  const qs = new URLSearchParams(Object.assign({ api: action }, params || {}));
  return API_URL + '?' + qs.toString();
}

async function apiFetch(url) {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function apiJsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'gsCallback_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const script = document.createElement('script');
    const timer = setTimeout(() => done(new Error('หมดเวลารอการตอบกลับจากเซิร์ฟเวอร์')), 60000);

    function done(err, data) {
      clearTimeout(timer);
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      if (err) reject(err); else resolve(data);
    }

    window[cb] = (data) => done(null, data);
    script.onerror = () => done(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'));
    script.src = url + '&callback=' + cb;
    document.head.appendChild(script);
  });
}

async function api(action, params) {
  const url = buildUrl(action, params);
  if (useFetch) {
    try {
      return await apiFetch(url);
    } catch (err) {
      if (!(err instanceof TypeError)) throw err;   // HTTP error จริง ไม่ต้อง fallback
      useFetch = false;                             // CORS/network -> ใช้ JSONP แทน
    }
  }
  return apiJsonp(url);
}

/* ============================ helpers ============================ */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function base64ToBlob(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'application/pdf' });
}

function saveBase64Pdf(b64, fileName) {
  const url = URL.createObjectURL(base64ToBlob(b64));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ============================ ค้นหา ============================ */

$('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (!q) {
    swal.fire({ icon: 'info', title: 'กรุณากรอกคำค้นหา', text: 'พิมพ์ชื่อ-สกุล หรือรหัสผู้ผ่านการอบรม' });
    $('q').focus();
    return;
  }
  $('btnSearch').disabled = true;
  swal.fire({ title: 'กำลังค้นหารายชื่อ...', allowOutsideClick: false, didOpen: () => swal.showLoading() });
  try {
    const res = await api('search', { q });
    swal.close();
    if (!res || !res.ok) throw new Error(res ? res.message : 'ไม่สามารถค้นหาได้');
    $('stats').textContent = 'ฐานข้อมูลทั้งหมด ' + res.total + ' ราย';
    render(res, {
      title: 'ผลการค้นหา “' + q + '”',
      count: res.count + ' จาก ' + res.total + ' ราย',
      showAll: true
    });
  } catch (err) {
    swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  } finally {
    $('btnSearch').disabled = false;
  }
});

/* ============================ รายชื่อทั้งหมด ============================ */

async function loadAll(silent) {
  if (!silent) swal.fire({ title: 'กำลังโหลดรายชื่อ...', allowOutsideClick: false, didOpen: () => swal.showLoading() });
  try {
    const res = await api('list');
    if (!res || !res.ok) throw new Error(res ? res.message : 'ไม่สามารถโหลดรายชื่อได้');
    $('stats').textContent = 'ฐานข้อมูลทั้งหมด ' + res.total + ' ราย';
    render(res, { title: 'รายชื่อผู้ผ่านการอบรมทั้งหมด', count: res.count + ' ราย' });
  } catch (err) {
    results.innerHTML = '<div class="empty">แสดงรายชื่อไม่สำเร็จ<br>' + esc(err.message) +
      '<br><button class="btn btn-view" onclick="loadAll()" style="margin-top:12px">ลองอีกครั้ง</button></div>';
    $('stats').textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ';
  }
}

function render(res, opts) {
  opts = opts || {};
  const head = opts.title
    ? '<div class="list-head"><span>' + esc(opts.title) + '</span>' +
      '<span class="list-count">' + esc(opts.count || (res.count + ' ราย')) + '</span>' +
      (opts.showAll ? '<button class="btn btn-view btn-all" data-act="all">&#8635; ดูรายชื่อทั้งหมด</button>' : '') +
      '</div>'
    : '';

  if (!res.results.length) {
    results.innerHTML = head +
      '<div class="empty">ไม่พบรายชื่อที่ตรงกับคำค้นหา<br>ลองตรวจสอบการสะกดหรือใช้คำค้นที่สั้นลง</div>';
    return;
  }

  results.innerHTML = head + res.results.map((r, i) => {
    const detail = [r.position, r.school, r.dept].filter(Boolean).map(esc);
    return '<article class="cert-card" style="animation-delay:' + Math.min(i, 20) * 30 + 'ms">' +
      '<div class="avatar">' + esc((r.fname || '?').trim().charAt(0)) + '</div>' +
      '<div class="info">' +
        '<h3>' + esc(r.fname) + ' <span class="rid">รหัส ' + esc(r.cer_id) + '</span></h3>' +
        (detail.length ? '<p>' + detail.join(' &middot; ') + '</p>' : '') +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn btn-dl" data-act="dl" data-id="' + esc(r.cer_id) + '">&#11015; ดาวน์โหลด PDF</button>' +
        '<button class="btn btn-view" data-act="view" data-id="' + esc(r.cer_id) + '">&#128064; ดูตัวอย่าง</button>' +
        '<button class="btn btn-mail" data-act="mail" data-id="' + esc(r.cer_id) + '" data-has="' + (r.hasEmail ? 1 : 0) + '" data-mask="' + esc(r.emailMasked) + '">&#9993; ส่งอีเมล</button>' +
        '<button class="btn btn-regen" data-act="regen" data-id="' + esc(r.cer_id) + '" title="ลบไฟล์เดิมและสร้างเกียรติบัตรใหม่">&#8635; สร้างใหม่</button>' +
      '</div>' +
    '</article>';
  }).join('') +
  (res.count > res.results.length
    ? '<div class="empty">พบ ' + res.count + ' ราย แสดงผล ' + res.results.length + ' รายแรก &mdash; ลองระบุคำค้นให้เฉพาะเจาะจงขึ้น</div>'
    : '');
}

results.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'all') {
    $('q').value = '';
    loadAll();
    return;
  }
  const id = btn.dataset.id;
  if (btn.dataset.act === 'dl') doDownload(id, false);
  else if (btn.dataset.act === 'view') doPreview(id, false);
  else if (btn.dataset.act === 'regen') doDownload(id, true);
  else doMail({ id: id, has: btn.dataset.has === '1', mask: btn.dataset.mask });
});

/* ============================ PDF ============================ */

async function doDownload(cerId, force) {
  swal.fire({
    title: force ? 'กำลังสร้างเกียรติบัตรใหม่...' : 'กำลังเตรียมไฟล์เกียรติบัตร...',
    allowOutsideClick: false,
    didOpen: () => swal.showLoading()
  });
  try {
    const res = await api('issue', { id: cerId, force: force ? '1' : '0' });
    if (!res || !res.ok) throw new Error(res ? res.message : 'สร้างไฟล์ไม่สำเร็จ');
    saveBase64Pdf(res.base64, res.fileName);
    swal.fire({
      icon: 'success',
      title: 'ดาวน์โหลดแล้ว',
      html: esc(res.fileName) + '<br><span style="font-size:13px;color:#64748b">' +
        (res.cached ? 'ใช้ไฟล์เดิมที่มีอยู่ในโฟลเดอร์ Drive' : 'สร้างไฟล์ใหม่และบันทึกลง Drive') + '</span>',
      timer: 2200,
      showConfirmButton: false
    });
  } catch (err) {
    swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  }
}

async function doPreview(cerId, force) {
  swal.fire({ title: 'กำลังเตรียมไฟล์เกียรติบัตร...', allowOutsideClick: false, didOpen: () => swal.showLoading() });
  try {
    const res = await api('issue', { id: cerId, force: force ? '1' : '0' });
    if (!res || !res.ok) throw new Error(res ? res.message : 'สร้างไฟล์ไม่สำเร็จ');
    swal.close();
    const url = URL.createObjectURL(base64ToBlob(res.base64));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  }
}

function base64ToBlob(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'application/pdf' });
}

function saveBase64Pdf(b64, fileName) {
  const url = URL.createObjectURL(base64ToBlob(b64));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ============================ อีเมล ============================ */

function doMail(info) {
  swal.fire({
    icon: 'info',
    title: 'ส่งเกียรติบัตรทางอีเมล',
    html: info.has
      ? 'อีเมลที่ลงทะเบียน: <b>' + esc(info.mask) + '</b><br><span style="font-size:13px;color:#64748b">เว้นว่างไว้เพื่อใช้อีเมลนี้ หรือกรอกอีเมลใหม่เพื่อส่งแทน</span>'
      : 'ไม่พบอีเมลในทะเบียน กรุณากรอกอีเมลผู้รับ',
    input: 'email',
    inputPlaceholder: 'name@example.com',
    showCancelButton: true,
    confirmButtonText: '&#9993; ส่งอีเมล',
    cancelButtonText: 'ยกเลิก',
    showLoaderOnConfirm: true,
    preConfirm: (value) => {
      if (!value && !info.has) {
        swal.showValidationMessage('กรุณากรอกอีเมลผู้รับ');
        return false;
      }
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        swal.showValidationMessage('รูปแบบอีเมลไม่ถูกต้อง');
        return false;
      }
      return value || '';
    }
  }).then(async (r) => {
    if (!r.isConfirmed) return;
    swal.fire({ title: 'กำลังส่งอีเมล...', allowOutsideClick: false, didOpen: () => swal.showLoading() });
    try {
      const res = await api('mail', { id: info.id, email: r.value || '' });
      if (!res || !res.ok) throw new Error(res ? res.message : 'ส่งอีเมลไม่สำเร็จ');
      swal.fire({ icon: 'success', title: 'ส่งเรียบร้อย', text: res.message, timer: 2400, showConfirmButton: false });
    } catch (err) {
      swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
    }
  });
}

/* ============================ เริ่มต้น ============================ */

(async function init() {
  const prefill = new URLSearchParams(location.search).get('q');
  if (prefill) $('q').value = prefill;

  await loadAll(true);

  if (prefill) $('searchForm').dispatchEvent(new Event('submit'));
})();

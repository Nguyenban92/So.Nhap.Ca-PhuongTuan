function parseVnd(v) {
  return Number(String(v).replace(/\D/g, ''));
}

function formatVnd(v) {
  const d = String(v).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

document.addEventListener('input', e => {
  const i = e.target;
  if (!i.matches('[data-currency]')) return;
  const at = i.selectionStart || 0,
    n = i.value.slice(0, at).replace(/\D/g, '').length;
  i.value = formatVnd(i.value);
  let pos = 0, count = 0;
  while (pos < i.value.length && count < n) {
    if (/\d/.test(i.value[pos])) count++;
    pos++;
  }
  i.setSelectionRange(pos, pos);
}, true);

const $ = id => document.getElementById(id),
  num = n => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n),
  money = n => num(Math.round(n)) + ' ₫',
  esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

let data;
try {
  data = JSON.parse(localStorage.getItem('soca-v1'));
} catch {}

if (!data) {
  data = {
    products: [
      { id: 'ca-nuc', name: 'Cá nục khô', min: 5 },
      { id: 'ca-chi', name: 'Cá chỉ vàng khô', min: 5 },
      { id: 'ca-ngan', name: 'Cá ngân khô', min: 0 }
    ],
    tx: []
  };
}

let mode = '';
let archiveMode = false,
  activeMonth = today().slice(0, 7);

const monthStart = m => m + '-01',
  monthEnd = m => {
    const [y, n] = m.split('-').map(Number);
    return m + '-' + new Date(y, n, 0).getDate();
  };

function save() {
  try {
    localStorage.setItem('soca-v1', JSON.stringify(data));
    return true;
  } catch {
    alert('Không thể lưu dữ liệu. Vui lòng sao lưu và kiểm tra dung lượng trình duyệt.');
    return false;
  }
}

const unit = t => t.unit || 'kg',
  unitName = u => (u === 'box' ? 'thùng' : 'kg'),
  kg = t => t.qty * (unit(t) === 'box' ? 17 : 1);

const stock = (id, u = 'kg') => {
  const n = Math.round(data.tx.filter(t => t.product === id).reduce((s, t) => s + (t.type === 'in' ? kg(t) : -kg(t)), 0) * 1000) / 1000;
  return u === 'box' ? n / 17 : n;
};

const pname = id => data.products.find(p => p.id === id)?.name || '';

function toast(s) {
  $('toast').textContent = s;
  $('toast').hidden = false;
  setTimeout(() => ($('toast').hidden = true), 3000);
}

function filtered() {
  return data.tx
    .filter(
      t =>
        (archiveMode || t.date.slice(0, 7) === today().slice(0, 7)) &&
        (!$('typeFilter').value || t.type === $('typeFilter').value) &&
        (!$('from').value || t.date >= $('from').value) &&
        (!$('to').value || t.date <= $('to').value) &&
        [t.code, pname(t.product), t.partner, t.note]
          .join(' ')
          .toLocaleLowerCase('vi')
          .includes($('search').value.toLocaleLowerCase('vi'))
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
}

function updateRetailProductOptions() {
  const select = $('retailProduct');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = data.products
    .map(p => `<option value="${p.id}">${esc(p.name)} (Tồn: ${num(stock(p.id))} kg)</option>`)
    .join('');
  if (currentVal && data.products.some(p => p.id === currentVal)) {
    select.value = currentVal;
  } else if (data.products[0]) {
    select.value = data.products[0].id;
  }
}

function updateRetailAmount() {
  const q = +$('retailQty').value;
  const p = parseVnd($('retailPriceKg').value);
  const el = $('retailAmountVal');
  if (q > 0 && p > 0 && $('retailPriceKg').value.trim() !== '') {
    el.textContent = money(Math.round(q * p));
  } else {
    el.textContent = '—';
  }
}

function render() {
  // 1. Render danh sách sản phẩm thùng
  $('products').innerHTML = data.products
    .map(p => {
      const image = p.id === 'ca-nuc' ? 'ca-nuc.jpg' : p.id === 'ca-chi' ? 'ca-chi.jpg' : p.id === 'ca-ngan' ? 'ca-ngan.jpg' : null;
      return `<article class="product">
        <div class="photo">${image ? `<img src="${image}" alt="${esc(p.name)}">` : '<span class="noimage">' + esc(p.name) + '</span>'}</div>
        <div class="productbody">
          <div class="producttitle">
            <h3>${esc(p.name)}</h3>
            <span class="stockpair">1 thùng = 17 kg</span>
          </div>
          <label class="qtyrow">
            <input type="number" min="1" max="1000000000" step="1" placeholder="Nhập số thùng" aria-label="Số lượng ${esc(p.name)}" data-qty="${p.id}">
            <select data-unit="${p.id}" aria-label="Đơn vị ${esc(p.name)}">
              <option value="box">thùng</option>
              <option value="kg">kg</option>
            </select>
          </label>
          <label class="boxpricelabel">
            Giá mỗi thùng (VNĐ)
            <input type="text" inputmode="numeric" data-currency data-boxprice="${p.id}" aria-label="Giá mỗi thùng ${esc(p.name)}" min="0" max="1000000000000" step="1" placeholder="Nhập giá 1 thùng" value="${formatVnd(data.dailyBoxPrices?.[$('entryDate').value]?.[p.id] ?? '')}">
          </label>
          <div class="entryamount" data-amount="${p.id}">Thành tiền: —</div>
          <div class="productactions">
            <button class="primary" data-plus="${p.id}">Ghi nhận hàng</button>
          </div>
        </div>
      </article>`;
    })
    .join('');

  // 2. Cập nhật menu chọn loại cá cho Tab Hàng Lẻ
  updateRetailProductOptions();

  // 3. Cập nhật tổng nhận trong ngày đang chọn
  const received = data.tx
    .filter(t => t.type === 'in' && t.date === $('entryDate').value)
    .reduce((s, t) => s + kg(t), 0);

  $('stockTotal').innerHTML = `<span>TỔNG NHẬN NGÀY ${($('entryDate').value || today()).split('-').reverse().join('/')}<small>1 thùng = 17 kg</small></span>
    <div>
      <strong>${num(received)} <small>kg</small></strong>
      <strong>${num(received / 17)} <small>thùng quy đổi</small></strong>
    </div>`;

  // 4. Render bảng lịch sử
  const rows = filtered();
  $('rows').innerHTML = rows.length
    ? rows
        .map(
          t => `<tr>
            <td>${esc(t.code)}</td>
            <td>${t.date.split('-').reverse().join('/')}</td>
            <td>${esc(pname(t.product))}</td>
            <td><span class="badge ${t.type}">${t.type === 'in' ? 'Nhận hàng' : 'Xuất (dữ liệu cũ)'}</span></td>
            <td>${t.type === 'in' ? '+' : '−'}${num(t.qty)} ${unitName(unit(t))}${unit(t) === 'box' ? '<small class="kgdetail">' + num(kg(t)) + ' kg</small>' : ''}</td>
            <td>${money(t.price)}</td>
            <td>${money(kg(t) * t.price)}</td>
            <td>${esc(t.partner || '—')}${t.note ? '<br><small>' + esc(t.note) + '</small>' : ''}</td>
            <td><button class="delete" data-delete="${t.id}" title="Xóa phiếu">×</button></td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="9"><div class="empty">Chưa có lần nhận hàng trong khoảng ngày này.</div></td></tr>';

  const a = rows.filter(t => t.type === 'in');
  $('tablefoot').innerHTML = `<span>${rows.length} lần ghi nhận</span><span class="flowtotals">Tổng nhận: <b>${summary(a)}</b></span>`;
}

function summary(rows) {
  const n = rows.reduce((s, t) => s + kg(t), 0);
  return num(n) + ' kg (' + num(n / 17) + ' thùng quy đổi)';
}

// Xử lý chuyển TAB
$('tabBulk').onclick = () => {
  $('tabBulk').classList.add('active');
  $('tabRetail').classList.remove('active');
  $('stockPanel').hidden = false;
  $('retailPanel').hidden = true;
};

$('tabRetail').onclick = () => {
  $('tabRetail').classList.add('active');
  $('tabBulk').classList.remove('active');
  $('stockPanel').hidden = true;
  $('retailPanel').hidden = false;
  updateRetailProductOptions();
  $('retailQty').focus();
};

// Xử lý tính thành tiền cho Tab Hàng Lẻ
$('retailQty').oninput = updateRetailAmount;
$('retailPriceKg').oninput = updateRetailAmount;
$('retailProduct').onchange = () => {
  const pid = $('retailProduct').value;
  const d = $('entryDate').value;
  // Gợi ý giá nếu có
  if (data.dailyRetailPrices?.[d]?.[pid]) {
    $('retailPriceKg').value = formatVnd(data.dailyRetailPrices[d][pid]);
  } else if (data.dailyBoxPrices?.[d]?.[pid]) {
    $('retailPriceKg').value = formatVnd(Math.round(data.dailyBoxPrices[d][pid] / 17));
  }
  updateRetailAmount();
};

// Xử lý nút "Ghi nhận hàng lẻ"
$('retailSubmit').onclick = () => {
  const prodId = $('retailProduct').value;
  const qty = +$('retailQty').value;
  const priceKg = parseVnd($('retailPriceKg').value);

  if (!$('entryDate').value) {
    $('entryDate').reportValidity();
    return;
  }
  if (!$('entryPartner').value.trim()) {
    toast('Vui lòng nhập tên người giao hàng.');
    $('entryPartner').focus();
    return;
  }
  if (!prodId) {
    toast('Vui lòng chọn loại cá.');
    return;
  }
  if (!$('retailQty').reportValidity() || !Number.isFinite(qty) || qty <= 0) {
    toast('Vui lòng nhập số kg lớn hơn 0.');
    $('retailQty').focus();
    return;
  }
  if ($('retailPriceKg').value.trim() === '' || !Number.isFinite(priceKg) || priceKg < 0 || priceKg > 1e12) {
    toast('Vui lòng nhập giá mỗi kg hợp lệ.');
    $('retailPriceKg').focus();
    return;
  }

  const newTx = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
    code: 'PN-' + Date.now().toString().slice(-8),
    date: $('entryDate').value,
    type: 'in',
    product: prodId,
    unit: 'kg',
    qty: qty,
    boxPrice: priceKg * 17,
    price: priceKg,
    partner: $('entryPartner').value.trim(),
    note: ($('entryNote').value.trim() ? $('entryNote').value.trim() + ' ' : '') + '(Hàng lẻ)',
    created: Date.now()
  };

  data.tx.push(newTx);
  data.dailyRetailPrices ??= {};
  data.dailyRetailPrices[$('entryDate').value] ??= {};
  data.dailyRetailPrices[$('entryDate').value][prodId] = priceKg;

  data.dailyBoxPrices ??= {};
  data.dailyBoxPrices[$('entryDate').value] ??= {};
  data.dailyBoxPrices[$('entryDate').value][prodId] = priceKg * 17;

  if (save()) {
    $('retailQty').value = '';
    updateRetailAmount();
    render();
    toast('Đã ghi nhận ' + num(qty) + ' kg ' + pname(prodId) + ' (Hàng lẻ).');
  }
};

function open(kind, id, type) {
  mode = kind;
  $('error').textContent = '';
  $('form').reset();
  $('modalTitle').textContent = kind === 'product' ? 'Thêm loại cá mới' : 'Tạo phiếu nhập / xuất';
  $('fields').innerHTML =
    kind === 'product'
      ? '<label>Tên loại cá *<input name="name" required maxlength="80" placeholder="Ví dụ: Cá cơm khô"></label><input name="min" type="hidden" value="0">'
      : `<label>Loại giao dịch<select name="type"><option value="in">Nhập hàng (+ tồn kho)</option><option value="out">Xuất hàng (− tồn kho)</option></select></label>
         <label>Ngày giao dịch *<input name="date" type="date" value="${today()}" required></label>
         <label>Loại cá *<select name="product" required>${data.products.map(p => `<option value="${p.id}">${esc(p.name)} — tồn ${num(stock(p.id))} kg</option>`).join('')}</select></label>
         <label>Đơn vị<select name="unit"><option value="box">thùng</option><option value="kg">kg</option></select></label>
         <label>Số lượng *<input name="qty" type="number" min="0.001" max="1000000000" step="0.001" value="1" required></label>
         <label>Đơn giá (VNĐ / kg)<input name="price" type="number" min="0" max="1000000000000" step="1" value="0" required></label>
         <label>Khách hàng / Nhà cung cấp<input name="partner" maxlength="120" placeholder="Tên đối tác"></label>
         <label>Ghi chú<input name="note" maxlength="250" placeholder="Thông tin thêm về phiếu hàng"></label>`;
  if (kind === 'tx') {
    if (!data.products.length) {
      toast('Hãy thêm loại cá trước.');
      return;
    }
    if (id) $('form').elements.product.value = id;
    if (type) $('form').elements.type.value = type;
  }
  $('dialog').showModal();
}

$('form').onsubmit = e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (mode === 'product') {
    const name = f.name.trim();
    if (!name || data.products.some(p => p.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) {
      $('error').textContent = 'Tên loại cá trống hoặc đã tồn tại.';
      return;
    }
    data.products.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
      name,
      min: +f.min
    });
  } else {
    if (f.type === 'out' && +f.qty > stock(f.product, f.unit)) {
      $('error').textContent = 'Số lượng xuất vượt tồn kho hiện tại.';
      return;
    }
    data.tx.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
      code: (f.type === 'in' ? 'PN' : 'PX') + '-' + Date.now().toString().slice(-8),
      date: f.date,
      type: f.type,
      product: f.product,
      unit: f.unit,
      qty: +f.qty,
      price: +f.price,
      partner: f.partner.trim(),
      note: f.note.trim(),
      created: Date.now()
    });
  }
  if (save()) {
    $('dialog').close();
    render();
    toast('Đã lưu và cập nhật tồn kho.');
  }
};

$('newProduct').onclick = () => open('product');
$('newTx').onclick = () => open('tx');
$('cancel').onclick = $('close').onclick = () => $('dialog').close();

$('products').onclick = e => {
  const b = e.target.closest('button'),
    id = b?.dataset.plus || b?.dataset.minus;
  if (!id) return;
  const input = document.querySelector('[data-qty="' + id + '"]'),
    qty = +input.value,
    u = document.querySelector('[data-unit="' + id + '"]').value,
    type = b.dataset.plus ? 'in' : 'out',
    priceInput = document.querySelector('[data-boxprice="' + id + '"]'),
    boxPrice = parseVnd(priceInput.value);

  if (!input.reportValidity() || !Number.isFinite(qty) || qty <= 0) {
    toast('Vui lòng nhập số lượng lớn hơn 0.');
    input.focus();
    return;
  }
  if (priceInput.value === '' || !priceInput.reportValidity() || !Number.isFinite(boxPrice) || boxPrice < 0 || boxPrice > 1e12) {
    toast('Vui lòng nhập giá mỗi thùng hợp lệ.');
    priceInput.focus();
    return;
  }
  if (u === 'box' && !Number.isInteger(qty)) {
    toast('Số thùng phải là số nguyên.');
    input.focus();
    return;
  }
  if (!$('entryPartner').value.trim()) {
    toast('Vui lòng nhập tên người giao hàng.');
    $('entryPartner').focus();
    return;
  }
  if (!$('entryDate').value) {
    $('entryDate').reportValidity();
    return;
  }

  data.tx.push({
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
    code: (type === 'in' ? 'PN' : 'PX') + '-' + Date.now().toString().slice(-8),
    date: $('entryDate').value,
    type,
    product: id,
    unit: u,
    qty,
    boxPrice,
    price: boxPrice / 17,
    partner: $('entryPartner').value.trim(),
    note: $('entryNote').value.trim(),
    created: Date.now()
  });

  data.dailyBoxPrices ??= {};
  data.dailyBoxPrices[$('entryDate').value] ??= {};
  data.dailyBoxPrices[$('entryDate').value][id] = boxPrice;

  if (save()) {
    render();
    toast('Đã ' + (type === 'in' ? 'nhập ' : 'xuất ') + num(qty) + ' ' + unitName(u) + ' ' + pname(id) + '.');
  }
};

$('rows').onclick = e => {
  const id = e.target.closest('button')?.dataset.delete;
  if (!id) return;
  const t = data.tx.find(t => t.id === id);
  if (confirm('Xóa lần nhận hàng này? Lịch sử sẽ được cập nhật.')) {
    data.tx = data.tx.filter(t => t.id !== id);
    save();
    render();
  }
};

['search', 'from', 'to', 'typeFilter'].forEach(id => ($(id).oninput = render));

$('clear').onclick = () => {
  archiveMode = false;
  $('search').value = '';
  $('typeFilter').value = 'in';
  setMonth();
  render();
};

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('backup').onclick = () =>
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'So-Ca-sao-luu-' + today() + '.json');

$('restore').onclick = () => $('restoreFile').click();

$('restoreFile').onchange = async e => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    if (
      !Array.isArray(d.products) ||
      !Array.isArray(d.tx) ||
      d.products.some(p => typeof p.id !== 'string' || typeof p.name !== 'string' || !Number.isFinite(p.min) || p.min < 0) ||
      new Set(d.products.map(p => p.id)).size !== d.products.length ||
      d.tx.some(
        t =>
          !d.products.some(p => p.id === t.product) ||
          !['in', 'out'].includes(t.type) ||
          !['kg', 'box'].includes(unit(t)) ||
          (unit(t) === 'box' && !Number.isInteger(t.qty)) ||
          !Number.isFinite(t.qty) ||
          t.qty <= 0 ||
          !Number.isFinite(t.price) ||
          t.price < 0 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(t.date) ||
          typeof t.id !== 'string' ||
          typeof t.code !== 'string' ||
          !Number.isFinite(t.created)
      )
    )
      throw Error();
    if (confirm('Thay thế dữ liệu hiện tại bằng bản sao lưu này?')) {
      data = d;
      save();
      render();
      toast('Đã khôi phục dữ liệu.');
    }
  } catch {
    alert('File sao lưu không hợp lệ.');
  }
  e.target.value = '';
};

$('excel').onclick = () => {
  if (!window.XLSX) {
    alert('Không tải được bộ xuất Excel. Hãy tải lại trang.');
    return;
  }
  const wb = XLSX.utils.book_new(),
    rows = filtered();
  const tx = rows.map(t => ({
    Ngày: t.date,
    'Tên cá': pname(t.product),
    Loại: t.type === 'in' ? 'Nhập' : 'Xuất',
    'Số lượng': t.qty,
    'Đơn vị': unitName(unit(t)),
    'Khối lượng quy đổi (kg)': kg(t),
    'Giá mỗi thùng (VNĐ)': t.boxPrice ?? t.price * 17,
    'Đơn giá mỗi kg (VNĐ)': t.price,
    'Thành tiền (VNĐ)': kg(t) * t.price,
    'Đối tác': t.partner,
    'Ghi chú': t.note
  }));
  let ws = XLSX.utils.json_to_sheet(tx.length ? tx : [{ 'Thông tin': 'Chưa có giao dịch trong bộ lọc này' }]);
  ws['!cols'] = [14, 14, 25, 12, 18, 12, 20, 22, 25, 35].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Nhap xuat da loc');
  XLSX.writeFile(wb, 'So-Ca-' + today() + '.xlsx');
  toast('Đã xuất Excel theo bộ lọc.');
};

$('pdf').onclick = () => {
  const h = $('historyPanel').hidden;
  $('historyPanel').hidden = false;
  const p = document.createElement('div');
  p.className = 'reporttitle';
  p.textContent = 'Sổ Xuất Nhập Cá - Đỗ Phương Tuấn | ' + ($('from').value || 'Từ đầu') + ' — ' + ($('to').value || today());
  $('historyPanel').prepend(p);
  window.print();
  p.remove();
  $('historyPanel').hidden = h;
};

$('entryDate').value = today();
if (!data.products.some(p => p.id === 'ca-ngan')) {
  data.products.push({ id: 'ca-ngan', name: 'Cá ngân khô', min: 0 });
  data.products = data.products.filter(p => p.id !== 'ca-du' || data.tx.some(t => t.product === p.id));
  save();
  render();
}

$('products').onchange = e => {
  if (!e.target.matches('[data-unit]')) return;
  const i = document.querySelector('[data-qty="' + e.target.dataset.unit + '"]');
  i.step = e.target.value === 'box' ? '1' : '0.001';
  i.min = e.target.value === 'box' ? '1' : '0.001';
};

if (!data.conversion17) {
  data.conversion17 = true;
  save();
}

function setMonth() {
  const m = today().slice(0, 7);
  $('from').value = monthStart(m);
  $('to').value = monthEnd(m);
  $('historyTitle').textContent = 'Lịch sử tháng ' + m.slice(5) + '/' + m.slice(0, 4);
  $('archiveButton').textContent = 'Tra cứu tháng cũ';
}

$('archiveButton').onclick = () => {
  archiveMode = !archiveMode;
  if (archiveMode) {
    $('from').value = '';
    $('to').value = '';
    $('historyTitle').textContent = 'Tra cứu lịch sử';
    $('archiveButton').textContent = 'Về tháng hiện tại';
  } else setMonth();
  render();
};

$('entryDate').onchange = () => {
  render();
  $('retailProduct').onchange();
};

$('typeFilter').value = 'in';
setMonth();
render();

setInterval(() => {
  if (!archiveMode && activeMonth !== today().slice(0, 7)) {
    activeMonth = today().slice(0, 7);
    setMonth();
    render();
  }
}, 30000);

$('products').oninput = e => {
  const card = e.target.closest('.product');
  if (!card) return;
  const qty = +card.querySelector('[data-qty]').value,
    u = card.querySelector('[data-unit]').value,
    p = card.querySelector('[data-boxprice]');
  card.querySelector('[data-amount]').textContent =
    'Thành tiền: ' + (p.value !== '' && qty > 0 ? money(Math.round(qty * (u === 'box' ? 1 : 1 / 17) * parseVnd(p.value))) : '—');
};

const unitChange = $('products').onchange;
$('products').onchange = e => {
  unitChange(e);
  $('products').oninput(e);
};

$('resetTestData').onclick = () => {
  if (!confirm('Xóa toàn bộ lịch sử, giá đã nhập và thông tin đã điền trên trình duyệt này để test lại từ đầu?')) return;
  const clean = {
    products: [
      { id: 'ca-nuc', name: 'Cá nục khô', min: 0 },
      { id: 'ca-chi', name: 'Cá chỉ vàng khô', min: 0 },
      { id: 'ca-ngan', name: 'Cá ngân khô', min: 0 }
    ],
    tx: [],
    conversion17: true,
    dailyBoxPrices: {},
    dailyRetailPrices: {}
  };
  try {
    localStorage.setItem('soca-v1', JSON.stringify(clean));
    localStorage.removeItem('soca-bill-settings');
  } catch {
    alert('Không xóa được dữ liệu. Vui lòng thử lại.');
    return;
  }
  data = clean;
  $('entryPartner').value = '';
  $('entryNote').value = '';
  $('entryDate').value = today();
  $('search').value = '';
  $('typeFilter').value = 'in';
  $('retailQty').value = '';
  $('retailPriceKg').value = '';
  $('retailAmountVal').textContent = '—';
  archiveMode = false;
  setMonth();
  document.querySelectorAll('#invoiceDialog input').forEach(i => (i.value = ''));
  $('billRows').innerHTML = '';
  $('billTotal').innerHTML = '';
  $('billCanvasWrap').hidden = true;
  const c = $('billCanvas');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
  render();
  toast('Đã xóa dữ liệu. Có thể test lại từ đầu.');
};

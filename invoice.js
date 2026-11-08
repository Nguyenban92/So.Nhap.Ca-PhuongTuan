let billSource = [];
const billIds = ['billSeller', 'billPhone', 'billBuyer', 'billDate', 'billCode', 'billNote'];

function chosenBill() {
  return [...document.querySelectorAll('#billRows tr')]
    .filter(r => r.querySelector('input[type=checkbox]')?.checked)
    .map(r => {
      const t = billSource.find(t => t.id === r.dataset.id);
      return { ...t, billPrice: parseVnd(r.querySelector('[data-billprice]').value) / 17 };
    });
}

function billTotal() {
  const ts = chosenBill(),
    weight = ts.reduce((s, t) => s + kg(t), 0),
    total = ts.reduce((s, t) => s + kg(t) * t.billPrice, 0);
  $('billTotal').innerHTML = `<span>${ts.length} dòng • <b>${num(weight)} kg</b> • ${num(weight / 17)} thùng quy đổi</span><strong>Tổng tiền: ${money(total)}</strong>`;
  $('billCanvasWrap').hidden = true;
}

$('invoiceOpen').onclick = () => {
  billSource = data.tx
    .filter(t => t.type === 'in' && t.date === ($('entryDate').value || today()))
    .sort((a, b) => b.created - a.created);
  const first = billSource[0];
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem('soca-bill-settings')) || {};
  } catch {}
  $('billSeller').value = 'ĐỖ PHƯƠNG TUẤN';
  $('billPhone').value = settings.phone || '';
  const people = [...new Set(billSource.map(t => t.partner).filter(Boolean))];
  $('billBuyer').value = people.length === 1 ? people[0] : people.length > 1 ? 'Nhiều người giao (chi tiết bên dưới)' : $('entryPartner').value;
  $('billDate').value = first?.date || $('entryDate').value || today();
  $('billCode').value = 'HD-' + Date.now().toString().slice(-8);
  $('billNote').value = '';
  $('billError').textContent = '';
  $('billCanvasWrap').hidden = true;
  $('billRows').innerHTML =
    billSource
      .map(
        t => `<tr data-id="${esc(t.id)}">
          <td><input type="checkbox" aria-label="Đã nhận ${esc(pname(t.product))}" checked disabled></td>
          <td>${esc(t.date.split('-').reverse().join('/'))}<small class="kgdetail">${esc(t.partner || 'Chưa có tên người giao')}</small></td>
          <td>${esc(pname(t.product))}</td>
          <td>${num(t.qty)} ${unitName(unit(t))}</td>
          <td>${num(kg(t))} kg</td>
          <td><input type="text" inputmode="numeric" data-currency data-billprice aria-label="Giá thùng ${esc(pname(t.product))}" min="0" max="1000000000000" step="any" value="${formatVnd(Math.round(t.boxPrice ?? (t.price || 0) * 17))}"></td>
        </tr>`
      )
      .join('') || '<tr><td colspan="6">Chưa có lần nhận hàng trong ngày này.</td></tr>';
  billTotal();
  $('invoiceDialog').showModal();
  if (billSource.length) buildBill();
};

$('invoiceClose').onclick = () => $('invoiceDialog').close();
$('billRows').oninput = billTotal;
billIds.forEach(id => ($(id).oninput = () => ($('billCanvasWrap').hidden = true)));

function buildBill() {
  const ts = chosenBill();
  $('billError').textContent = '';
  if (!ts.length) {
    $('billError').textContent = 'Chọn ít nhất một lần nhận hàng.';
    return false;
  }
  if (!$('billBuyer').value.trim() || !$('billSeller').value.trim() || !$('billDate').value || !$('billCode').value.trim()) {
    $('billError').textContent = 'Vui lòng điền tên cơ sở, tên người giao hàng, ngày và số hóa đơn.';
    return false;
  }
  if (
    ts.some(t => !Number.isFinite(t.billPrice) || t.billPrice < 0 || t.billPrice * 17 > 1e12) ||
    [...document.querySelectorAll('#billRows [data-billprice]')].some(i => !i.reportValidity())
  ) {
    $('billError').textContent = 'Đơn giá không hợp lệ.';
    return false;
  }

  try {
    localStorage.setItem(
      'soca-bill-settings',
      JSON.stringify({ seller: $('billSeller').value.trim(), phone: $('billPhone').value.trim() })
    );
  } catch {}

  const groups = ts.map(t => ({
    product: t.product,
    price: t.billPrice * 17,
    weight: kg(t),
    parts: [kg(t) / 17],
    partner: t.partner || 'Chưa ghi tên',
    code: t.code,
    note: t.note || '',
    unit: unit(t)
  }));

  const weight = groups.reduce((n, g) => n + g.weight, 0),
    amount = g => Math.round((g.weight / 17) * g.price),
    total = groups.reduce((n, g) => n + amount(g), 0),
    pages = Math.ceil(groups.length / 4);

  billPages = [];
  document.querySelectorAll('.extraBillPage').forEach(c => c.remove());

  for (let page = 0; page < pages; page++) {
    const c = page === 0 ? $('billCanvas') : document.createElement('canvas');
    c.width = 900;
    c.height = 1600;
    if (page) {
      c.className = 'extraBillPage';
      $('billCanvasWrap').append(c);
    }
    billPages.push(c);

    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 900, 1600);
    const ink = '#203b30';

    function txt(t, a, b, size = 24, bold = false, align = 'left', max = 810) {
      x.fillStyle = ink;
      x.textAlign = align;
      let n = size;
      x.font = `${bold ? 'bold ' : ''}${n}px Arial`;
      while (x.measureText(String(t)).width > max && n > 11) {
        n--;
        x.font = `${bold ? 'bold ' : ''}${n}px Arial`;
      }
      x.fillText(String(t), a, b);
    }

    function grid(y, h, cols) {
      x.strokeStyle = '#b8c5b8';
      x.lineWidth = 1.5;
      x.strokeRect(40, y, 820, h);
      if (cols)
        for (const a of [270, 380, 530, 710]) {
          x.beginPath();
          x.moveTo(a, y);
          x.lineTo(a, y + h);
          x.stroke();
        }
    }

    function line(y) {
      x.strokeStyle = '#dce5dd';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(40, y);
      x.lineTo(860, y);
      x.stroke();
    }

    x.fillStyle = '#edf4ed';
    x.fillRect(0, 0, 900, 205);
    txt($('billSeller').value.trim(), 45, 70, 37, true, 'left', 800);
    txt('HÓA ĐƠN NHẬN HÀNG', 45, 125, 33, true);
    txt(page + 1 + ' / ' + pages, 855, 170, 21, false, 'right');
    txt('Người giao: ' + $('billBuyer').value.trim(), 45, 250, 26, false, 'left', 810);
    txt('Người nhận: Đỗ Phương Tuấn', 45, 295, 26, true);
    txt('Ngày: ' + $('billDate').value.split('-').reverse().join('/'), 45, 337, 24);
    txt('1 thùng = 17 kg', 855, 337, 22, false, 'right');
    if ($('billPhone').value.trim()) txt('ĐT: ' + $('billPhone').value.trim(), 855, 70, 20, false, 'right', 350);
    line(365);

    x.fillStyle = '#fff0df';
    x.fillRect(40, 385, 820, 75);
    const cols = [52, 325, 455, 620, 845];
    ['Tên Cá', 'Số Thùng', 'Kg/Thùng', 'Giá/Thùng', 'Tổng Tiền'].forEach((t, i) =>
      txt(t, cols[i], 418, 20, true, i === 0 ? 'left' : i === 4 ? 'right' : 'center', i === 0 ? 230 : 130)
    );
    grid(385, 75, true);

    const slice = groups.slice(page * 4, page * 4 + 4);
    let y = 465;
    for (const g of slice) {
      const isRetail = g.unit === 'kg';
      txt(pname(g.product), 52, y + 40, 25, true, 'left', 230);
      txt(num(g.weight / 17), 325, y + 40, 25, true, 'center', 120);
      txt('17', 455, y + 40, 24, false, 'center');
      txt(money(g.price), 620, y + 40, 22, true, 'center', 165);
      txt(money(amount(g)), 845, y + 40, 23, true, 'right', 135);
      txt('Người giao: ' + g.partner + ' • ' + num(g.weight) + ' kg', 52, y + 84, 20, false, 'left', 790);

      if (isRetail) {
        txt(
          num(g.weight) +
            ' kg × ' +
            money(g.price / 17) +
            '/kg = ' +
            money(amount(g)) +
            ' (Quy đổi ' +
            num(g.weight / 17) +
            ' thùng)',
          52,
          y + 112,
          21,
          true,
          'left',
          790
        );
      } else {
        txt(num(g.weight / 17) + ' thùng × ' + money(g.price) + '/thùng = ' + money(amount(g)), 52, y + 112, 23, true, 'left', 790);
      }

      if (g.note) txt('Ghi chú: ' + g.note, 52, y + 140, 18, false, 'left', 790);
      grid(y, 60, true);
      grid(y + 60, 100, false);
      y += 160;
    }

    const last = page === pages - 1,
      subtotal = slice.reduce((n, g) => n + amount(g), 0);
    x.fillStyle = '#28563a';
    x.fillRect(40, 1130, 820, 120);
    x.fillStyle = '#fff';
    x.textAlign = 'left';
    x.font = 'bold 25px Arial';
    x.fillText(last ? 'TỔNG CỘNG TẤT CẢ CÁ' : 'CỘNG TRANG NÀY', 65, 1175);
    x.textAlign = 'right';
    x.font = 'bold 39px Arial';
    x.fillText(money(last ? total : subtotal), 835, 1225);

    txt(last ? 'Tổng: ' + num(weight) + ' kg • ' + num(weight / 17) + ' thùng quy đổi' : 'Hóa đơn còn tiếp ở trang sau', 45, 1292, 23, true);
    if (last) txt(groups.map(g => num(amount(g))).join(' + ') + ' = ' + money(total), 45, 1333, 21, false, 'left', 810);
    if ($('billNote').value.trim()) txt('Ghi chú: ' + $('billNote').value.trim(), 45, 1374, 21, false, 'left', 810);
    txt('Người nhận', 240, 1440, 26, true, 'center');
    txt('Người giao', 670, 1440, 26, true, 'center');
    txt('Đỗ Phương Tuấn', 240, 1535, 25, true, 'center');
    txt('(Ký, ghi họ tên)', 670, 1485, 21, false, 'center');
    txt('Số thùng lẻ quy đổi từ kg; tính tiền theo khối lượng gốc.', 450, 1580, 18, false, 'center', 810);
  }
  $('billCanvasWrap').hidden = false;
  return true;
}

let billPages = [];

$('billPreview').onclick = buildBill;

$('billPng').onclick = async () => {
  if (!buildBill()) return;
  for (let i = 0; i < billPages.length; i++) {
    const blob = await new Promise(resolve => billPages[i].toBlob(resolve, 'image/png'));
    if (!blob) {
      $('billError').textContent = 'Không xuất được ảnh.';
      return;
    }
    download(
      blob,
      'Hoa-don-' +
        $('billCode').value.replace(/[^a-zA-Z0-9_-]/g, '_') +
        (billPages.length > 1 ? '-trang-' + (i + 1) : '') +
        '.png'
    );
  }
  toast('Đã xuất ảnh hóa đơn 9:16.');
};

$('billPrint').onclick = () => {
  if (!buildBill()) return;
  const panel = document.createElement('div');
  panel.id = 'invoicePrint';
  for (const c of billPages) {
    const img = new Image();
    img.src = c.toDataURL('image/png');
    panel.append(img);
  }
  const img = panel.querySelector('img');
  document.body.append(panel);
  document.body.classList.add('printing-invoice');
  window.addEventListener(
    'afterprint',
    () => {
      document.body.classList.remove('printing-invoice');
      panel.remove();
    },
    { once: true }
  );
  img.onload = () => window.print();
};

$('billLoad').onclick = () => {
  const d = $('billDate').value;
  if (!d) return;
  $('entryDate').value = d;
  render();
  $('invoiceDialog').close();
  $('invoiceOpen').click();
};

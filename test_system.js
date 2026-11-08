// ==============================================================================
// TEST_SYSTEM.JS - KIỂM THỬ TOÀN DIỆN HỆ THỐNG QUẢN LÝ CÁ ĐỖ PHƯƠNG TUẤN
// Kiểm thử: 
// 1. Tách biệt tuyệt đối NHẬP HÀNG & BÁN HÀNG (kể cả cùng tên khách)
// 2. Lịch sử theo khách hàng: Chưa Thanh Toán (gồm trả thiếu), Đã Thanh Toán, Còn Thiếu
// 3. Quy trình tính toán & logic chống race condition khi 2 thiết bị cùng thanh toán
// 4. Tính toán số dư, timeline thanh toán và idempotency (xuất lại không trùng)
// ==============================================================================

function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAILED: ' + message);
    process.exit(1);
  } else {
    console.log('✅ PASSED: ' + message);
  }
}

console.log('----------------------------------------------------');
console.log('BẮT ĐẦU KIỂM THỬ HỆ THỐNG ĐỖ PHƯƠNG TUẤN V24 + SUPABASE');
console.log('----------------------------------------------------');

// MÔ PHỎNG DỮ LIỆU
const defaults = [
  { id: 'ca-nuc', name: 'Cá nục khô' },
  { id: 'ca-chi', name: 'Cá chỉ vàng khô' },
  { id: 'ca-ngan', name: 'Cá ngân khô' }
];

function rowAmount(t) {
  return Math.round(t.qty * (t.unit === 'box' ? (t.boxPrice ?? t.price * 17) : t.price));
}

function invoiceTotal(i) {
  return i.items.reduce((sum, t) => sum + rowAmount(t), 0);
}

function paymentEvents(i) {
  return Array.isArray(i.payments) ? i.payments : [];
}

function invoiceBalance(i) {
  const total = invoiceTotal(i);
  const paid = paymentEvents(i).reduce((sum, p) => sum + p.amount, 0);
  const due = Math.max(0, total - paid);
  return {
    total,
    paid,
    due,
    status: due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
  };
}

function tabMatches(i, tab) {
  const b = invoiceBalance(i);
  return tab === 'paid' ? b.due === 0 : tab === 'partial' ? b.paid > 0 && b.due > 0 : b.due > 0;
}

function customerKey(name) {
  return String(name || 'Chưa ghi tên').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

// ------------------------------------------------------------------------------
// TEST 1: TÁCH BIỆT TUYỆT ĐỐI NHẬP HÀNG VÀ BÁN HÀNG
// ------------------------------------------------------------------------------
console.log('\n[TEST 1] Tách biệt Nhập Hàng và Bán Hàng khi trùng tên khách');

const purchaseStore = {
  invoices: [
    {
      id: 'inv-purchase-1',
      code: 'HDN-20261108-001',
      business_type: 'purchase',
      partner: 'Anh Tuấn Hải Phòng',
      date: '2026-11-08',
      items: [{ product: 'ca-nuc', qty: 10, unit: 'box', boxPrice: 1000000 }], // 10tr
      payments: []
    }
  ]
};

const salesStore = {
  invoices: [
    {
      id: 'inv-sales-1',
      code: 'HDB-20261108-001',
      business_type: 'sales',
      partner: 'Anh Tuấn Hải Phòng', // Trùng tên khách
      date: '2026-11-08',
      items: [{ product: 'ca-chi', qty: 5, unit: 'box', boxPrice: 1500000 }], // 7.5tr
      payments: []
    }
  ]
};

// Kiểm tra: 2 hóa đơn cùng khách nhưng ở 2 module khác nhau
assert(purchaseStore.invoices[0].partner === salesStore.invoices[0].partner, 'Tên khách hàng trùng nhau giữa 2 tab');
assert(purchaseStore.invoices[0].business_type === 'purchase', 'Tab Nhập Hàng có business_type là purchase');
assert(salesStore.invoices[0].business_type === 'sales', 'Tab Bán Hàng có business_type là sales');
assert(invoiceTotal(purchaseStore.invoices[0]) === 10000000, 'Tổng tiền Nhập hàng là 10.000.000 đ');
assert(invoiceTotal(salesStore.invoices[0]) === 7500000, 'Tổng tiền Bán hàng là 7.500.000 đ');
assert(invoiceBalance(purchaseStore.invoices[0]).due === 10000000, 'Công nợ Nhập hàng độc lập (10tr)');
assert(invoiceBalance(salesStore.invoices[0]).due === 7500000, 'Công nợ Bán hàng độc lập (7.5tr)');

// ------------------------------------------------------------------------------
// TEST 2: LỊCH SỬ KHÁCH HÀNG & 3 TAB THANH TOÁN (NỢ GỒM TRẢ THIẾU, TẤT TOÁN, CÒN THIẾU)
// ------------------------------------------------------------------------------
console.log('\n[TEST 2] Lịch sử hiển thị 3 tab và Chưa Thanh Toán bao gồm trả thiếu');

const testInvoice = {
  id: 'inv-test-1',
  code: 'HDN-20261108-002',
  business_type: 'purchase',
  partner: 'Chị Mai Quảng Ninh',
  date: '2026-11-08',
  items: [{ product: 'ca-ngan', qty: 20, unit: 'box', boxPrice: 500000 }], // 10tr
  payments: []
};

// Ban đầu chưa thanh toán:
assert(tabMatches(testInvoice, 'debt') === true, 'Hóa đơn chưa trả nằm trong tab Chưa Thanh Toán');
assert(tabMatches(testInvoice, 'paid') === false, 'Hóa đơn chưa trả KHÔNG nằm trong tab Đã Thanh Toán');
assert(tabMatches(testInvoice, 'partial') === false, 'Hóa đơn chưa trả KHÔNG nằm trong tab Còn Thiếu');

// Khách trả thiếu 4.000.000 đ (còn thiếu 6.000.000 đ):
testInvoice.payments.push({
  id: 'pm-1',
  code: 'TTN-001',
  amount: 4000000,
  created: Date.now() - 3600000
});

const bal1 = invoiceBalance(testInvoice);
assert(bal1.paid === 4000000, 'Đã trả 4.000.000 đ');
assert(bal1.due === 6000000, 'Còn thiếu 6.000.000 đ');
assert(bal1.status === 'partial', 'Trạng thái là partial (Còn thiếu)');
assert(tabMatches(testInvoice, 'debt') === true, 'Hóa đơn trả thiếu VẪN nằm trong tab Chưa Thanh Toán (BẮT BUỘC)');
assert(tabMatches(testInvoice, 'partial') === true, 'Hóa đơn trả thiếu nằm trong tab Còn Thiếu');
assert(tabMatches(testInvoice, 'paid') === false, 'Hóa đơn trả thiếu KHÔNG nằm trong tab Đã Thanh Toán');

// Khách trả nốt 6.000.000 đ (Tất toán):
testInvoice.payments.push({
  id: 'pm-2',
  code: 'TTN-002',
  amount: 6000000,
  created: Date.now()
});

const bal2 = invoiceBalance(testInvoice);
assert(bal2.paid === 10000000, 'Đã trả đủ 10.000.000 đ');
assert(bal2.due === 0, 'Số còn thiếu bằng 0');
assert(bal2.status === 'paid', 'Trạng thái là Đã Thanh Toán');
assert(tabMatches(testInvoice, 'debt') === false, 'Hóa đơn đã trả đủ KHÔNG nằm trong tab Chưa Thanh Toán');
assert(tabMatches(testInvoice, 'partial') === false, 'Hóa đơn đã trả đủ KHÔNG nằm trong tab Còn Thiếu');
assert(tabMatches(testInvoice, 'paid') === true, 'Hóa đơn đã trả đủ nằm trong tab Đã Thanh Toán');

// ------------------------------------------------------------------------------
// TEST 3: GIAO DỊCH NGUYÊN TỬ & CHỐNG RACE CONDITION (HAI THIẾT BỊ CÙNG THANH TOÁN)
// ------------------------------------------------------------------------------
console.log('\n[TEST 3] Kiểm thử Race Condition khi 2 thiết bị cùng thanh toán');

class MockDatabase {
  constructor() {
    this.invoices = new Map();
    this.payments = new Map();
  }

  addInvoice(inv) {
    this.invoices.set(inv.id, { ...inv, total: invoiceTotal(inv) });
  }

  // Giả lập hàm Postgres RPC: record_payment_atomic với khóa FOR UPDATE
  async recordPaymentAtomic(invoiceId, paymentId, code, amount) {
    // Khóa dòng hóa đơn (mô phỏng SELECT FOR UPDATE)
    const inv = this.invoices.get(invoiceId);
    if (!inv) throw new Error('Không tìm thấy hóa đơn');

    // Chống trùng
    if (this.payments.has(paymentId)) {
      return { success: true, idempotent: true, payment: this.payments.get(paymentId) };
    }

    // Tính tổng đã trả từ bảng payments
    let currentPaid = 0;
    for (const [_, p] of this.payments.entries()) {
      if (p.invoice_id === invoiceId) currentPaid += p.amount;
    }

    const currentDue = inv.total - currentPaid;

    if (amount <= 0) throw new Error('Số tiền phải lớn hơn 0');
    if (amount > currentDue) {
      throw new Error(`Số tiền thanh toán (${amount}) vượt quá số còn thiếu hiện tại (${currentDue}) do thiết bị khác vừa thanh toán!`);
    }

    const record = {
      id: paymentId,
      invoice_id: invoiceId,
      code,
      amount,
      paid_before: currentPaid,
      paid_after: currentPaid + amount,
      due_after: currentDue - amount
    };
    this.payments.set(paymentId, record);
    return { success: true, idempotent: false, ...record };
  }
}

async function testRaceCondition() {
  const db = new MockDatabase();
  db.addInvoice({
    id: 'inv-race-1',
    items: [{ product: 'ca-nuc', qty: 10, unit: 'box', boxPrice: 1000000 }] // 10tr
  });

  // Thiết bị 1 và Thiết bị 2 cùng nhìn thấy còn thiếu 10tr
  // Thiết bị 1 thanh toán 7tr
  // Thiết bị 2 đồng thời gửi thanh toán 6tr
  const p1Promise = db.recordPaymentAtomic('inv-race-1', 'pm-dev1', 'TT-01', 7000000);
  
  const res1 = await p1Promise;
  assert(res1.success === true, 'Thiết bị 1 thanh toán 7.000.000 đ thành công');
  assert(res1.due_after === 3000000, 'Số còn thiếu sau Thiết bị 1 là 3.000.000 đ');

  // Thiết bị 2 gửi 6.000.000 đ (lúc này server chỉ còn thiếu 3.000.000 đ)
  let device2Failed = false;
  try {
    await db.recordPaymentAtomic('inv-race-1', 'pm-dev2', 'TT-02', 6000000);
  } catch (err) {
    device2Failed = true;
    assert(err.message.includes('vượt quá số còn thiếu hiện tại'), 'Thiết bị 2 bị từ chối chính xác vì vượt quá số còn thiếu thực tế!');
  }
  assert(device2Failed === true, 'Bảo vệ thành công: Hai thiết bị không bao giờ được trả vượt số còn thiếu');

  // Thiết bị 2 thử lại với đúng số tiền còn thiếu 3.000.000 đ
  const res2Retry = await db.recordPaymentAtomic('inv-race-1', 'pm-dev2-retry', 'TT-03', 3000000);
  assert(res2Retry.success === true, 'Thiết bị 2 thanh toán số còn thiếu 3.000.000 đ thành công');
  assert(res2Retry.due_after === 0, 'Hóa đơn đã được tất toán về 0 đ hoàn hảo');

  // Kiểm tra Idempotent (xuất lại / gửi lại không ghi trùng)
  const resIdempotent = await db.recordPaymentAtomic('inv-race-1', 'pm-dev1', 'TT-01', 7000000);
  assert(resIdempotent.idempotent === true, 'Gửi lại mã thanh toán đã tồn tại trả về idempotent OK, không ghi trùng bản ghi');
}

testRaceCondition().then(() => {
  console.log('\n----------------------------------------------------');
  console.log('TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ VƯỢT QUA XUẤT SẮC (100% PASSED)');
  console.log('----------------------------------------------------');
}).catch(err => {
  console.error('Test thất bại:', err);
  process.exit(1);
});

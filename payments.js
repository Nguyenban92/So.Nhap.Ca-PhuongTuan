let paymentInvoiceId=null,paymentExpectedVersion='',paymentDraftId='',paymentBusy=false,paymentCommitted=false;
let reportPages=[],reportSpec=null,reportBusy=false;
function latestLedger(key=storageKey()){
 if(typeof sync!=='undefined'&&sync.user&&sync.stores&&sync.stores[businessMode]){
  const s=sync.stores[businessMode];
  return {products:s.products||defaults,invoices:s.invoices||[],tx:s.tx||[]};
 }
 if(!storageReady)throw Error('Không đọc được lịch sử an toàn. Vui lòng tải lại trang.');
 const raw=localStorage.getItem(key),state=raw?JSON.parse(raw):data;
 if(!Array.isArray(state.invoices)||!Array.isArray(state.tx)||!Array.isArray(state.products))throw Error('Dữ liệu lịch sử không hợp lệ.');
 return state;
}
function ledgerLock(task,key=storageKey()){return typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(key+'-ledger',task):task()}
function savedPaymentPanel(){
 const invoice=data.invoices.find(i=>i.id===historyInvoiceId),panel=$('savedPaymentPanel');panel.hidden=!invoice;if(!invoice)return;
 const b=invoiceBalance(invoice);panel.innerHTML=`<span class="payment-status ${b.status}">${statusName(invoice)}</span><div class="payment-balance"><span>Đã trả <b>${money(b.paid)}</b></span><span>Còn thiếu <b>${money(b.due)}</b></span></div>${b.due>0?'<div class="record-actions"><button type="button" id="savedAddPayment">Trả Trước</button><button type="button" id="savedSettle">Đã Thanh Toán</button></div>':''}`;
 if(b.due>0){$('savedAddPayment').onclick=()=>{if(!exporting)openPayment(invoice.id)};$('savedSettle').onclick=()=>{if(!exporting)openPayment(invoice.id,true)}}
}
function openPayment(id,settle=false){
 if(paymentBusy)return;
 try{data=latestLedger();const invoice=data.invoices.find(i=>i.id===id);if(!invoice)throw Error('Không tìm thấy hóa đơn.');const b=invoiceBalance(invoice);if(b.due===0){toast('Hóa đơn đã thanh toán đủ.');renderHistory();return}
 paymentInvoiceId=id;paymentExpectedVersion=paymentVersion(invoice);paymentDraftId=uid();paymentCommitted=false;
 $('paymentTitle').textContent=settle?'Tất toán hóa đơn':'Thanh toán hóa đơn';
 $('paymentInvoiceInfo').innerHTML=`<b>${esc(invoice.partner)}</b><small>${esc(invoice.code)} · ${esc(receiptDateLabel())} ${esc(shortDate(invoice.date))}</small><small>Ngày thanh toán: ${esc(shortDate(today()))}</small>`;
 $('paymentBalanceInfo').innerHTML=`<span>Tổng hóa đơn <b>${money(b.total)}</b></span><span>Đã trả trước <b>${money(b.paid)}</b></span><span>Còn thiếu <b>${money(b.due)}</b></span>`;
 $('paymentAmount').value=settle?formatVnd(b.due):'';$('paymentRemaining').value=formatVnd(settle?0:b.due);$('paymentNote').value='';$('paymentMethod').value='Tiền Mặt';$('paymentError').textContent='';$('paymentPreviewArea').hidden=true;$('paymentPreviewArea').innerHTML='';
 setPaymentBusy(false);$('paymentDialog').showModal();
 }catch(e){toast(e.message)}
}
function setPaymentBusy(busy){paymentBusy=busy;for(const id of ['paymentAmount','paymentRemaining','paymentMethod','paymentNote','paymentSubmit'])$(id).disabled=busy||paymentCommitted;$('paymentClose').disabled=busy;$('paymentPreview').disabled=busy||paymentCommitted}
function paymentInputs(changed){const invoice=data.invoices.find(i=>i.id===paymentInvoiceId);if(!invoice)return;const b=invoiceBalance(invoice),amount=parseVnd($(changed).value);if(changed==='paymentAmount')$('paymentRemaining').value=amount<=b.due?formatVnd(b.due-amount):'';else $('paymentAmount').value=amount<=b.due?formatVnd(b.due-amount):'';$('paymentPreviewArea').hidden=true;$('paymentError').textContent=amount>b.due?'Số tiền không được vượt phần còn thiếu '+money(b.due)+'.':''}
$('paymentAmount').oninput=()=>paymentInputs('paymentAmount');$('paymentRemaining').oninput=()=>paymentInputs('paymentRemaining');
for(const id of ['paymentMethod','paymentNote'])$(id).oninput=()=>$('paymentPreviewArea').hidden=true;
function currentPayment(){const invoice=data.invoices.find(i=>i.id===paymentInvoiceId);if(!invoice)throw Error('Không tìm thấy hóa đơn.');const b=invoiceBalance(invoice),amount=parseVnd($('paymentAmount').value),remaining=parseVnd($('paymentRemaining').value);if(!$('paymentAmount').value||!Number.isSafeInteger(amount)||amount<=0||amount>b.due||!$('paymentRemaining').value||remaining!==b.due-amount)throw Error('Kiểm tra số trả thêm và còn thiếu. Số trả thêm phải lớn hơn 0, tối đa '+money(b.due)+'.');return {invoice,event:{id:paymentDraftId,code:paymentPrefix()+'-'+today().replaceAll('-','')+'-'+paymentDraftId.slice(0,8).toUpperCase(),date:today(),created:Date.now(),amount,paidBefore:b.paid,paidAfter:b.paid+amount,dueAfter:b.due-amount,method:$('paymentMethod').value,note:$('paymentNote').value.trim()}}}
$('paymentPreview').onclick=()=>{try{const {invoice,event}=currentPayment();const pages=financialPages([invoice],'payment',event);mountPages('paymentPreviewArea',pages);$('paymentError').textContent=''}catch(e){$('paymentError').textContent=e.message}};
$('paymentForm').onsubmit=async e=>{
 e.preventDefault();if(paymentBusy||paymentCommitted)return;const operationKey=storageKey();
 let attempt;try{attempt=currentPayment()}catch(error){$('paymentError').textContent=error.message;return}
 setPaymentBusy(true);$('paymentError').textContent='';
 try{
  // 1. Tạo ảnh phiếu thanh toán
  const pages=financialPages([attempt.invoice],'payment',attempt.event),blobs=await encodePages(pages);
  
  // 2. Tải ảnh thành công trước khi ghi nhận giao dịch
  downloadPages(blobs,'Thanh-toan-'+attempt.event.code);

  // 3. Nếu online và đã đăng nhập: Ghi nhận giao dịch nguyên tử lên Supabase (FOR UPDATE chống race condition)
  if(typeof sync!=='undefined'&&sync.user){
   const srvRes=await sync.recordPayment(paymentInvoiceId,attempt.event);
   attempt.event.paidBefore=srvRes.paid_before;
   attempt.event.paidAfter=srvRes.paid_after;
   attempt.event.dueAfter=srvRes.due_after;
  }

  // 4. Lưu bản sao vào localStorage và cập nhật bộ nhớ
  await ledgerLock(async()=>{
   const latest=latestLedger(operationKey);
   const inv=latest.invoices?.find(i=>i.id===paymentInvoiceId);
   if(inv&&!paymentEvents(inv).some(p=>p.id===attempt.event.id)){
    const next=paymentCandidate(latest,paymentInvoiceId,attempt.event.amount,paymentExpectedVersion,attempt.event);
    const payload=JSON.stringify(next);localStorage.setItem(operationKey+'-storage-check','1');localStorage.removeItem(operationKey+'-storage-check');
    localStorage.setItem(operationKey,payload);data=next;
   }
  },operationKey);

  paymentCommitted=true;const savedBalance=invoiceBalance(data.invoices.find(i=>i.id===paymentInvoiceId));$('paymentBalanceInfo').innerHTML=`<span>Tổng hóa đơn <b>${money(savedBalance.total)}</b></span><span>Tổng đã trả <b>${money(savedBalance.paid)}</b></span><span>Còn thiếu <b>${money(savedBalance.due)}</b></span>`;mountPages('paymentPreviewArea',pages);$('paymentTitle').textContent='Đã lưu phiếu thanh toán';$('paymentError').textContent='';renderHistory();savedPaymentPanel();updatePartners();
  toast('Đã xuất phiếu và ghi thanh toán vào hóa đơn gốc.');
 }catch(error){
  $('paymentError').textContent=paymentCommitted?'Thanh toán đã được lưu. Vui lòng đóng cửa sổ và tải lại trang để cập nhật hiển thị.':error.message+' Chưa ghi thanh toán, thông tin nhập vẫn được giữ.';
 }
 finally{setPaymentBusy(false)}
};
$('paymentClose').onclick=()=>{if(!paymentBusy)$('paymentDialog').close()};$('paymentDialog').addEventListener('cancel',e=>{if(paymentBusy)e.preventDefault()});
for(const [id,tab] of [['historyDebt','debt'],['historyPaid','paid'],['historyPartial','partial']])$(id).onclick=()=>{historyTab=tab;selectedDebts.clear();renderHistory()};
$('debtSelectAll').onchange=e=>{selectedDebts.clear();if(e.target.checked)for(const i of filteredDebtInvoices())if(invoiceBalance(i).due>0)selectedDebts.add(i.id);renderHistory()};
$('debtExport').onclick=()=>{
 try{data=latestLedger();const invoices=filteredDebtInvoices().filter(i=>selectedDebts.has(i.id)&&invoiceBalance(i).due>0);if(!invoices.length)throw Error('Chọn ít nhất một hóa đơn còn công nợ.');reportSpec={kind:'debt',invoices:JSON.parse(JSON.stringify(invoices)),created:Date.now()};showFinancialReport()}
 catch(e){toast(e.message)}
};
function reprintPayment(invoiceId,paymentId){try{data=latestLedger();const invoice=data.invoices.find(i=>i.id===invoiceId),event=invoice&&paymentEvents(invoice).find(p=>p.id===paymentId);if(!event)throw Error('Không tìm thấy phiếu thanh toán.');reportSpec={kind:'payment',invoices:[JSON.parse(JSON.stringify(invoice))],event:{...event},created:event.created};showFinancialReport()}catch(e){toast(e.message)}}
function showFinancialReport(){reportPages=financialPages(reportSpec.invoices,reportSpec.kind,reportSpec.event);$('debtTitle').textContent=reportSpec.kind==='debt'?'Bảng công nợ đã chọn':'Xuất lại phiếu thanh toán';$('debtInfo').textContent=reportSpec.kind==='debt'?reportSpec.invoices.length+' hóa đơn · Còn thiếu '+money(reportSpec.invoices.reduce((s,i)=>s+invoiceBalance(i).due,0))+'. Xuất bảng này không ghi nhận thanh toán.':'Giữ số tiền và số còn thiếu tại đúng lần thanh toán này. Xuất lại không ghi trùng giao dịch.';$('debtError').textContent='';mountPages('debtPreviewArea',reportPages);$('debtDialog').showModal()}
$('debtDownload').onclick=async()=>{if(reportBusy)return;reportBusy=true;$('debtDownload').disabled=true;try{if(reportSpec.kind==='debt'){data=latestLedger();const ids=new Set(reportSpec.invoices.map(i=>i.id));reportSpec.invoices=data.invoices.filter(i=>ids.has(i.id)&&customerKey(i.partner)===selectedCustomer&&invoiceBalance(i).due>0);if(!reportSpec.invoices.length)throw Error('Các hóa đơn đã được thanh toán đủ. Không còn công nợ để xuất.');reportPages=financialPages(reportSpec.invoices,'debt');mountPages('debtPreviewArea',reportPages);$('debtInfo').textContent=reportSpec.invoices.length+' hóa đơn · Còn thiếu '+money(reportSpec.invoices.reduce((s,i)=>s+invoiceBalance(i).due,0))}const blobs=await encodePages(reportPages);downloadPages(blobs,reportSpec.kind==='payment'?'Thanh-toan-'+reportSpec.event.code:'Bang-cong-no-'+today());toast('Đã xuất ảnh; không thay đổi công nợ.')}catch(e){$('debtError').textContent=e.message}finally{reportBusy=false;$('debtDownload').disabled=false}};
$('debtClose').onclick=()=>{if(!reportBusy)$('debtDialog').close()};$('debtDialog').addEventListener('cancel',e=>{if(reportBusy)e.preventDefault()});
function mountPages(id,pages){const host=$(id);host.replaceChildren(...pages);host.hidden=false}
async function encodePages(pages){const blobs=[];for(const c of pages){const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Không tạo được ảnh. Vui lòng thử lại.')),'image/png'));blobs.push(blob)}return blobs}
function downloadPages(blobs,name){for(let i=0;i<blobs.length;i++)download(blobs[i],name+(blobs.length>1?'-trang-'+(i+1):'')+'.png')}

// Paginated 9:16 report, with repeated invoice identity on continuation pages.
function financialPages(invoices,kind,event){
 if(!Number.isSafeInteger(invoices.reduce((s,i)=>s+invoiceTotal(i),0)))throw Error('Tổng tiền quá lớn để tính chính xác. Hãy chọn ít hóa đơn hơn.');
 if(invoiceLogoState!=='ready')throw Error('Logo chưa sẵn sàng. Vui lòng thử lại sau một chút.');
 const pages=[],widths=[280,120,180,240],lefts=[40,320,440,620],ink='#203b30';let c,x,y=0,activeInvoice=null;
 function text(value,px,py,size=23,bold=false,align='left',max=810,color=ink){x.fillStyle=color;x.textAlign=align;let n=size;x.font=(bold?'bold ':'')+n+'px Arial';while(x.measureText(String(value)).width>max&&n>12){n--;x.font=(bold?'bold ':'')+n+'px Arial'}x.fillText(String(value),px,py)}
 function newPage(){c=document.createElement('canvas');c.width=900;c.height=1600;x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,900,1600);pages.push(c);x.fillStyle='#edf4ed';x.fillRect(0,0,900,205);const scale=Math.min(145/invoiceLogo.naturalWidth,145/invoiceLogo.naturalHeight);x.drawImage(invoiceLogo,45,25,invoiceLogo.naturalWidth*scale,invoiceLogo.naturalHeight*scale);text(kind==='payment'?'HÓA ĐƠN THANH TOÁN':'BẢNG ĐỐI CHIẾU CÔNG NỢ',220,75,34,true,'left',635);text('ĐỖ PHƯƠNG TUẤN · '+businessTitle(),220,120,23,true,'left',635);if(kind==='debt')text('Ngày lập: '+shortDate(today()),220,167,19,false,'left',620);y=235}
 function ensure(height,repeat=true){if(y+height>1460){newPage();if(repeat&&activeInvoice){invoiceHeader(activeInvoice,true);tableHeader()}}}
 function paragraph(value,size=23,bold=false,color=ink){const lines=invoiceWrap(x,value,800,(bold?'bold ':'')+size+'px Arial');for(const line of lines){ensure(size+14);text(line,50,y+size,size,bold,'left',800,color);y+=size+12}}
 function invoiceHeader(i,continued=false){const lines=invoiceWrap(x,partnerLabel()+': '+i.partner,800,'bold 24px Arial');const height=48+lines.length*30;ensure(height,false);const number=invoices.findIndex(row=>row.id===i.id)+1;text((invoices.length>1?'Hóa đơn '+number+' · ':'')+receiptDateLabel()+': '+shortDate(i.date)+(continued?' (tiếp)':''),50,y+24,22);lines.forEach((line,n)=>text(line,50,y+58+n*30,24,true,'left',800));y+=height}
 function tableHeader(){ensure(55,false);x.fillStyle='#fff0df';x.fillRect(40,y,820,50);for(let n=0;n<4;n++)text(['Loại Cá','Số lượng','Đơn Giá','Thành Tiền'][n],n===0?50:lefts[n]+widths[n]-12,y+32,21,true,n===0?'left':'right',widths[n]-20);y+=50}
 function itemRow(t){const values=[fishName(t.productName||pname(t.product)),num(t.qty)+' '+unitName(unit(t)),money(unit(t)==='box'?(t.boxPrice??t.price*17):t.price)+' /'+unitName(unit(t)),money(rowAmount(t))],cells=values.map((v,i)=>invoiceWrap(x,v,widths[i]-22,'bold 22px Arial'));const height=Math.max(64,...cells.map(lines=>lines.length*29+20));ensure(height);x.strokeStyle='#d6e1d4';x.lineWidth=1;for(let col=0;col<4;col++){x.strokeRect(lefts[col],y,widths[col],height);cells[col].forEach((line,n)=>text(line,col===0?50:lefts[col]+widths[col]-12,y+27+n*29,22,true,col===0?'left':'right',widths[col]-22))}y+=height}
 function balanceRow(label,value,accent=false){ensure(44);if(accent){x.fillStyle='#edf4ed';x.fillRect(40,y,820,44)}text(label,52,y+29,22,accent);text(money(value),847,y+29,24,true,'right',470,accent?'#235a35':ink);y+=44}
 newPage();
 if(kind==='payment'){paragraph('Ngày thanh toán: '+timeLabel(event.created),22);paragraph('Phương thức: '+event.method,22);y+=10}
 else{if(invoices.length>1)paragraph(invoices.length+' hóa đơn còn công nợ.',22);y+=8}
 for(const invoice of invoices){activeInvoice=invoice;ensure(230,false);invoiceHeader(invoice);tableHeader();for(const item of invoice.items)itemRow(item);ensure(160);const b=invoiceBalance(invoice);balanceRow('Tổng hóa đơn',b.total);if(kind==='payment'){if(event.paidBefore>0)balanceRow('Đã thanh toán trước',event.paidBefore);balanceRow('Thanh toán lần này',event.amount,true);if(event.paidBefore>0)balanceRow('Tổng đã thanh toán',event.paidAfter);balanceRow('Còn thiếu sau lần này',event.dueAfter,true);if(event.dueAfter===0)paragraph('ĐÃ THANH TOÁN ĐỦ',22,true);if(event.note)paragraph('Ghi chú: '+event.note,21)}else{balanceRow('Đã thanh toán',b.paid);balanceRow('Còn thiếu',b.due,true)}y+=24;activeInvoice=null}
 if(kind==='debt'&&invoices.length>1){ensure(205,false);paragraph('TỔNG CỘNG CÁC HÓA ĐƠN ĐÃ CHỌN',24,true);balanceRow('Tổng tiền hàng',invoices.reduce((s,i)=>s+invoiceBalance(i).total,0));balanceRow('Tổng đã trả',invoices.reduce((s,i)=>s+invoiceBalance(i).paid,0));balanceRow('TỔNG CÒN THIẾU',invoices.reduce((s,i)=>s+invoiceBalance(i).due,0),true)}
 for(let n=0;n<pages.length;n++){x=pages[n].getContext('2d');if(pages.length>1)text((n+1)+' / '+pages.length,850,1538,20,false,'right',100)}
 return pages;
}

initBusinessTabs();

// Amounts are integer VND. Invoice items remain immutable; settlements append events.
let historyTab='debt',selectedCustomer=null;const selectedDebts=new Set();
function invoiceTotal(i){return i.items.reduce((sum,t)=>sum+rowAmount(t),0)}
function paymentEvents(i){return Array.isArray(i.payments)?i.payments:[]}
function invoiceBalance(i){const total=invoiceTotal(i),paid=paymentEvents(i).reduce((sum,p)=>sum+p.amount,0),due=Math.max(0,total-paid);return {total,paid,due,status:due===0?'paid':paid>0?'partial':'unpaid'}}
function paymentVersion(i){return JSON.stringify(paymentEvents(i).map(p=>[p.id,p.amount,p.created]))}
function statusName(i){const b=invoiceBalance(i);return b.status==='paid'?'Đã Thanh Toán':b.status==='partial'?'Còn Thiếu':'Chưa Thanh Toán'}
function shortDate(d){return String(d).split('-').reverse().join('/')}
function timeLabel(ms){return new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(new Date(ms))}
function tabMatches(i,tab=historyTab){const b=invoiceBalance(i);return tab==='paid'?b.due===0:tab==='partial'?b.paid>0&&b.due>0:b.due>0}
function customerKey(name){return String(name||'Chưa ghi tên').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi')}
function historyMatches(i){const q=$('search').value.trim().toLocaleLowerCase('vi');return (!$('from').value||i.date>=$('from').value)&&(!$('to').value||i.date<=$('to').value)&&[i.code,i.partner,i.note,...i.items.map(t=>t.productName||pname(t.product))].join(' ').toLocaleLowerCase('vi').includes(q)}
function matchingHistoryInvoices(){return data.invoices.filter(historyMatches).sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created)}
function allFilteredInvoices(){return selectedCustomer===null?[]:matchingHistoryInvoices().filter(i=>customerKey(i.partner)===selectedCustomer)}
function customerGroups(){
 const groups=new Map();
 for(const i of records().filter(historyMatches)){
  const key=customerKey(i.partner);if(!groups.has(key))groups.set(key,{key,name:String(i.partner||'Chưa ghi tên').trim().replace(/\s+/g,' '),count:0,total:0,paid:0,due:0,legacy:0,lastDate:i.date});
  const group=groups.get(key);if(i.legacy)group.legacy++;else{const b=invoiceBalance(i);group.count++;group.total+=b.total;group.paid+=b.paid;group.due+=b.due}if(i.date>group.lastDate)group.lastDate=i.date;
 }
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi'));
}
function renderCustomerHistory(){
 const groups=customerGroups();$('customerList').hidden=selectedCustomer!==null;$('customerDetail').hidden=selectedCustomer===null;
 $('search').placeholder=selectedCustomer===null?'Tìm khách hàng, mã hóa đơn hoặc tên cá':'Tìm mã hóa đơn hoặc tên cá của khách này';
 if(selectedCustomer===null){
  selectedDebts.clear();$('customerList').innerHTML='<p class="history-help">Chọn tên khách hàng để xem hóa đơn và công nợ.</p>'+groups.map(g=>`<button type="button" class="customer-card" data-open-customer="${esc(g.key)}"><span class="customer-name">${esc(g.name)}</span><span class="customer-stats">${g.count} hóa đơn${g.legacy?' · '+g.legacy+' nhóm cũ':''} · Gần nhất ${esc(shortDate(g.lastDate))}</span><span class="customer-due">${g.count?'Còn thiếu':'Công nợ'} <b>${g.count?money(g.due):'Chưa đối soát'}</b></span><span class="customer-arrow" aria-hidden="true">›</span></button>`).join('')+(groups.length?'':'<p class="empty">Chưa có khách hàng phù hợp.</p>');
  $('historyList').innerHTML='';return;
 }
 const name=records().find(i=>customerKey(i.partner)===selectedCustomer)?.partner||selectedCustomer;
 $('selectedCustomerName').textContent=name;$('selectedCustomerInfo').textContent='Hóa đơn, thanh toán và công nợ của riêng khách hàng này.';
 renderDebtHistory();
}
function openCustomerHistory(key){selectedCustomer=key;historyTab='debt';selectedDebts.clear();renderCustomerHistory()}
function filteredDebtInvoices(){return allFilteredInvoices().filter(i=>tabMatches(i))}
function paymentCandidate(state,id,amount,expectedVersion,event){
 const invoice=state.invoices?.find(i=>i.id===id);if(!invoice)throw Error('Không tìm thấy hóa đơn gốc.');
 if(paymentEvents(invoice).some(p=>p.id===event.id))return state;
 if(paymentVersion(invoice)!==expectedVersion)throw Error('Hóa đơn vừa có thanh toán ở cửa sổ khác. Đóng phiếu rồi mở lại để cập nhật số còn thiếu.');
 const b=invoiceBalance(invoice);
 if(!Number.isSafeInteger(b.total)||!Number.isSafeInteger(b.paid)||!Number.isSafeInteger(amount)||amount<=0||amount>b.due)throw Error('Số tiền phải lớn hơn 0 và không vượt số còn thiếu '+money(b.due)+'.');
 const payment={...event,amount,paidBefore:b.paid,paidAfter:b.paid+amount,dueAfter:b.due-amount};
 return {...state,invoices:state.invoices.map(i=>i.id===id?{...i,payments:[...paymentEvents(i),payment]}:i)};
}
function paymentTimeline(i){
 const events=[{created:i.created,html:`<b>Xuất hóa đơn gốc</b><span>${money(invoiceTotal(i))}</span>`},...paymentEvents(i).map(p=>({created:p.created,html:`<b>Thanh toán ${money(p.amount)}</b><small>${esc(p.code)} · ${esc(p.method||'Không ghi phương thức')}${p.note?' · '+esc(p.note):''}</small><small>Đã trả: ${money(p.paidAfter)} · Còn thiếu: ${money(p.dueAfter)}</small><button type="button" data-payment-reprint="${esc(p.id)}" data-invoice-id="${esc(i.id)}">Xuất lại phiếu này</button>`}))];
 return `<div class="payment-timeline"><h4>Dòng thời gian giao dịch</h4>${events.sort((a,b)=>a.created-b.created).map(e=>`<div class="timeline-event"><time>${esc(timeLabel(e.created))}</time>${e.html}</div>`).join('')}</div>`;
}
function renderDebtHistory(){
 const expanded=new Set([...document.querySelectorAll('#historyList details[open]')].map(d=>d.dataset.invoice));const base=allFilteredInvoices(),list=base.filter(i=>tabMatches(i)),valid=new Set(list.filter(i=>invoiceBalance(i).due>0).map(i=>i.id));
 for(const id of selectedDebts)if(!valid.has(id))selectedDebts.delete(id);
 for(const [id,tab] of [['historyDebt','debt'],['historyPaid','paid'],['historyPartial','partial']]){const button=$(id);button.setAttribute('aria-selected',String(historyTab===tab));button.querySelector('span').textContent=base.filter(i=>tabMatches(i,tab)).length}
 const totals=list.reduce((s,i)=>{const b=invoiceBalance(i);return {total:s.total+b.total,paid:s.paid+b.paid,due:s.due+b.due}},{total:0,paid:0,due:0});
 $('historySummary').innerHTML=`<span><b>${list.length}</b> hóa đơn</span><span>Tổng tiền <b>${money(totals.total)}</b></span><span>Đã trả <b>${money(totals.paid)}</b></span><strong>Còn thiếu ${money(totals.due)}</strong>`;
 $('historyHelp').textContent=historyTab==='debt'?'Công nợ gồm hóa đơn chưa trả và trả chưa đủ. Lọc theo ngày nhận hàng; chọn hóa đơn để xuất bảng công nợ.':historyTab==='partial'?'Các hóa đơn đã trả một phần và còn thiếu tiền. Các hóa đơn này cũng có trong tab Chưa Thanh Toán.':'Các hóa đơn đã thanh toán đủ. Mọi lần thanh toán nằm trong dòng thời gian của hóa đơn gốc.';
 $('historyList').innerHTML=list.map(i=>{const b=invoiceBalance(i);return `<article class="history-invoice"><div class="record-select">${b.due>0?`<input type="checkbox" data-select-debt="${esc(i.id)}" aria-label="Chọn hóa đơn ${esc(i.code)}" ${selectedDebts.has(i.id)?'checked':''}>`:''}<span class="payment-status ${b.status}">${statusName(i)}</span></div><details class="invoice-record" data-invoice="${esc(i.id)}" ${expanded.has(i.id)?'open':''}><summary><div><b>${esc(i.partner)}</b><small>${esc(shortDate(i.date))} · ${esc(i.code)}</small></div><div class="history-amount"><strong>${money(b.total)}</strong><small>${num(i.items.reduce((s,t)=>s+kg(t),0))} Kg · ${i.items.length} dòng</small></div></summary><div class="record-detail">${i.items.map(t=>`<div class="record-line"><span>${esc(fishName(t.productName||pname(t.product)))}<small>${num(t.qty)} ${unitName(unit(t))} × ${money(unit(t)==='box'?(t.boxPrice??t.price*17):t.price)}</small></span><b>${money(rowAmount(t))}</b></div>`).join('')}${i.note?`<p>Ghi chú: ${esc(i.note)}</p>`:''}<div class="payment-balance"><span>Đã trả <b>${money(b.paid)}</b></span><span>Còn thiếu <b>${money(b.due)}</b></span></div><div class="record-actions"><button data-view-invoice="${esc(i.id)}">Xem / xuất lại hóa đơn</button>${b.due>0?`<button class="payment-action" data-add-payment="${esc(i.id)}">Ghi nhận / xuất phiếu thanh toán</button><button class="settle-action" data-settle="${esc(i.id)}">Đã Thanh Toán</button>`:''}</div>${paymentTimeline(i)}</div></details></article>`}).join('')||'<p class="empty">Không có hóa đơn phù hợp trong tab này.</p>';
 const legacy=records().filter(i=>i.legacy&&customerKey(i.partner)===selectedCustomer&&historyMatches(i));$('legacyHistory').hidden=!legacy.length;$('legacyList').innerHTML=legacy.map(i=>`<div class="legacy-row"><b>${esc(i.partner)}</b><small>${esc(shortDate(i.date))} · ${i.items.length} dòng · ${money(invoiceTotal(i))}</small></div>`).join('');
 updateDebtSelection();
}
function updateDebtSelection(){const list=filteredDebtInvoices().filter(i=>invoiceBalance(i).due>0),chosen=list.filter(i=>selectedDebts.has(i.id));$('debtSelection').hidden=selectedCustomer===null||historyTab==='paid';$('debtSelectAll').checked=!!list.length&&chosen.length===list.length;$('debtSelectAll').indeterminate=chosen.length>0&&chosen.length<list.length;$('debtSelectionSummary').textContent='Đã chọn '+chosen.length+' hóa đơn · Còn thiếu '+money(chosen.reduce((s,i)=>s+invoiceBalance(i).due,0));$('debtExport').disabled=!chosen.length}

function setHistoryAllTime(){archiveMode=true;$('from').value='';$('to').value='';$('historyTitle').textContent='Lịch sử hóa đơn & công nợ';$('archiveButton').textContent='Tháng hiện tại'}

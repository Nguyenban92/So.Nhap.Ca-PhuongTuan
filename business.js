// Independent stores: existing records stay in purchase, sales starts empty.
let businessMode='purchase';const businessDrafts=new Map();
function storageKey(){return businessMode==='sales'?'soca-sales-v1':'soca-v1'}
function businessTitle(){return businessMode==='sales'?'BÁN HÀNG':'NHẬP HÀNG'}
function receiptTitle(){return businessMode==='sales'?'HÓA ĐƠN BÁN HÀNG':'HÓA ĐƠN NHẬN HÀNG'}
function receiptDateLabel(){return businessMode==='sales'?'Ngày bán hàng':'Ngày nhận hàng'}
function partnerLabel(){return businessMode==='sales'?'Khách hàng / Người mua':'Khách hàng / Người giao'}
function invoicePrefix(){return businessMode==='sales'?'HDB':'HDN'}
function paymentPrefix(){return businessMode==='sales'?'TTB':'TTN'}
function loadBusinessData(){
 if(typeof sync!=='undefined'&&sync.user&&sync.stores&&sync.stores[businessMode]){
  const s=sync.stores[businessMode];
  return {data:{products:s.products&&s.products.length?s.products:defaults.map(p=>({...p})),tx:s.tx||[],invoices:s.invoices||[]},ready:true};
 }
 try{const raw=localStorage.getItem(storageKey());if(!raw)return {data:{products:defaults.map(p=>({...p})),tx:[],invoices:[]},ready:true};const parsed=JSON.parse(raw);if(!Array.isArray(parsed.products)||!Array.isArray(parsed.tx))throw Error('Invalid data');return {data:{...parsed,invoices:parsed.invoices||[]},ready:true}}
 catch{return {data:{products:defaults.map(p=>({...p})),tx:[],invoices:[]},ready:false}}
}
function captureBusinessDraft(){return {draft,partner:$('entryPartner').value,note:$('entryNote').value,retail:!$('retailForm').hidden,fish:$('retailFish').value,qty:$('retailQty').value,price:$('retailPrice').value,cards:[...document.querySelectorAll('#products .product')].map(card=>({id:card.dataset.product,qty:card.querySelector('[data-qty]').value,price:card.querySelector('[data-boxprice]').value})),customer:selectedCustomer,historyTab,search:$('search').value,from:$('from').value,to:$('to').value,archiveMode}}
function hasAnyDraft(){return draft.length>0||[...businessDrafts.entries()].some(([mode,state])=>mode!==businessMode&&state.draft.length>0)}
function switchBusiness(mode){
 if(mode===businessMode||!['purchase','sales'].includes(mode))return;
 if(exporting||paymentBusy||reportBusy||productSaveBusy||productImageBusy||['invoiceDialog','paymentDialog','debtDialog','productDialog','authDialog'].some(id=>$(id)?.open)){toast('Đóng cửa sổ đang thao tác trước khi chuyển tab.');return}
 businessDrafts.set(businessMode,captureBusinessDraft());businessMode=mode;
 const loaded=loadBusinessData();data=loaded.data;storageReady=loaded.ready;
 const state=businessDrafts.get(mode);draft=state?.draft||[];historyInvoiceId=null;paymentInvoiceId=null;paymentCommitted=false;selectedCustomer=state?.customer??null;historyTab=state?.historyTab||'debt';selectedDebts.clear();
 $('entryPartner').value=state?.partner||'';$('entryNote').value=state?.note||'';$('retailQty').value=state?.qty||'';$('retailPrice').value=state?.price||'';
 $('products').innerHTML='';renderProducts();
 for(const values of state?.cards||[]){const card=[...document.querySelectorAll('#products .product')].find(c=>c.dataset.product===values.id);if(card){card.querySelector('[data-qty]').value=values.qty;card.querySelector('[data-boxprice]').value=values.price;card.querySelector('.entryamount').textContent='Thành tiền: '+(Number(values.qty)>0&&values.price!==''?money(Number(values.qty)*parseVnd(values.price)):'—')}}
 if(state?.fish&&data.products.some(p=>p.id===state.fish))$('retailFish').value=state.fish;
 if(state){archiveMode=state.archiveMode;$('search').value=state.search;$('from').value=state.from;$('to').value=state.to;$('historyTitle').textContent='Lịch sử hóa đơn & công nợ';$('archiveButton').textContent=archiveMode?'Tháng hiện tại':'Tất cả thời gian'}else{$('search').value='';setHistoryAllTime()}
 $(state?.retail?'tabRetail':'tabBoxes').click();retailTotal();syncReceiptDate();renderDraft();renderHistory();updatePartners();updateBusinessLabels();
 $('billCanvasWrap').hidden=true;$('savedPaymentPanel').hidden=true;
 $('storageError').hidden=storageReady;if(!storageReady)$('storageError').textContent='Không đọc được dữ liệu '+businessTitle()+'. Hệ thống tạm dừng lưu để giữ nguyên lịch sử.';
}
function updateBusinessLabels(){
 for(const [id,mode] of [['businessPurchase','purchase'],['businessSales','sales']])$(id).setAttribute('aria-selected',String(businessMode===mode));
 $('businessContext').textContent=businessTitle()+' · Hóa đơn và công nợ được quản lý riêng';
 $('entryDateText').textContent=receiptDateLabel();$('entryDate').setAttribute('aria-label',receiptDateLabel()+' tự động theo hôm nay');
 $('entryPartnerText').textContent=partnerLabel();$('entryPartner').placeholder=businessMode==='sales'?'Nhập tên khách hàng / người mua':'Nhập tên khách hàng / người giao';
 $('billPartyHeader').textContent=businessMode==='sales'?'Ngày / Người mua':'Ngày / Người giao';$('billDateText').textContent=receiptDateLabel();$('billBuyerText').textContent=partnerLabel();
 $('tabBoxes').textContent=businessMode==='sales'?'Bán Hàng Thùng':'Nhận Hàng Thùng';
 const syncName=typeof sync!=='undefined'&&sync.user&&sync.store?(' · Đồng bộ online cùng cơ sở '+sync.store.name):' · Hóa đơn đã xuất được lưu riêng trên trình duyệt này.';
 $('businessFooter').textContent=businessTitle()+syncName;
}
function initBusinessTabs(){$('businessPurchase').onclick=()=>switchBusiness('purchase');$('businessSales').onclick=()=>switchBusiness('sales');updateBusinessLabels()}

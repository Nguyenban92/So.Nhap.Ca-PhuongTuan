const $=id=>document.getElementById(id);
const num=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:3}).format(n);
const money=n=>num(Math.round(n))+' ₫';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'});
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('');
function parseVnd(v){return Number(String(v).replace(/\D/g,''))}
function formatVnd(v){return String(v??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.')}
const unit=t=>t.unit||'kg',unitName=u=>u==='box'?'Thùng':'Kg',kg=t=>t.qty*(unit(t)==='box'?17:1);
const fishName=s=>String(s??'').trim().replace(/\s+/g,' ').replace(/\p{L}+/gu,w=>w[0].toLocaleUpperCase('vi')+w.slice(1).toLocaleLowerCase('vi'));
const defaults=[{id:'ca-nuc',name:'Cá nục khô'},{id:'ca-chi',name:'Cá chỉ vàng khô'},{id:'ca-ngan',name:'Cá ngân khô'}];
let data={products:defaults,tx:[],invoices:[]},storageReady=true;
try{const stored=localStorage.getItem(storageKey());if(stored){const parsed=JSON.parse(stored);if(!Array.isArray(parsed.products)||!Array.isArray(parsed.tx))throw Error('invalid');data={...parsed,invoices:Array.isArray(parsed.invoices)?parsed.invoices:[]}}}catch{storageReady=false}
// Unsaved entries live only in memory. Older records stay untouched.
let draft=[],archiveMode=false,activeMonth=today().slice(0,7),historyInvoiceId=null;
const pname=id=>fishName(data.products.find(p=>p.id===id)?.name||defaults.find(p=>p.id===id)?.name||'Loại cá cũ');
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500)}
document.addEventListener('input',e=>{const i=e.target;if(!i.matches('[data-currency]'))return;const at=i.selectionStart||0,n=i.value.slice(0,at).replace(/\D/g,'').length;i.value=formatVnd(i.value);let pos=0,count=0;while(pos<i.value.length&&count<n){if(/\d/.test(i.value[pos]))count++;pos++}i.setSelectionRange(pos,pos)},true);
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function rowAmount(t){return Math.round(t.qty*(unit(t)==='box'?(t.boxPrice??t.price*17):t.price))}
function setMonth(){const d=today();$('from').value=d.slice(0,7)+'-01';const [y,m]=d.split('-').map(Number);$('to').value=d.slice(0,7)+'-'+new Date(y,m,0).getDate();$('historyTitle').textContent='Lịch sử hóa đơn tháng '+d.slice(5,7)+'/'+d.slice(0,4);$('archiveButton').textContent='Tất cả thời gian'}
function productImage(p){const src=p.image||({'ca-nuc':'ca-nuc.jpg','ca-chi':'ca-chi.jpg','ca-ngan':'ca-ngan.jpg'}[p.id]);return src&&(/^(data:image\/(webp|png|jpeg);base64,)/.test(src)||['ca-nuc.jpg','ca-chi.jpg','ca-ngan.jpg'].includes(src))?src:null}
function renderProducts(){
 const inputs=new Map([...document.querySelectorAll('#products .product')].map(card=>[card.dataset.product,{qty:card.querySelector('[data-qty]').value,price:card.querySelector('[data-boxprice]').value}]));
 const selected=$('retailFish').value;
 $('products').innerHTML=data.products.map(p=>{const name=fishName(p.name),image=productImage(p),values=inputs.get(p.id);return `<article class="product" data-product="${esc(p.id)}"><div class="photo">${image?`<img src="${esc(image)}" alt="${esc(name)}">`:`<span class="noimage">${esc(name)}</span>`}<button type="button" class="change-photo" data-change-image="${esc(p.id)}" aria-label="Đổi Hình ${esc(name)}">Đổi Hình</button></div><div class="productbody"><div class="producttitle"><h3 class="fish-title"><span>${esc(name)}</span></h3><span class="stockpair">1 Thùng = 17 Kg</span></div><label class="qtyrow"><input type="number" inputmode="numeric" min="1" max="1000000000" step="1" placeholder="Số Thùng" aria-label="Số Thùng ${esc(name)}" data-qty="${esc(p.id)}" value="${esc(values?.qty||'')}"></label><label class="boxpricelabel">Giá / Thùng (VNĐ)<input type="text" inputmode="numeric" data-currency data-boxprice="${esc(p.id)}" aria-label="Giá mỗi Thùng ${esc(name)}" placeholder="Nhập giá" value="${esc(values?.price||'')}"></label><div class="entryamount">Thành tiền: ${values?.qty&&values?.price?money(Number(values.qty)*parseVnd(values.price)):'—'}</div><div class="productactions"><button class="primary" data-plus="${esc(p.id)}">Thêm vào phiếu</button></div></div></article>`}).join('')+'<button type="button" class="add-product-card" data-add-product><span aria-hidden="true">+</span>Thêm Loại Cá</button>';
 $('retailFish').innerHTML=data.products.map(p=>`<option value="${esc(p.id)}">${esc(fishName(p.name))}</option>`).join('');
 if(data.products.some(p=>p.id===selected))$('retailFish').value=selected;
}
function renderDraft(){const weight=draft.reduce((s,t)=>s+kg(t),0),total=draft.reduce((s,t)=>s+rowAmount(t),0);$('draftCount').textContent=draft.length+' dòng chưa lưu';$('draftRows').innerHTML=draft.length?draft.map(t=>`<div class="draft-row"><div><b>${esc(pname(t.product))}</b><small>${num(t.qty)} ${unitName(unit(t))} × ${money(unit(t)==='box'?t.boxPrice:t.price)}</small></div><strong>${money(rowAmount(t))}</strong><button data-remove="${esc(t.id)}" aria-label="Bỏ dòng ${esc(pname(t.product))}">×</button></div>`).join(''):'<p class="empty">Nhập số lượng, giá rồi thêm cá vào phiếu.</p>';$('stockTotal').innerHTML=`<span>TỔNG PHIẾU TẠM<small>Chỉ lưu lịch sử sau khi xuất ảnh hóa đơn.</small></span><div><strong>${num(weight)} <small>Kg</small></strong><strong>${money(total)}</strong></div>`;$('invoiceOpen').disabled=!draft.length}
function addDraft(product,qty,price,u){syncReceiptDate();const partner=$('entryPartner').value.trim(),date=$('entryDate').value;if(!partner){toast('Vui lòng nhập tên khách hàng / người giao.');$('entryPartner').focus();return false}if(!date||!$('entryDate').reportValidity())return false;if(!Number.isFinite(qty)||qty<=0||qty>1e9||u==='box'&&!Number.isInteger(qty)||!Number.isFinite(price)||price<0||price>1e12){toast('Vui lòng kiểm tra số lượng và giá.');return false}if(!Number.isSafeInteger(Math.round(qty*price))||!Number.isSafeInteger(draft.reduce((s,t)=>s+rowAmount(t),0)+Math.round(qty*price))){toast('Tổng tiền quá lớn, vui lòng kiểm tra lại số lượng và giá.');return false}draft.push({id:uid(),product,qty,unit:u,price:u==='box'?price/17:price,...(u==='box'?{boxPrice:price}:{}),type:'in',date,partner,note:$('entryNote').value.trim(),created:Date.now()});renderDraft();toast('Đã thêm vào phiếu tạm, chưa lưu lịch sử.');return true}
$('products').onclick=e=>{if(e.target.closest('[data-add-product]')){openProductEditor();return}const change=e.target.closest('[data-change-image]');if(change){openProductEditor(change.dataset.changeImage);return}const b=e.target.closest('[data-plus]');if(!b)return;const card=b.closest('.product'),q=card.querySelector('[data-qty]'),p=card.querySelector('[data-boxprice]');if(!q.reportValidity()||!q.value||p.value===''){toast('Nhập số Thùng và giá mỗi Thùng.');return}if(addDraft(b.dataset.plus,+q.value,parseVnd(p.value),'box')){q.value='';card.querySelector('.entryamount').textContent='Thành tiền: —'}};
$('products').oninput=e=>{const card=e.target.closest('.product');if(!card)return;const q=+card.querySelector('[data-qty]').value,p=card.querySelector('[data-boxprice]').value;card.querySelector('.entryamount').textContent='Thành tiền: '+(q>0&&p!==''?money(q*parseVnd(p)):'—')};
$('draftRows').onclick=e=>{const id=e.target.closest('[data-remove]')?.dataset.remove;if(!id)return;draft=draft.filter(t=>t.id!==id);renderDraft()};
function retailTotal(){const q=+$('retailQty').value,p=$('retailPrice').value;$('retailAmount').textContent='Thành tiền: '+(q>0&&p!==''?money(q*parseVnd(p)):'—')}
$('retailForm').oninput=retailTotal;$('retailForm').onsubmit=e=>{e.preventDefault();if($('retailPrice').value==='')return;if(addDraft($('retailFish').value,+$('retailQty').value,parseVnd($('retailPrice').value),'kg')){$('retailQty').value='';retailTotal()}};
for(const [id,retail] of [['tabBoxes',false],['tabRetail',true]])$(id).onclick=()=>{$('products').hidden=retail;$('retailForm').hidden=!retail;$('tabBoxes').setAttribute('aria-selected',String(!retail));$('tabRetail').setAttribute('aria-selected',String(retail))};
function records(){const covered=new Set(data.invoices.flatMap(i=>i.items.map(t=>t.id)));const legacy=data.tx.filter(t=>!covered.has(t.id));const groups=new Map;for(const t of legacy){const key=t.date+'|'+(t.partner||'');if(!groups.has(key))groups.set(key,{id:'legacy-'+t.id,code:'Dữ liệu cũ',date:t.date,partner:t.partner||'Chưa ghi tên',items:[],legacy:true,created:t.created||0});groups.get(key).items.push({...t,productName:pname(t.product)})}return [...data.invoices,...groups.values()]}
function renderHistory(){renderCustomerHistory()}
$('historyList').onclick=e=>{
 const view=e.target.closest('[data-view-invoice]');if(view){openSavedInvoice(view.dataset.viewInvoice);return}
 const pay=e.target.closest('[data-add-payment]');if(pay){openPayment(pay.dataset.addPayment);return}
 const settle=e.target.closest('[data-settle]');if(settle){openPayment(settle.dataset.settle,true);return}
 const receipt=e.target.closest('[data-payment-reprint]');if(receipt)reprintPayment(receipt.dataset.invoiceId,receipt.dataset.paymentReprint);
};
$('historyList').onchange=e=>{const id=e.target.dataset.selectDebt;if(!id)return;if(e.target.checked)selectedDebts.add(id);else selectedDebts.delete(id);updateDebtSelection()};
for(const id of ['search','from','to'])$(id).oninput=renderHistory;
$('clear').onclick=()=>{$('search').value='';setHistoryAllTime();renderHistory()};$('archiveButton').onclick=()=>{archiveMode=!archiveMode;if(archiveMode){$('from').value='';$('to').value='';$('historyTitle').textContent='Lịch sử hóa đơn';$('archiveButton').textContent='Về tháng hiện tại'}else setMonth();renderHistory()};
window.addEventListener('beforeunload',e=>{if(hasAnyDraft()){e.preventDefault();e.returnValue=''}});
syncReceiptDate();setHistoryAllTime();renderProducts();renderDraft();renderHistory();
setInterval(()=>{if(!archiveMode&&activeMonth!==today().slice(0,7)){activeMonth=today().slice(0,7);setMonth();renderHistory()}},30000);
if(!storageReady){$('storageError').hidden=false;$('storageError').textContent='Không đọc được dữ liệu đã lưu. Vui lòng tải lại trang; hệ thống tạm dừng lưu hóa đơn để bảo vệ lịch sử cũ.'}

function updatePartners(){$('partners').innerHTML=[...new Set(records().map(i=>i.partner).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi')).map(p=>`<option value="${esc(p)}"></option>`).join('')}
updatePartners();
window.addEventListener('storage',e=>{if(e.key!==storageKey())return;try{const next=JSON.parse(e.newValue);if(next&&Array.isArray(next.tx)&&Array.isArray(next.products)){data={...next,invoices:next.invoices||[]};renderProducts();renderHistory();updatePartners()}}catch{}});

let editingProduct=null,productImageData='',productImageBusy=false,productSaveBusy=false,productImageVersion=0;
function openProductEditor(id){
 editingProduct=id?data.products.find(p=>p.id===id):null;
 productImageVersion++;productImageBusy=false;productSaveBusy=false;
 $('productTitle').textContent=editingProduct?'Đổi Hình Mặt Hàng':'Thêm Loại Cá';
 $('productName').value=editingProduct?fishName(editingProduct.name):'';
 $('productName').readOnly=!!editingProduct;
 $('productImageInput').value='';productImageData=editingProduct?productImage(editingProduct)||'':'';
 $('productImagePreview').src=productImageData;$('productImagePreview').hidden=!productImageData;
 $('productError').textContent='';$('productSave').disabled=false;
 $('productDialog').showModal();
}
$('productClose').onclick=()=>{if(!productSaveBusy){productImageVersion++;$('productDialog').close()}};
$('productName').onblur=()=>{$('productName').value=fishName($('productName').value)};
async function prepareProductImage(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Chọn ảnh JPG, PNG hoặc WEBP.');
 if(file.size>15*1024*1024)throw Error('Ảnh tối đa 15 MB.');
 const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Không đọc được ảnh.'));reader.readAsDataURL(file)});
 const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('File ảnh bị lỗi, vui lòng chọn ảnh khác.'));img.src=source});
 if(!image.naturalWidth||!image.naturalHeight)throw Error('Ảnh không hợp lệ.');
 const ratio=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
 canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
 const encoded=canvas.toDataURL('image/webp',.86);
 if(encoded.length>1200000)throw Error('Ảnh quá lớn để lưu. Vui lòng chọn ảnh nhẹ hơn.');
 return encoded;
}
$('productImageInput').onchange=async e=>{
 const version=++productImageVersion,file=e.target.files[0];if(!file){productImageBusy=false;$('productSave').disabled=false;$('productError').textContent='';return;}
 productImageBusy=true;$('productSave').disabled=true;$('productError').textContent='Đang chuẩn bị ảnh…';
 try{const result=await prepareProductImage(file);if(version!==productImageVersion)return;productImageData=result;$('productImagePreview').src=result;$('productImagePreview').hidden=false;$('productError').textContent=''}
 catch(error){if(version===productImageVersion)$('productError').textContent=error.message}
 finally{if(version===productImageVersion){productImageBusy=false;$('productSave').disabled=false}}
};
function saveProductCatalog(name,image,existingId){
 if(!storageReady)throw Error('Không đọc được dữ liệu cũ. Vui lòng tải lại trang trước khi lưu mặt hàng.');
 const raw=localStorage.getItem(storageKey()),latest=raw?JSON.parse(raw):data;
 if(!Array.isArray(latest.products)||!Array.isArray(latest.tx))throw Error('Không đọc được danh sách cá.');
 const products=latest.products.map(p=>({...p}));
 let targetId=existingId;
 if(existingId){const product=products.find(p=>p.id===existingId);if(!product)throw Error('Mặt hàng không còn tồn tại.');product.image=image}
 else{if(products.some(p=>fishName(p.name).toLocaleLowerCase('vi')===name.toLocaleLowerCase('vi')))throw Error('Tên loại cá đã có.');targetId=uid();products.push({id:targetId,name,image})}
 const next={...latest,products,invoices:latest.invoices||[]};
 localStorage.setItem(storageKey(),JSON.stringify(next));data=next;
 if(typeof sync!=='undefined'&&sync.saveProduct){
  sync.saveProduct(targetId,name,image);
 }
}
$('productForm').onsubmit=e=>{
 e.preventDefault();if(productImageBusy||productSaveBusy)return;
 const name=fishName($('productName').value);if(!name){$('productError').textContent='Nhập tên loại cá.';return}
 if(!productImageData){$('productError').textContent='Chọn hình ảnh cho loại cá.';return}
 productSaveBusy=true;$('productSave').disabled=true;
 try{saveProductCatalog(name,productImageData,editingProduct?.id);productImageVersion++;$('productDialog').close();renderProducts();renderDraft();toast(editingProduct?'Đã đổi hình mặt hàng.':'Đã thêm '+name+' vào cả hai tab.')}
 catch(error){$('productError').textContent=error.name==='QuotaExceededError'?'Không đủ dung lượng lưu ảnh. Chọn ảnh nhẹ hơn; dữ liệu cũ vẫn được giữ.':error.message}
 finally{productSaveBusy=false;$('productSave').disabled=false}
};

// Receipt dates follow Vietnam's current day, including when a tab stays open overnight.
function syncReceiptDate(){
 const date=today(),changed=$('entryDate').value!==date;$('entryDate').value=date;
 $('entryDate').min=date;$('entryDate').max=date;
 if($('invoiceDialog').open&&!historyInvoiceId&&$('billDate').value!==date){
  $('billDate').value=date;
  document.querySelectorAll('#billRows tr[data-id] td:nth-child(2)').forEach(cell=>{if(cell.firstChild)cell.firstChild.textContent=date.split('-').reverse().join('/')});
  if(typeof buildBill==='function')buildBill();
 }
 return changed;
}
setInterval(syncReceiptDate,10000);
window.addEventListener('focus',syncReceiptDate);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncReceiptDate()});

$('customerList').onclick=e=>{const button=e.target.closest('[data-open-customer]');if(button)openCustomerHistory(button.dataset.openCustomer)};
$('customerBack').onclick=()=>{selectedCustomer=null;selectedDebts.clear();historyTab='debt';renderHistory()};

// Auth & Multi-device Online Sync Handlers
function openAuthDialog(){
 if(typeof sync!=='undefined'&&sync.user){
  if(confirm(`Bạn đang đăng nhập cơ sở: ${sync.store?.name||'Đỗ Phương Tuấn'}\nTài khoản: ${sync.profile?.name||sync.user.email}\n\nBạn có muốn đăng xuất không?`)){
   sync.logout();
  }
  return;
 }
 $('loginError').textContent='';
 $('regError').textContent='';
 $('authLoginForm').hidden=false;
 $('authRegisterForm').hidden=true;
 $('authTabLogin').setAttribute('aria-selected','true');
 $('authTabRegister').setAttribute('aria-selected','false');
 $('authMigrationBox').hidden=true;
 $('authDialog').showModal();
}

$('syncAuthButton').onclick=openAuthDialog;
$('authClose').onclick=()=>$('authDialog').close();

$('authTabLogin').onclick=()=>{
 $('authLoginForm').hidden=false;
 $('authRegisterForm').hidden=true;
 $('authTabLogin').setAttribute('aria-selected','true');
 $('authTabRegister').setAttribute('aria-selected','false');
};

$('authTabRegister').onclick=()=>{
 $('authLoginForm').hidden=true;
 $('authRegisterForm').hidden=false;
 $('authTabLogin').setAttribute('aria-selected','false');
 $('authTabRegister').setAttribute('aria-selected','true');
};

$('authLoginForm').onsubmit=async e=>{
 e.preventDefault();
 const email=$('loginEmail').value.trim(),pass=$('loginPassword').value;
 $('loginError').textContent='Đang đăng nhập…';
 try{
  await sync.login(email,pass);
  $('authDialog').close();
  toast('Đăng nhập thành công vào cơ sở: '+(sync.store?.name||'ĐỖ PHƯƠNG TUẤN'));
 }catch(err){
  $('loginError').textContent=err.message||'Đăng nhập thất bại. Kiểm tra email và mật khẩu.';
 }
};

$('authRegisterForm').onsubmit=async e=>{
 e.preventDefault();
 const name=$('regName').value.trim(),email=$('regEmail').value.trim(),pass=$('regPassword').value,storeCode=$('regStoreCode').value.trim();
 $('regError').textContent='Đang đăng ký tài khoản…';
 try{
  const res=await sync.register(name,email,pass,storeCode);
  if(res.session){
   $('authDialog').close();
   toast('Đã tạo tài khoản và tham gia cơ sở thành công!');
  }else{
   $('regError').textContent='Tài khoản đã tạo. Nếu bật xác nhận email, vui lòng kiểm tra hộp thư hoặc đăng nhập ngay.';
   setTimeout(()=>$('authTabLogin').click(),2000);
  }
 }catch(err){
  $('regError').textContent=err.message||'Đăng ký không thành công. Vui lòng thử lại.';
 }
};

$('syncUploadLocalButton').onclick=()=>{
 $('authMigrationBox').hidden=false;
 $('authDialog').showModal();
};

$('btnRunMigration').onclick=async()=>{
 $('migrationStatus').textContent='Đang quét và chuyển dữ liệu cũ lên máy chủ…';
 $('btnRunMigration').disabled=true;
 try{
  const stats=await sync.uploadLocalDataToServer();
  $('migrationStatus').textContent=`Đã chuyển thành công: ${stats.invoices} hóa đơn, ${stats.payments} thanh toán, ${stats.products} loại cá (${stats.skipped} bản ghi đã có từ trước). Dữ liệu gốc trên máy được giữ nguyên.`;
  toast('Đồng bộ dữ liệu cũ lên online hoàn tất!');
 }catch(err){
  $('migrationStatus').textContent='Lỗi: '+(err.message||'Không thể chuyển dữ liệu');
 }finally{
  $('btnRunMigration').disabled=false;
 }
};

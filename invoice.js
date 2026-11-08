const invoiceLogo=new Image();let invoiceLogoState='loading';
invoiceLogo.onload=()=>{invoiceLogoState='ready';if($('invoiceDialog').open&&!exporting)buildBill()};
invoiceLogo.onerror=()=>{invoiceLogoState='error';if($('invoiceDialog').open)$('billError').textContent='Không tải được logo. Vui lòng tải lại trang để xuất đầy đủ hóa đơn.'};
invoiceLogo.src='logo-ptuan.png';
let billSource=[],billPages=[],exporting=false;
const billIds=['billSeller','billPhone','billBuyer','billDate','billCode','billNote'];
function chosenBill(){return [...document.querySelectorAll('#billRows tr[data-id]')].map(r=>{const t=billSource.find(t=>t.id===r.dataset.id);return {...t,billPrice:parseVnd(r.querySelector('[data-billprice]').value)/(unit(t)==='box'?17:1)}})}
function billTotal(){const ts=chosenBill();$('billTotal').innerHTML=`<span>${ts.length} dòng · <b>${num(ts.reduce((s,t)=>s+kg(t),0))} Kg</b></span><strong>Tổng tiền: ${money(ts.reduce((s,t)=>s+Math.round(kg(t)*t.billPrice),0))}</strong>`;$('billCanvasWrap').hidden=true}
function showInvoice(source,saved){
 historyInvoiceId=saved?.id||null;billSource=source.map(t=>({...t}));
 $('invoiceTitle').textContent=saved?'Hóa đơn đã lưu':'Xuất hóa đơn';
 $('billSeller').value=saved?.seller||'ĐỖ PHƯƠNG TUẤN';$('billPhone').value=saved?.phone||'';
 $('billBuyer').value=saved?.partner||$('entryPartner').value.trim();$('billDate').value=saved?.date||today();
 $('billCode').value=saved?.code||(invoicePrefix()+'-'+today().replaceAll('-','')+'-'+uid().slice(0,8).toUpperCase());
 $('billNote').value=saved?.note||$('entryNote').value.trim();$('billError').textContent='';
 for(const id of billIds)$(id).disabled=!!saved;
 $('billRows').innerHTML=billSource.map(t=>`<tr data-id="${esc(t.id)}"><td>✓</td><td>${esc((saved?.date||today()).split('-').reverse().join('/'))}<small class="kgdetail">${esc(saved?.partner||$('entryPartner').value)}</small></td><td>${esc(fishName(t.productName||pname(t.product)))}</td><td>${num(t.qty)} ${unitName(unit(t))}</td><td>${num(kg(t))} Kg</td><td><input type="text" inputmode="numeric" data-currency data-billprice required aria-label="Đơn giá ${esc(fishName(t.productName||pname(t.product)))}" value="${formatVnd(Math.round(unit(t)==='box'?(t.boxPrice??t.price*17):t.price))}" ${saved?'disabled':''}></td></tr>`).join('');
 billTotal();if(typeof savedPaymentPanel==='function')savedPaymentPanel();$('invoiceDialog').showModal();buildBill();
}
$('invoiceOpen').onclick=()=>{syncReceiptDate();if(!draft.length)return;if(!$('entryPartner').value.trim()||!$('entryDate').value){toast('Điền tên khách hàng và ngày nhận hàng.');return}showInvoice(draft,null)};
function openSavedInvoice(id){const invoice=data.invoices.find(i=>i.id===id);if(invoice)showInvoice(invoice.items,invoice)}
$('invoiceClose').onclick=()=>{if(!exporting)$('invoiceDialog').close()};
$('invoiceDialog').addEventListener('cancel',e=>{if(exporting)e.preventDefault()});
$('billRows').oninput=billTotal;billIds.forEach(id=>$(id).oninput=()=>$('billCanvasWrap').hidden=true);
function buildBill(){if(!historyInvoiceId){$('entryDate').value=today();$('billDate').value=today()}const ts=chosenBill();$('billError').textContent='';if(invoiceLogoState!=='ready'){$('billError').textContent=invoiceLogoState==='loading'?'Đang tải logo, vui lòng chờ một chút.':'Không tải được logo. Vui lòng tải lại trang.';return false}if(!ts.length){$('billError').textContent='Chọn ít nhất một lần nhận hàng.';return false}if(!$('billBuyer').value.trim()||!$('billSeller').value.trim()||!$('billDate').value||!$('billCode').value.trim()){$('billError').textContent='Vui lòng điền tên cơ sở, tên người giao hàng, ngày và số hóa đơn.';return false}if(ts.some(t=>!Number.isFinite(t.billPrice)||t.billPrice<0||t.billPrice*(unit(t)==='box'?17:1)>1e12)||[...document.querySelectorAll('#billRows [data-billprice]')].some(i=>!i.reportValidity())){$('billError').textContent='Đơn giá không hợp lệ.';return false}

if(!Number.isSafeInteger(ts.reduce((s,t)=>s+Math.round(kg(t)*t.billPrice),0))){$('billError').textContent='Tổng tiền quá lớn, vui lòng kiểm tra đơn giá.';return false}const groups=ts.map(t=>({product:t.product,productName:fishName(t.productName||pname(t.product)),price:t.billPrice*(unit(t)==='box'?17:1),retail:unit(t)==='kg',quantity:t.qty,weight:kg(t),parts:[kg(t)/17],partner:t.partner||'Chưa ghi tên',code:t.code,note:t.note||''}));const weight=groups.reduce((n,g)=>n+g.weight,0),amount=g=>Math.round((g.retail?g.weight:g.weight/17)*g.price),total=groups.reduce((n,g)=>n+amount(g),0),layout=invoiceLayout(groups,amount,total),pages=layout.length;billPages=[];document.querySelectorAll('.extraBillPage').forEach(c=>c.remove());for(let page=0;page<pages;page++){const c=page===0?$('billCanvas'):document.createElement('canvas');c.width=900;c.height=1600;if(page){c.className='extraBillPage';$('billCanvasWrap').append(c)}billPages.push(c);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,900,1600);const ink='#203b30';function txt(t,a,b,size=24,bold=false,align='left',max=810){x.fillStyle=ink;x.textAlign=align;let n=size;x.font=`${bold?'bold ':''}${n}px Arial`;while(x.measureText(String(t)).width>max&&n>11){n--;x.font=`${bold?'bold ':''}${n}px Arial`}x.fillText(String(t),a,b)}function grid(y,h,cols){x.strokeStyle='#b8c5b8';x.lineWidth=1.5;x.strokeRect(40,y,820,h);if(cols)for(const a of [270,375,440,610]){x.beginPath();x.moveTo(a,y);x.lineTo(a,y+h);x.stroke()}}function line(y){x.strokeStyle='#dce5dd';x.lineWidth=2;x.beginPath();x.moveTo(40,y);x.lineTo(860,y);x.stroke()}x.fillStyle='#edf4ed';x.fillRect(0,0,900,205);const logoScale=Math.min(150/invoiceLogo.naturalWidth,150/invoiceLogo.naturalHeight);const logoW=invoiceLogo.naturalWidth*logoScale,logoH=invoiceLogo.naturalHeight*logoScale;x.drawImage(invoiceLogo,45+(150-logoW)/2,20+(150-logoH)/2,logoW,logoH);txt(receiptTitle(),225,77,36,true,'left',630);txt($('billSeller').value.trim(),225,121,24,true,'left',630);if(pages>1)txt((page+1)+' / '+pages,855,170,21,false,'right');txt(partnerLabel()+': '+$('billBuyer').value.trim(),45,250,26,false,'left',810);txt(receiptDateLabel()+': '+$('billDate').value.split('-').reverse().join('/'),45,295,24);if($('billPhone').value.trim())txt('ĐT: '+$('billPhone').value.trim(),225,153,18,false,'left',550);line(325);x.fillStyle='#fff0df';x.fillRect(40,345,820,75);const cols=[52,322.5,407.5,525,845];['Tên Cá','Số lượng','','Đơn giá','Tổng Tiền'].forEach((t,i)=>{if(t)txt(t,cols[i],388,20,true,i===0?'left':i===4?'right':'center',[210,85,45,150,220][i])});txt('Kg/',407.5,375,17,true,'center',49);txt('Thùng',407.5,399,17,true,'center',49);grid(345,75,true);const sheet=layout[page],slice=sheet.rows;let y=425;for(const row of slice){const g=row.g,lines=row.cells;const xPos=[52,322.5,407.5,525,845];for(let col=0;col<5;col++){const textLines=lines[col],size=col===0?25:23,top=y+(row.height-textLines.length*29)/2+23;for(let n=0;n<textLines.length;n++)txt(textLines[n],xPos[col],top+n*29,size,true,col===0?'left':col===4?'right':'center',[210,85,45,150,220][col])}grid(y,row.height,true);y+=row.height}const last=page===pages-1,subtotal=slice.reduce((n,row)=>n+amount(row.g),0);x.fillStyle='#28563a';x.fillRect(40,1130,820,120);x.fillStyle='#fff';x.textAlign='left';x.font='bold 25px Arial';x.fillText(last?'Tổng Cộng':sheet.calculation?'Cộng dồn':'Cộng trang này',65,1175);x.textAlign='right';let totalSize=39;const totalText=money(last||sheet.calculation?total:subtotal);x.font='bold '+totalSize+'px Arial';while(x.measureText(totalText).width>770&&totalSize>16){totalSize--;x.font='bold '+totalSize+'px Arial'}x.fillText(totalText,835,1225);if(last)txt('Tổng khối lượng: '+num(weight)+' Kg',45,1292,23,true);if($('billNote').value.trim())txt('Ghi chú: '+$('billNote').value.trim(),45,1410,21,false,'left',810);txt(businessMode==='sales'?'Người bán':'Người nhận',240,1440,26,true,'center');txt(businessMode==='sales'?'Người mua':'Người giao',670,1440,26,true,'center');txt('Đỗ Phương Tuấn',240,1535,25,true,'center');txt('(Ký, ghi họ tên)',670,1485,21,false,'center');}$('billCanvasWrap').hidden=false;return true}

$('billPreview').onclick=buildBill;
function lockExport(locked){exporting=locked;$('billPng').disabled=locked;$('billPreview').disabled=locked;$('invoiceClose').disabled=locked;for(const id of billIds)$(id).disabled=locked||!!historyInvoiceId;document.querySelectorAll('[data-billprice]').forEach(i=>i.disabled=locked||!!historyInvoiceId)}
$('billPng').onclick=async()=>{
 if(exporting)return;const operationKey=storageKey();
 if(!historyInvoiceId&&!storageReady&&(!sync||!sync.user)){$('billError').textContent='Không thể lưu an toàn. Vui lòng tải lại trang.';return}
 if(!buildBill())return;
 const existingId=historyInvoiceId,items=chosenBill().map(t=>({...t,productName:fishName(t.productName||pname(t.product)),partner:$('billBuyer').value.trim(),date:$('billDate').value,note:$('billNote').value.trim(),price:t.billPrice,...(unit(t)==='box'?{boxPrice:Math.round(t.billPrice*17)}:{})}));
 const invoice={id:existingId||uid(),code:$('billCode').value,seller:$('billSeller').value.trim(),phone:$('billPhone').value.trim(),partner:$('billBuyer').value.trim(),date:$('billDate').value,note:$('billNote').value.trim(),created:Date.now(),items,payments:[]};
 lockExport(true);
 try{
  // 1. Chuẩn bị ảnh
  const blobs=[];for(const c of billPages){const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Không tạo được ảnh hóa đơn.')),'image/png'));blobs.push(blob)}
  if(!existingId){
   localStorage.setItem(operationKey+'-storage-check','1');localStorage.removeItem(operationKey+'-storage-check');

   // 2. Lưu vào máy chủ online (nếu đã đăng nhập) dùng RPC atomic chống trùng TRƯỚC
   if(typeof sync!=='undefined'&&sync.user){
    try{
     await sync.saveInvoice(invoice,businessMode);
    }catch(srvErr){
     console.warn('Lỗi lưu máy chủ (sẽ lưu bộ nhớ máy):',srvErr);
    }
   }

   // 3. Lưu vào localStorage và cập nhật bộ nhớ
   const raw=localStorage.getItem(operationKey),latest=raw?JSON.parse(raw):data;
   if(Array.isArray(latest.tx)&&Array.isArray(latest.products)){
    const next={...latest,invoices:[...(latest.invoices||[]),invoice],tx:[...latest.tx,...items]};
    localStorage.setItem(operationKey,JSON.stringify(next));data=next;
   }else{
    data={...data,invoices:[...(data.invoices||[]),invoice],tx:[...(data.tx||[]),...items]};
   }
   historyInvoiceId=invoice.id;
   const ids=new Set(items.map(t=>t.id));draft=draft.filter(t=>!ids.has(t.id));renderDraft();renderHistory();updatePartners();
   $('invoiceTitle').textContent='Hóa đơn đã lưu';if(typeof savedPaymentPanel==='function')savedPaymentPanel();
  }

  // 4. Xuất / lưu ảnh trực tiếp vào Thư viện ảnh (trên điện thoại) hoặc tải về (trên máy tính)
  await saveOrShareImage(blobs,'Hoa-don-'+invoice.code);

  toast(existingId?'Đã tạo lại ảnh hóa đơn; không lưu trùng.':'Đã tạo ảnh và lưu hóa đơn vào lịch sử.');
 }catch(e){$('billError').textContent=(e.message||'Xuất ảnh không thành công.')+' Phiếu tạm được giữ để thử lại; chưa thêm lịch sử.'}
 finally{lockExport(false)}
};
function invoiceWrap(ctx,value,width,font){ctx.font=font;const text=String(value),lines=[];let line='';for(const ch of text){if(ch==='\n'){lines.push(line);line='';continue}if(line&&ctx.measureText(line+ch).width>width){const space=line.lastIndexOf(' '),dot=line.lastIndexOf('.'),cut=space>0?space:dot>0?dot+1:line.length;lines.push(line.slice(0,cut).trimEnd());line=(line.slice(cut)+ch).trimStart()}else line+=ch}if(line||!lines.length)lines.push(line);return lines}
function invoiceLayout(groups,amount,total){const ctx=document.createElement('canvas').getContext('2d'),pages=[];let page={rows:[],formula:[]},used=0;for(const g of groups){const values=[fishName(g.productName||pname(g.product))+(g.retail?' (lẻ)':''),num(g.quantity)+'\n'+(g.retail?'Kg':'Thùng'),g.retail?'—':'17',money(g.price)+'\n'+(g.retail?'/Kg':'/Thùng'),money(amount(g))];const cells=values.map((v,i)=>invoiceWrap(ctx,v,[210,85,45,150,220][i],'bold '+(i===0?25:23)+'px Arial'));const height=Math.max(90,Math.max(...cells.map(c=>c.length))*29+24);if(used+height>630&&page.rows.length){pages.push(page);page={rows:[],formula:[]};used=0}page.rows.push({g,cells,height});used+=height}pages.push(page);return pages}

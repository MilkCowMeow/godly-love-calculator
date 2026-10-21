/* 站位交换只移动方案中的成员与行动列，战斗结果由用户重新计算。 */
(function(root){'use strict';
 const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
 function swapMemberPositions(value,from,to){
  if(!value||!Array.isArray(value.members)||!Number.isInteger(from)||!Number.isInteger(to)||from===to||from<0||to<0||from>=value.members.length||to>=value.members.length)return false;
  const member=value.members[from];value.members[from]=value.members[to];value.members[to]=member;
  for(const row of Object.values(value.actions||{})){
   if(!row||typeof row!=='object')continue;
   const hasFrom=own(row,from),hasTo=own(row,to),a=row[from],b=row[to];
   if(hasTo)row[from]=b;else delete row[from];
   if(hasFrom)row[to]=a;else delete row[to];
  }
  return true;
 }
 const api={swapMemberPositions,swap:swapMemberPositions,isSwapping:false};
 root.GLFormation=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document==='undefined'||typeof roster!=='function'||typeof plan==='undefined')return;

 const reduced=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):{matches:true};
 const bindings=new WeakSet(),animations=new Set();
 let row=null,pointer=null,keyboard=null,ghost=null,live=null,frame=0,lastFrame=0,suppressUntil=0;
 const clock=()=>typeof performance==='object'?performance.now():Date.now();
 const cellList=()=>row?[...row.querySelectorAll('.roster-cell')]:[];
 const handleAt=index=>cellList()[index]?.querySelector('.formation-handle');
 const memberName=index=>{const member=plan.members[index];return typeof cards!=='undefined'?cards.get(member?.cardId)?.name||'空位':member?.cardId||'空位';};
 const hasDialog=()=>Boolean(document.querySelector('dialog[open]'));
 function announce(message){if(live)live.textContent=message;}
 function stopAnimations(){for(const animation of animations)animation.cancel();animations.clear();}
 function clearMarks(){for(const cell of cellList()){cell.classList.remove('formation-origin','formation-target','formation-keyboard-source');cell.querySelector('.formation-handle')?.setAttribute('aria-pressed','false');}}
 function mark(from,to,usingKeyboard=false){
  clearMarks();const cells=cellList();cells[from]?.classList.add(usingKeyboard?'formation-keyboard-source':'formation-origin');
  cells[from]?.querySelector('.formation-handle')?.setAttribute('aria-pressed','true');
  if(to>=0&&to!==from)cells[to]?.classList.add('formation-target');
 }
 function cancelKeyboard(focus=false){
  const from=keyboard?.from;keyboard=null;clearMarks();
  if(focus&&from!==undefined)handleAt(from)?.focus({preventScroll:true});
 }
 function endPointer(suppress=false){
  const current=pointer;pointer=null;
  if(frame){cancelAnimationFrame(frame);frame=0;}lastFrame=0;
  ghost?.remove();ghost=null;document.body.classList.remove('formation-dragging');clearMarks();
  if(suppress)suppressUntil=clock()+450;
  if(current&&row?.hasPointerCapture?.(current.id)){try{row.releasePointerCapture(current.id);}catch{}}
 }
 function cancel(){const active=Boolean(pointer?.active||keyboard);endPointer(Boolean(pointer?.active));cancelKeyboard();if(active)announce('已取消换位。');}
 function animateSwap(previous,from,to){
  if(reduced.matches)return;
  for(const [index,origin]of [[to,from],[from,to]]){
   const content=cellList()[index]?.querySelector('.formation-member-content'),before=previous[origin];
   if(!content?.animate||!before)continue;
   const after=content.getBoundingClientRect(),dx=before.left-after.left,dy=before.top-after.top;
   const animation=content.animate([
    {transform:`translate(${dx}px,${dy}px) scale(.985)`,opacity:.7},
    {transform:'translate(0,2px) scale(1.008,.99)',opacity:1,offset:.8},
    {transform:'translate(0,0) scale(1)',opacity:1}
   ],{duration:410,easing:'cubic-bezier(.2,.8,.2,1)'});
   animations.add(animation);const done=()=>animations.delete(animation);
   animation.addEventListener('finish',done,{once:true});animation.addEventListener('cancel',done,{once:true});
  }
 }
 function exchange(from,to){
  if(hasDialog())return false;
  stopAnimations();const before=cellList().map(cell=>cell.querySelector('.formation-member-content')?.getBoundingClientRect());
  const first=memberName(from),second=memberName(to);
  if(!swapMemberPositions(plan,from,to))return false;
  api.isSwapping=true;
  try{roster();dirty();}finally{api.isSwapping=false;}
  animateSwap(before,from,to);handleAt(to)?.focus({preventScroll:true});
  announce(`已交换第${from+1}位${first}与第${to+1}位${second}。点击计算伤害可更新结果。`);
  return true;
 }
 function targetAt(x,y){
  const cell=document.elementFromPoint(x,y)?.closest('.roster-cell');
  return cell&&row?.contains(cell)?cellList().indexOf(cell):-1;
 }
 function updatePointer(){
  if(!pointer?.active)return;
  const to=targetAt(pointer.x,pointer.y);pointer.to=to;mark(pointer.from,to);
  if(ghost)ghost.style.transform=`translate(${pointer.x-pointer.offsetX}px,${pointer.y-pointer.offsetY}px) rotate(${to>=0&&to!==pointer.from?-.6:1}deg)`;
 }
 function autoScroll(time){
  frame=0;if(!pointer?.active)return;
  const shell=row.closest('.table-shell'),elapsed=lastFrame?Math.min(2,(time-lastFrame)/16.67):1;lastFrame=time;
  if(shell){
   const rect=shell.getBoundingClientRect(),left=Math.max(0,rect.left),right=Math.min(innerWidth,rect.right),edge=44;
   if(pointer.y>=rect.top&&pointer.y<=rect.bottom){
    const speed=pointer.x<left+edge?-Math.min(14,(left+edge-pointer.x)/3):pointer.x>right-edge?Math.min(14,(pointer.x-right+edge)/3):0;
    if(speed){shell.scrollLeft+=speed*elapsed;updatePointer();}
   }
  }
  frame=requestAnimationFrame(autoScroll);
 }
 function beginDrag(){
  if(!pointer||hasDialog()){endPointer();return;}
  pointer.active=true;stopAnimations();
  const pick=cellList()[pointer.from]?.querySelector('.card-pick');
  if(!pick){endPointer();return;}
  const rect=pick.getBoundingClientRect();pointer.offsetX=Math.min(rect.width-12,Math.max(12,pointer.startX-rect.left));pointer.offsetY=Math.min(rect.height-10,Math.max(10,pointer.startY-rect.top));
  ghost=pick.cloneNode(true);ghost.classList.add('formation-ghost');ghost.setAttribute('aria-hidden','true');ghost.setAttribute('tabindex','-1');ghost.removeAttribute('data-pick');ghost.removeAttribute('aria-label');ghost.style.width=rect.width+'px';
  document.body.append(ghost);document.body.classList.add('formation-dragging');
  try{row.setPointerCapture(pointer.id);}catch{}
  announce(`正在移动第${pointer.from+1}位${memberName(pointer.from)}，松开以交换站位。`);
  updatePointer();frame=requestAnimationFrame(autoScroll);
 }
 function pointerDown(event){
  if(event.isPrimary===false||event.button!==0||hasDialog()||pointer)return;
  const source=event.target.closest('.formation-handle,.card-pick');
  if(!source||!row.contains(source)||source.disabled)return;
  if(event.target.closest('input,select,textarea,a,[contenteditable="true"],[data-detail]'))return;
  const isHandle=source.classList.contains('formation-handle');
  if(event.pointerType!=='mouse'&&!isHandle)return;
  if(event.target.closest('.chevron')&&!isHandle)return;
  const cell=source.closest('.roster-cell'),from=cellList().indexOf(cell);if(from<0)return;
  suppressUntil=0;cancelKeyboard();stopAnimations();
  pointer={id:event.pointerId,from,to:from,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false};
  if(isHandle){event.preventDefault();source.focus({preventScroll:true});}
 }
 function pointerMove(event){
  if(!pointer||pointer.id!==event.pointerId)return;
  if(event.pointerType==='mouse'&&event.buttons===0){endPointer(Boolean(pointer.active));return;}
  pointer.x=event.clientX;pointer.y=event.clientY;
  if(!pointer.active&&Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY)>=7)beginDrag();
  if(pointer?.active){event.preventDefault();updatePointer();}
 }
 function pointerUp(event){
  if(!pointer||pointer.id!==event.pointerId)return;
  if(!pointer.active){endPointer();return;}
  event.preventDefault();pointer.x=event.clientX;pointer.y=event.clientY;updatePointer();
  const {from,to}=pointer;endPointer(true);
  if(to<0||to===from){announce('站位保持原样。');return;}
  exchange(from,to);
 }
 function keyDown(event){
  if(event.key==='Escape'&&(pointer||keyboard)){event.preventDefault();if(pointer)endPointer(Boolean(pointer.active));if(keyboard)cancelKeyboard(true);announce('已取消换位。');return;}
  const handle=event.target.closest('.formation-handle');if(!handle||!row?.contains(handle)||hasDialog())return;
  const index=Number(handle.dataset.formationSlot),move={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1};
  if(event.key==='Tab'){if(keyboard)cancelKeyboard();return;}
  if(event.key==='Enter'||event.key===' '){
   event.preventDefault();
   if(!keyboard){stopAnimations();keyboard={from:index,to:index};mark(index,index,true);announce(`已选中第${index+1}位${memberName(index)}。用方向键选择位置，再按Enter交换。`);}
   else{const from=keyboard.from;cancelKeyboard();if(from===index)announce('站位保持原样。');else exchange(from,index);}
   return;
  }
  if(own(move,event.key)||event.key==='Home'||event.key==='End'){
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?plan.members.length-1:Math.max(0,Math.min(plan.members.length-1,index+move[event.key]));
   handleAt(next)?.focus({preventScroll:true});handleAt(next)?.scrollIntoView({block:'nearest',inline:'nearest'});
   if(keyboard){keyboard.to=next;mark(keyboard.from,next,true);announce(next===keyboard.from?'已回到原站位。':`将与第${next+1}位${memberName(next)}交换，按Enter确认。`);}
  }
 }
 function bind(){
  if(pointer)endPointer(Boolean(pointer.active));if(keyboard)cancelKeyboard();
  row=document.querySelector('#roster-row');if(!row)return;
  if(!live){
   const help=document.createElement('p');help.id='formation-instructions';help.className='formation-sr';help.textContent='拖动手柄可交换两位队员。键盘按Enter选中起点，用方向键选择位置，再按Enter交换，Escape取消。';document.body.append(help);
   live=document.createElement('div');live.className='formation-sr';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');document.body.append(live);
   const caption=document.querySelector('.table-caption p');if(caption){const hint=document.createElement('span');hint.className='formation-caption';hint.textContent='拖动手柄可交换站位，培养设置与逐轮行动一起移动。';caption.append(hint);}
  }
  for(const [index,cell]of cellList().entries()){
   if(!cell.querySelector('.formation-handle')){
    const label=cell.querySelector('.slot-number'),handle=document.createElement('button');handle.type='button';handle.className='formation-handle';handle.dataset.formationSlot=String(index);handle.title='拖动交换站位，也可按Enter使用键盘换位';handle.setAttribute('aria-label',`移动第${index+1}位${memberName(index)}`);handle.setAttribute('aria-describedby','formation-instructions');handle.setAttribute('aria-pressed','false');
    handle.innerHTML='<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="4" cy="3" r="1.2"/><circle cx="10" cy="3" r="1.2"/><circle cx="4" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="4" cy="13" r="1.2"/><circle cx="10" cy="13" r="1.2"/></g></svg>';
    const textNode=[...label.childNodes].find(node=>node.nodeType===3);if(textNode){const marker=document.createElement('span');marker.className='formation-member-label';marker.innerHTML='<span class="formation-member-prefix">MEMBER / </span>'+String(index+1).padStart(2,'0');label.replaceChild(marker,textNode);}
    label.prepend(handle);
   }
   if(!cell.querySelector('.formation-member-content')){
    const content=document.createElement('div');content.className='formation-member-content';const pick=cell.querySelector('.card-pick');cell.insertBefore(content,pick);for(const child of [...cell.children])if(child.matches('.card-pick,.member-settings,.member-policy,.stats-preview'))content.append(child);
   }
   for(const image of cell.querySelectorAll('.card-pick img'))image.draggable=false;
  }
  if(!bindings.has(row)){bindings.add(row);row.addEventListener('pointerdown',pointerDown);row.addEventListener('keydown',keyDown);row.addEventListener('lostpointercapture',event=>{if(pointer?.id===event.pointerId)endPointer(Boolean(pointer.active));});}
 }
 const oldRoster=roster;roster=function(...args){const value=oldRoster.apply(this,args);bind();return value;};
 document.addEventListener('pointerdown',()=>{if(!pointer)suppressUntil=0;},true);
 document.addEventListener('pointermove',pointerMove,{passive:false});document.addEventListener('pointerup',pointerUp,{passive:false});
 document.addEventListener('pointercancel',event=>{if(pointer?.id===event.pointerId)endPointer(Boolean(pointer.active));});
 document.addEventListener('click',event=>{if(suppressUntil>clock()&&row?.contains(event.target)){suppressUntil=0;event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('dragstart',event=>{if(event.target.closest('.card-pick')&&row?.contains(event.target))event.preventDefault();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&pointer){event.preventDefault();endPointer(Boolean(pointer.active));announce('已取消换位。');}});
 document.addEventListener('focusin',event=>{if(keyboard&&!row?.contains(event.target))cancelKeyboard();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancel();stopAnimations();}});root.addEventListener('blur',cancel);
 reduced.addEventListener?.('change',()=>{if(reduced.matches)stopAnimations();});
 Object.assign(api,{bind,cancel,exchange});bind();
})(typeof globalThis!=='undefined'?globalThis:this);

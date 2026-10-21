/* Presentation-only hooks. No simulation, plan, random or persisted-data changes. */
(function(){'use strict';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),active=new Set(),byElement=new WeakMap();
 const out='cubic-bezier(.16,1,.3,1)',snap='cubic-bezier(.2,.8,.2,1)';
 let pendingSlot=null,previousIds=plan.members.map(m=>m.cardId),lastRowsResult=null,indicatorRect=null,indicatorAnimation=null;
 const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
 function animate(el,frames,options={}){
  if(!el||reduced.matches||!el.animate)return null;
  const previous=byElement.get(el);if(previous)previous.cancel();
  const a=el.animate(frames,{duration:360,easing:out,fill:'backwards',...options});
  byElement.set(el,a);active.add(a);
  const cleanup=()=>{active.delete(a);if(byElement.get(el)===a)byElement.delete(el);};
  a.addEventListener('finish',cleanup,{once:true});a.addEventListener('cancel',cleanup,{once:true});return a;
 }
 const reveal=(el,delay=0,distance=10)=>animate(el,[{opacity:0,transform:`translateY(${distance}px)`},{opacity:1,transform:'translateY(0)'}],{duration:380,delay});
 function seat(slot,focus=false){
  const cell=document.querySelectorAll('.roster-cell')[slot],pick=cell?.querySelector('.card-pick');if(!pick)return;
  if(focus)pick.focus({preventScroll:true});
  if(!visible(pick)||reduced.matches)return;
  pick.classList.remove('motion-seated');
  // These keyframes land once, compress at impact and settle without a loose spring.
  const a=animate(pick,[
   {opacity:.18,transform:'translateY(-30px) rotate(-1.5deg) scale(1.025)',offset:0,easing:'cubic-bezier(.48,0,.82,.48)'},
   {opacity:1,transform:'translateY(3px) rotate(.25deg) scale(1.025,.964)',offset:.34,easing:'cubic-bezier(.16,.8,.2,1)'},
   {opacity:1,transform:'translateY(-3px) rotate(-.15deg) scale(.995,1.008)',offset:.62,easing:out},
   {opacity:1,transform:'translateY(0) rotate(0) scale(1)',offset:1}
  ],{duration:560,easing:'linear'});
  pick.classList.add('motion-seated');
  const clean=()=>pick.classList.remove('motion-seated');a?.addEventListener('finish',clean,{once:true});a?.addEventListener('cancel',clean,{once:true});
  [cell.querySelector('.member-settings'),cell.querySelector('.member-policy'),cell.querySelector('.stats-preview')].forEach((el,i)=>reveal(el,155+i*28,6));
 }
 // Capture the selection before the original synchronous handler updates the roster.
 document.addEventListener('click',e=>{
  const b=e.target.closest('#card-list [data-card]');if(b&&!b.disabled)pendingSlot=pickingSlot;
 },true);
 const oldRoster=roster;
 roster=function(...args){
  const chosen=pendingSlot;pendingSlot=null;const changed=plan.members.map((m,i)=>m.cardId!==previousIds[i]?i:-1).filter(i=>i>=0);
  const value=oldRoster.apply(this,args);previousIds=plan.members.map(m=>m.cardId);
  if(!GLFormation.isSwapping)for(const i of new Set(chosen===null?changed:[...changed,chosen]))seat(i,i===chosen);
  return value;
 };
 const oldList=renderCardList;
 renderCardList=function(...args){
  const value=oldList.apply(this,args);let n=0;
  if(document.querySelector('#card-dialog').open)for(const el of document.querySelectorAll('.card-option'))if(visible(el)&&n<12)reveal(el,Math.min(n++*12,90),7);
  return value;
 };
 const oldPicker=openPicker;
 openPicker=function(...args){const value=oldPicker.apply(this,args);let n=0;for(const el of document.querySelectorAll('.card-option'))if(visible(el)&&n<12)reveal(el,35+Math.min(n++*14,100),9);return value;};
 const oldRows=rowsView;
 rowsView=function(...args){
  const value=oldRows.apply(this,args);
  if(result?.ok){const fresh=result!==lastRowsResult;let n=0;
   for(const row of document.querySelectorAll('#battle-body tr'))if(visible(row)){
    const delay=fresh?Math.min(n++*25,150):0;
    for(const el of row.querySelectorAll('.cell-damage,.sum-cell,.cumulative'))reveal(el,delay,fresh?7:3);
   }
   if(fresh)reveal(document.querySelector('#battle-foot'),100,5);
  }
  lastRowsResult=result;
  return value;
 };
 const oldSummary=summary;
 summary=function(...args){const value=oldSummary.apply(this,args);
  document.querySelectorAll('#summary .metric').forEach((el,i)=>reveal(el,i*42,13));
  document.querySelectorAll('#outcome .health-line>span').forEach((el,i)=>animate(el,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:520,delay:80+i*36,easing:snap}));
  reveal(document.querySelector('#result-note'),0,3);return value;
 };
 const segment=document.querySelector('#target-switch'),indicator=document.createElement('span');
 indicator.className='motion-target-indicator';indicator.setAttribute('aria-hidden','true');segment.append(indicator);
 function moveIndicator(){
  const button=segment.querySelector('button.active');if(!button)return;
  const element=button.dataset.target==='tower50'?button.closest('.trial-split'):button,bounds=element.getBoundingClientRect(),parent=segment.getBoundingClientRect();
  const r={x:bounds.left-parent.left,y:bounds.top-parent.top,w:bounds.width,h:bounds.height};
  indicator.style.width=r.w+'px';indicator.style.height=r.h+'px';indicator.style.transform=`translate(${r.x}px,${r.y}px)`;
  if(indicatorAnimation){indicatorAnimation.cancel();indicatorAnimation=null;}
  if(indicatorRect)indicatorAnimation=animate(indicator,[{transform:`translate(${indicatorRect.x}px,${indicatorRect.y}px) scaleX(${indicatorRect.w/r.w})`},{transform:`translate(${r.x}px,${r.y}px) scaleX(1)`}],{duration:310,easing:snap});
  indicatorRect=r;segment.classList.add('motion-indicator-ready');
 }
 const oldTarget=targetPanel;
 targetPanel=function(...args){const value=oldTarget.apply(this,args);moveIndicator();reveal(document.querySelector('#target-detail'),0,6);return value;};
 moveIndicator();new ResizeObserver(()=>{indicatorRect=null;moveIndicator();}).observe(segment);
 function chartEntry(article,index=0){
  article.removeAttribute('data-motion-pending');if(reduced.matches)return;
  reveal(article,index*32,12);
  for(const [i,line]of [...article.querySelectorAll('polyline')].entries()){
   const length=line.getTotalLength();if(length>0)animate(line,[{strokeDasharray:`${length} ${length}`,strokeDashoffset:length},{strokeDasharray:`${length} ${length}`,strokeDashoffset:0}],{duration:680,delay:80+i*28,easing:snap});
  }
 }
 const chartObserver=new IntersectionObserver(entries=>{let index=0;for(const entry of entries)if(entry.isIntersecting){chartObserver.unobserve(entry.target);chartEntry(entry.target,index++);}},{threshold:.08});
 const chartGrid=document.querySelector('#chart-grid');let observedCharts=[];
 function watchCharts(){
  for(const el of observedCharts)chartObserver.unobserve(el);
  observedCharts=[...chartGrid.querySelectorAll('.stat-chart')];
  for(const el of observedCharts){if(reduced.matches)continue;el.setAttribute('data-motion-pending','');chartObserver.observe(el);}
 }
 new MutationObserver(watchCharts).observe(chartGrid,{childList:true});watchCharts();
 const oldRoute=route;
 route=function(...args){const before=currentPanel,value=oldRoute.apply(this,args);if(before!==currentPanel)reveal(document.querySelector(currentPanel==='mechanics'?'#mechanics-view':'#calculate-view'),0,9);return value;};
 window.removeEventListener('hashchange',oldRoute);window.addEventListener('hashchange',route);
 [document.querySelector('.intro'),document.querySelector('.target-panel'),document.querySelector('.toolbar'),document.querySelector('.table-caption'),document.querySelector('.table-shell')].forEach((el,i)=>reveal(el,Math.min(i*45,160),12));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const a of [...active])a.cancel();});
 reduced.addEventListener('change',()=>{if(reduced.matches){for(const a of [...active])a.cancel();for(const el of observedCharts)el.removeAttribute('data-motion-pending');document.querySelectorAll('.motion-seated').forEach(el=>el.classList.remove('motion-seated'));}else watchCharts();});
})();

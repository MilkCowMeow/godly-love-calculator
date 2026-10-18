/* Motion never changes catalog data, filters, routes or native dialog semantics. */
(function(){'use strict';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),active=new Set(),byElement=new WeakMap(),observed=new Set(),accordions=new WeakMap();
 const out='cubic-bezier(.16,1,.3,1)',snap='cubic-bezier(.2,.8,.2,1)';
 let routing=false,liveSearchUntil=0,printing=false;
 const enabled=()=>!reduced.matches&&!printing&&!document.hidden;
 const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0;};
 function animate(el,frames,options={}){
  if(!el||!enabled()||!el.animate)return null;
  byElement.get(el)?.cancel();
  const a=el.animate(frames,{duration:380,easing:out,fill:'backwards',...options});
  byElement.set(el,a);active.add(a);
  const clean=()=>{active.delete(a);if(byElement.get(el)===a)byElement.delete(el);};
  a.addEventListener('finish',clean,{once:true});a.addEventListener('cancel',clean,{once:true});return a;
 }
 const reveal=(el,delay=0,distance=16,duration=420)=>animate(el,[{opacity:0,transform:`translateY(${distance}px)`},{opacity:1,transform:'translateY(0)'}],{duration,delay});
 function prune(){
  for(const a of [...active])if(!a.effect?.target?.isConnected)a.cancel();
  for(const el of [...observed])if(!el.isConnected){observer?.unobserve(el);observed.delete(el);}
 }
 const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  let i=0;for(const entry of entries)if(entry.isIntersecting){const el=entry.target;observer.unobserve(el);observed.delete(el);el.removeAttribute('data-catalog-pending');if(el.isConnected)reveal(el,Math.min(i++*32,96),18);}
 },{threshold:0,rootMargin:'0px 0px 18px 0px'}):null;
 function watch(el){
  if(!el||!observer||!enabled()||observed.has(el))return;
  el.setAttribute('data-catalog-pending','');observed.add(el);observer.observe(el);
 }
 function clearPending(){for(const el of observed){el.removeAttribute('data-catalog-pending');observer?.unobserve(el);}observed.clear();}
 function cancelAll(){for(const a of [...active])a.cancel();clearPending();}
 function positions(){
  const map=new Map();for(const el of document.querySelectorAll('#results a.tile,#results .event-tile'))if(visible(el))map.set(el.getAttribute('href'),el.getBoundingClientRect());return map;
 }
 function resultEntry(before){
  prune();let i=0;const live=performance.now()<liveSearchUntil;
  for(const el of document.querySelectorAll('#results a.tile,#results .event-tile')){
   if(!visible(el)){watch(el);continue;}
   const old=before.get(el.getAttribute('href')),now=el.getBoundingClientRect();
   if(old){const x=old.left-now.left,y=old.top-now.top;if(Math.abs(x)+Math.abs(y)>1&&Math.hypot(x,y)<500)animate(el,[{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:live?210:330,easing:snap});}
   else reveal(el,live?0:Math.min(i++*24,96),live?5:16,live?180:380);
  }
 }
 for(const name of ['cards','events']){
  if(name==='cards'){const old=renderCardResults;renderCardResults=function(...args){const before=routing?null:positions(),value=old.apply(this,args);if(!routing)resultEntry(before);return value;};}
  else{const old=renderEventResults;renderEventResults=function(...args){const before=routing?null:positions(),value=old.apply(this,args);if(!routing)resultEntry(before);return value;};}
 }
 document.addEventListener('input',e=>{if(e.target.matches('#search,#event-search'))liveSearchUntil=performance.now()+220;},true);
 function sceneEntry(){
  prune();
  const intro=document.querySelector('.intro');
  if(intro){reveal(intro.querySelector('h1')?.parentElement,0,16,460);reveal(intro.querySelector('.intro-copy'),65,12,460);}
  const hero=document.querySelector('.reader-hero');
  if(hero){animate(hero.firstElementChild,[{opacity:0,transform:'translateY(18px) scale(.985)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:500});reveal(hero.lastElementChild,65,16,460);}
  const event=document.querySelector('.event-title');if(event)reveal(event,0,16,460);
  for(const el of document.querySelectorAll('.spotlight,.profile-index,.section-head,.stat-grid,.skill,.context-glossary,.profile,.event-reading>h2,.event-reading>.related,.reader-content>section>h2'))watch(el);
  for(const el of document.querySelectorAll('#results a.tile,#results .event-tile,.profiles~.grid>.tile'))watch(el);
 }
 const oldRoute=route;
 route=function(...args){routing=true;try{const value=oldRoute.apply(this,args);sceneEntry();return value;}finally{routing=false;}};
 window.removeEventListener('hashchange',oldRoute);window.addEventListener('hashchange',route);
 // Keep <details> accessible; height is animated only for short, already laid-out content.
 function toggleDetails(d){
  const previous=accordions.get(d),wantOpen=previous?!previous.wantOpen:!d.open,from=d.getBoundingClientRect().height;
  const state={wantOpen,animation:null};accordions.set(d,state);previous?.animation?.cancel();
  d.style.height='';d.style.overflow='';d.removeAttribute('data-motion-closing');
  d.open=false;const collapsed=d.getBoundingClientRect().height;d.open=true;const expanded=d.getBoundingClientRect().height;
  const to=wantOpen?expanded:collapsed;
  const finish=()=>{if(accordions.get(d)!==state)return;d.open=wantOpen;d.style.removeProperty('height');d.style.removeProperty('overflow');d.removeAttribute('data-motion-closing');accordions.delete(d);};
  if(!enabled()||Math.abs(to-from)>1400||[...d.querySelectorAll('img')].some(img=>!img.complete)){finish();return;}
  d.style.height=from+'px';d.style.overflow='hidden';if(!wantOpen)d.setAttribute('data-motion-closing','');
  const a=animate(d,[{height:from+'px'},{height:to+'px'}],{duration:Math.min(280,180+Math.abs(to-from)*.12),easing:snap});state.animation=a;
  if(a){a.addEventListener('finish',finish,{once:true});a.addEventListener('cancel',finish,{once:true});}else finish();
 }
 document.addEventListener('click',e=>{
  const summary=e.target.closest('summary');if(!summary||summary.parentElement?.tagName!=='DETAILS'||!enabled()||e.defaultPrevented)return;
  e.preventDefault();toggleDetails(summary.parentElement);
 });
 document.addEventListener('load',e=>{const img=e.target;if(img instanceof HTMLImageElement&&img.matches('.tile-image>img,.reader-hero .art-button>img,.banner-large,.character-portrait,#lightbox img')&&visible(img))animate(img,[{opacity:.25},{opacity:1}],{duration:230});},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAll();});
 reduced.addEventListener('change',()=>{if(reduced.matches)cancelAll();});
 window.addEventListener('beforeprint',()=>{printing=true;cancelAll();});window.addEventListener('afterprint',()=>{printing=false;});
 sceneEntry();
})();

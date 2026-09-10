/* Input is synchronous; rendering and persistence are independently scheduled. */
(async function(){
  'use strict';
  if(new URLSearchParams(location.search).has('bake'))return;
  const $=id=>document.getElementById(id),C=GooseCore,A=GooseArt,modal=$('modal');
  const SAVE='goose-garden-v1',STATS='goose-garden-stats-v1',PREFS='goose-garden-prefs-v1';
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
  const rawPrefs=read(PREFS,{}),rawStats=read(STATS,{});
  const prefs={sound:rawPrefs?.sound===true,reduced:rawPrefs?.reduced===true,light:rawPrefs?.light===true};
  const natural=n=>Number.isSafeInteger(n)&&n>=0;
  const stats={wins:natural(rawStats?.wins)?rawStats.wins:0,streak:natural(rawStats?.streak)?rawStats.streak:0,
    best:Object.fromEntries(Object.keys(C.MODES).filter(k=>Number.isFinite(rawStats?.best?.[k])&&rawStats.best[k]>=0).map(k=>[k,rawStats.best[k]]))};
  const saved=read(SAVE,null);
  let state=C.validate(saved)&&saved.status!=='won'?saved:C.newGame();
  const bodies=new Map(),images=Object.create(null),flyers=[],particles=[];
  const engine=Matter.Engine.create({enableSleeping:true,gravity:{x:0,y:0}});
  engine.positionIterations=5;
  let canvas=$('board'),view,raf=0,dirty=true,geometryDirty=true,physicsSteps=0,lastFrame=0,accumulator=0;
  let highlighted=null,hintUntil=0,hovered=null,pointer=null,sorted=[],sortDirty=true;
  let audio,toastTimeout,comboAnimation,saveTimer,lastInput=0,storageWarned=false,saveCount=0;
  let lastClock=performance.now(),paused=document.hidden,lastClockText='',statsKey='',prefsKey='',collectionKey='';
  let lastShake=0,currentTheme='',inventoryTypes=[],inventoryRows=new Map(),loading=false;
  const names=['田园小白','桃桃大鹅','雨天小鹅','麦田守望','葡萄软糖','薄荷朋友'];
  const fx=$('effects'),fxCtx=fx.getContext('2d'),slots=[],reserveSlots=[];
  const icons=()=>window.lucide?.createIcons();
  function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
  function persist(key,value){try{localStorage.setItem(key,value);}catch{if(!storageWarned){storageWarned=true;toast('浏览器暂时无法保存进度，本局仍可继续');}}}
  function syncPositions(){for(const item of state.board){const b=bodies.get(item.id);if(b)Object.assign(item,{x:b.position.x,y:b.position.y,angle:b.angle,layer:b.plugin.layer});}}
  function saveNow(){
    clearTimeout(saveTimer);saveTimer=null;syncPositions();
    persist(SAVE,JSON.stringify(state));saveCount++;
    const nextStats=JSON.stringify(stats),nextPrefs=JSON.stringify(prefs);
    if(nextStats!==statsKey){persist(STATS,nextStats);statsKey=nextStats;}
    if(nextPrefs!==prefsKey){persist(PREFS,nextPrefs);prefsKey=nextPrefs;}
  }
  function queueSave(){lastInput=performance.now();clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,300);}
  function timeText(seconds){const t=Math.floor(seconds);return t>=3600?`${Math.floor(t/3600)}:${String(Math.floor(t/60)%60).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`:`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;}
  function clock(){
    const now=performance.now();if(!paused&&state.status==='playing')state.elapsed+=(now-lastClock)/1000;lastClock=now;
    const text=timeText(state.elapsed);if(text!==lastClockText){$('timer').textContent=text;lastClockText=text;}
  }
  function sound(kind='pick'){
    if(!prefs.sound)return;
    try{
      audio??=new(window.AudioContext||window.webkitAudioContext)();
      if(audio.state==='suspended')audio.resume().catch(()=>{});
      const notes=kind==='match'?[523,659,784]:kind==='win'?[523,659,784,1046]:kind==='shake'?[220,330]:[420];
      for(let i=0;i<notes.length;i++){
        const o=audio.createOscillator(),g=audio.createGain(),start=audio.currentTime+i*.07;
        o.type='sine';o.frequency.value=notes[i];g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(.045,start+.012);g.gain.exponentialRampToValueAtTime(.001,start+.16);
        o.connect(g);g.connect(audio.destination);o.start(start);o.stop(start+.17);o.onended=()=>{o.disconnect();g.disconnect();};
      }
    }catch{prefs.sound=false;renderSound();}
  }
  function renderSound(){
    const b=$('sound-btn');b.innerHTML=`<i data-lucide="${prefs.sound?'volume-2':'volume-x'}"></i>`;
    b.title=prefs.sound?'关闭音效':'开启音效';b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(prefs.sound));icons();
  }
  function image(type){
    if(images[type])return images[type];
    const img=new Image();img.src=A.image(type);img.onload=()=>{dirty=true;wake();};images[type]=img;return img;
  }
  async function preload(types){
    await Promise.all(types.map(type=>new Promise(resolve=>{const img=image(type);if(img.complete){resolve();return;}img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});})));
  }
  function order(){if(sortDirty){sorted=[...bodies.values()].sort((a,b)=>a.plugin.layer-b.plugin.layer||a.position.y-b.position.y||a.id-b.id);sortDirty=false;}return sorted;}
  function initialPose(item,index,length){
    const rng=C.random(state.seed+item.id*103),theta=index*2.399963+state.seed*.01,radius=Math.sqrt((index+.5)/length);
    return {
      x:Number.isFinite(item.x)?Math.max(100,Math.min(460,item.x)):280+Math.cos(theta)*176*radius,
      y:Number.isFinite(item.y)?Math.max(100,Math.min(340,item.y)):220+Math.sin(theta)*124*radius,
      angle:Number.isFinite(item.angle)?item.angle:(rng()-.5)*1.5,
      layer:Number.isInteger(item.layer)&&item.layer>=0&&item.layer<=5?item.layer:index%Math.ceil(state.total/24)
    };
  }
  function reconcile(reset=false){
    if(reset){Matter.Composite.clear(engine.world,false);bodies.clear();flyers.length=0;particles.length=0;}
    const active=new Set(state.board.map(x=>x.id));
    for(const [id,b]of bodies)if(!active.has(id)){Matter.Composite.remove(engine.world,b);bodies.delete(id);}
    state.board.forEach((item,i)=>{
      if(bodies.has(item.id))return;
      const p=initialPose(item,i,state.board.length);
      const b=Matter.Bodies.circle(p.x,p.y,27,{
        frictionAir:.14,restitution:.25,angle:p.angle,collisionFilter:{category:1<<p.layer,mask:1<<p.layer},sleepThreshold:25,
        plugin:{itemId:item.id,type:item.type,layer:p.layer}
      });
      bodies.set(item.id,b);Matter.Composite.add(engine.world,b);
    });
    sortDirty=geometryDirty=dirty=true;
    // Keep raycast identities current even when several taps arrive in one frame.
    if(view){view.sync(bodies.values(),state.theme);geometryDirty=false;}
    wake();
  }
  function stepPhysics(){
    Matter.Engine.update(engine,1000/60);
    for(const b of bodies.values()){
      const d=Math.hypot((b.position.x-280)/181,(b.position.y-220)/131);
      if(d>1){Matter.Body.setPosition(b,{x:280+(b.position.x-280)/d,y:220+(b.position.y-220)/d});Matter.Body.setVelocity(b,{x:-b.velocity.x*.3,y:-b.velocity.y*.3});}
    }
    sortDirty=geometryDirty=dirty=true;
  }
  function wake(){
    if(raf||document.hidden||!view)return;
    lastFrame=performance.now()-16.7;raf=requestAnimationFrame(frame);
  }
  function effects(now,delta){
    const scale=fx.width/560;fxCtx.setTransform(scale,0,0,scale,0,0);fxCtx.clearRect(0,0,560,450);
    for(let i=flyers.length-1;i>=0;i--){
      const f=flyers[i],t=Math.min(1,(now-f.start)/230),e=1-(1-t)**3;
      const size=78*(1-.65*t),img=images[f.type];
      fxCtx.globalAlpha=1-t;
      if(img?.complete&&img.naturalWidth)fxCtx.drawImage(img,f.x+(280-f.x)*e-size/2,f.y+(470-f.y)*e-size/2,size,size);
      if(t>=1)flyers.splice(i,1);
    }
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];p.x+=p.vx*delta;p.y+=p.vy*delta;p.vy+=.08*delta;p.life-=delta;
      fxCtx.globalAlpha=Math.max(0,p.life/25);fxCtx.fillStyle=p.color;fxCtx.fillRect(p.x,p.y,4,4);if(p.life<=0)particles.splice(i,1);
    }
    fxCtx.globalAlpha=1;
  }
  function frame(now){
    raf=0;const dt=Math.min(40,Math.max(1,now-lastFrame));lastFrame=now;
    if(!paused&&physicsSteps>0){
      accumulator+=dt;
      for(let steps=0;accumulator>=16.66&&steps<3&&physicsSteps>0;steps++){stepPhysics();physicsSteps--;accumulator-=16.66;}
    }
    if(highlighted&&now>=hintUntil){highlighted=null;dirty=true;}
    if(geometryDirty){view.sync(bodies.values(),state.theme);geometryDirty=false;}
    if(dirty){view.mark(highlighted,hovered);view.render();dirty=false;}
    effects(now,dt/16.66);
    if(!paused&&(physicsSteps>0||flyers.length||particles.length))raf=requestAnimationFrame(frame);
  }
  function buildSlots(){
    for(let i=0;i<7;i++){
      const el=document.createElement('div');el.className='slot';const number=document.createElement('span');number.textContent=String(i+1);
      el.append(number);$('tray').append(el);slots.push({el,id:null,number,img:null});
    }
    for(let i=0;i<3;i++){
      const el=document.createElement('button');el.hidden=true;const img=new Image();img.alt='';el.append(img);$('reserve').append(el);reserveSlots.push({el,img,id:null});
    }
  }
  function renderCollection(){
    const key=`${stats.wins}/${stats.streak}`;if(key===collectionKey)return;collectionKey=key;
    $('total-wins').innerHTML=`${stats.wins}<span> 只</span>`;$('win-streak').innerHTML=`${stats.streak}<span> 局</span>`;
    $('collection-count').textContent=`${Math.min(6,stats.wins)} / 6`;
    $('goose-collection').innerHTML=names.map((name,i)=>`<button class="collection-item ${stats.wins>i?'unlocked':''}" data-goose="${i}" title="${stats.wins>i?name:`累计获胜 ${i+1} 局解锁`}" aria-label="${name}，${stats.wins>i?'已解锁':`累计获胜 ${i+1} 局解锁`}"><img src="${A.goose(i)}" alt="">${stats.wins>i?'':'<i data-lucide="lock-keyhole"></i>'}</button>`).join('');icons();
  }
  function buildInventory(){
    const remaining=[...state.board,...state.tray,...state.reserve].map(x=>x.type);
    inventoryTypes=[...new Set(remaining.length?remaining:C.THEMES[state.theme].order.slice(0,C.MODES[state.mode].kinds))];
    const order=C.THEMES[state.theme].order;inventoryTypes.sort((a,b)=>order.indexOf(a)-order.indexOf(b));
    inventoryRows=new Map();const fragment=document.createDocumentFragment();
    for(const type of inventoryTypes){
      const el=document.createElement('div');el.className='inventory-item';
      const thumb=document.createElement('div'),img=new Image(),count=document.createElement('strong'),label=document.createElement('span');
      img.src=A.image(type);img.alt='';label.textContent=A.items[type].name;thumb.append(img,count);el.append(thumb,label);fragment.append(el);
      inventoryRows.set(type,{el,count,value:-1});image(type);
    }
    $('inventory').replaceChildren(fragment);
  }
  function render(full=false){
    if(full){
      const theme=C.THEMES[state.theme],idx=Object.keys(C.THEMES).indexOf(state.theme)+1;
      $('scene-title').innerHTML=`${theme.name}<span>${String(idx).padStart(2,'0')}</span>`;$('level-badge').textContent=C.MODES[state.mode].badge;
      document.documentElement.style.setProperty('--scene-accent',theme.color);
      document.querySelectorAll('[data-theme]').forEach(el=>{const active=el.dataset.theme===state.theme;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));});
      document.querySelectorAll('[data-mode]').forEach(el=>{const active=el.dataset.mode===state.mode;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
      buildInventory();currentTheme=state.theme;
    }
    $('remaining').textContent=state.total-state.matched;
    const progress=Math.round(state.matched/state.total*100);$('progress-fill').style.width=progress+'%';$('progress-text').textContent=progress+'%';
    $('tray-count').textContent=`${state.tray.length} / 7`;$('tray').classList.toggle('danger',state.tray.length>=5);
    slots.forEach((slot,i)=>{
      const item=state.tray[i],id=item?.id??null;if(slot.id===id)return;slot.id=id;
      slot.el.setAttribute('aria-label',item?A.items[item.type].name:'空格');
      if(item){slot.img??=new Image();slot.img.src=A.image(item.type);slot.img.alt=A.items[item.type].name;slot.el.replaceChildren(slot.img);}
      else slot.el.replaceChildren(slot.number);
    });
    $('reserve-row').hidden=!state.reserve.length;
    reserveSlots.forEach((slot,i)=>{
      const item=state.reserve[i];slot.el.hidden=!item;
      if(item&&slot.id!==item.id){slot.id=item.id;slot.img.src=A.image(item.type);slot.el.dataset.reserve=item.id;slot.el.title=`取回${A.items[item.type].name}`;slot.el.setAttribute('aria-label',slot.el.title);}
      if(!item)slot.id=null;
    });
    const counts={};for(const x of [...state.board,...state.tray,...state.reserve])counts[x.type]=(counts[x.type]||0)+1;
    for(const [type,row]of inventoryRows){const n=counts[type]||0;if(n!==row.value){row.value=n;row.count.textContent=n;row.el.classList.toggle('empty',!n);}}
    $('undo-btn').disabled=!state.history.length||state.status==='won';
    $('stash-btn').disabled=!state.tray.length||state.reserve.length>=3||state.status!=='playing';
    $('shake-btn').disabled=!state.board.length||state.status!=='playing';$('hint-btn').disabled=state.status!=='playing';
    $('best-time').textContent=stats.best[state.mode]===undefined?'等你来创造':timeText(stats.best[state.mode]);renderCollection();
  }
  function showModal(title,body,actions,art=false){
    clock();$('modal-title').textContent=title;$('modal-body').innerHTML=body;
    $('modal-art').innerHTML=art?`<img src="${A.goose()}" alt="田园小白">`:'';
    $('modal-actions').replaceChildren();
    for(const action of actions){const b=document.createElement('button');b.textContent=action.label;b.className=action.secondary?'secondary-button':'primary-button';b.addEventListener('click',action.run);$('modal-actions').append(b);}
    if(!modal.open)modal.showModal();paused=true;
  }
  function closeModal(){clock();modal.close();paused=document.hidden;lastClock=performance.now();wake();}
  async function startRound(mode=state.mode,theme=state.theme){
    if(loading)return;closeModal();loading=true;$('board-loading').hidden=false;
    if(state.status==='playing'&&state.moves>0)stats.streak=0;
    const seed=crypto.getRandomValues(new Uint32Array(1))[0];state=C.newGame(mode,theme,seed);highlighted=null;hovered=null;physicsSteps=0;
    await preload(C.THEMES[theme].order.slice(0,C.MODES[mode].kinds));
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    reconcile(true);for(let i=0;i<35;i++)stepPhysics();render(true);dirty=geometryDirty=true;loading=false;$('board-loading').hidden=true;
    lastClock=performance.now();queueSave();wake();
  }
  function requestRound(mode=state.mode,theme=state.theme){
    if(state.moves===0||state.status!=='playing')return startRound(mode,theme);
    showModal('换一锅新鲜的？','<p>当前这一锅会重新开始，已收集的鹅友和历史纪录会保留。</p>',[
      {label:'继续这锅',run:closeModal,secondary:true},{label:'开新一锅',run:()=>startRound(mode,theme)}
    ]);
  }
  function showLost(){
    showModal('篮子装满啦','<p>就差一点点。撤回一步，还能继续这一锅。</p>',[
      {label:'重新开锅',run:()=>startRound(),secondary:true},{label:'免费撤回继续',run:()=>{closeModal();undo();}}
    ],true);
  }
  function showWon(){
    const i=Math.min(5,Math.max(0,stats.wins-1));
    showModal('大鹅，抓到啦！',`<p>${stats.wins<=6?`${names[i]}加入了你的鹅友小队。`:'又是满载而归的一天。'}</p><div class="modal-stat"><div><strong>${timeText(state.elapsed)}</strong><span>本局用时</span></div><div><strong>${state.moves}</strong><span>收获次数</span></div></div>`,[
      {label:'看看鹅友',secondary:true,run:()=>showGoose(i)},{label:'再抓一只',run:()=>startRound()}
    ],true);$('modal-art').firstElementChild.src=A.goose(i);
  }
  function pick(id,source='board'){
    if(modal.open||loading)return;clock();syncPositions();
    const body=bodies.get(id),result=C.pick(state,id,source);if(!result.ok)return;
    if(body&&!prefs.reduced){flyers.push({type:result.item.type,x:body.position.x,y:body.position.y,start:performance.now()});if(flyers.length>8)flyers.shift();}
    reconcile();hovered=null;
    if(result.cleared){
      sound('match');
      if(!prefs.reduced){
        for(let i=0;i<12;i++)particles.push({x:body?.position.x??280,y:body?.position.y??220,vx:(Math.random()-.5)*5,vy:-Math.random()*3-1,life:25,color:['#97b089','#d8a266','#d8908b'][i%3]});
        if(particles.length>48)particles.splice(0,particles.length-48);
        $('combo').textContent=result.item.type==='goose'?'大鹅收好！':'好事成三！';
        comboAnimation?.cancel();comboAnimation=$('combo').animate([{opacity:0,transform:'translate(-50%,5px)'},{opacity:1,transform:'translate(-50%,-10px)',offset:.25},{opacity:0,transform:'translate(-50%,-32px)'}],{duration:680,easing:'ease-out'});
      }
    }else sound();
    if(state.status==='won'){
      stats.wins++;stats.streak++;stats.best[state.mode]=Math.min(stats.best[state.mode]??Infinity,state.elapsed);
      render();saveNow();sound('win');showWon();return;
    }
    if(state.status==='lost')stats.streak=0;
    render();queueSave();wake();if(state.status==='lost')showLost();
  }
  function undo(){if(C.undo(state)){reconcile(true);render();queueSave();toast('已撤回上一步');}}
  function shake(){
    if(state.status!=='playing'||loading)return;const now=performance.now();if(lastShake&&now-lastShake<300)return;lastShake=now;
    const items=C.shuffle([...bodies.values()],Math.random),layers=Math.ceil(state.total/24);
    items.forEach((b,i)=>{
      b.plugin.layer=i%layers;b.collisionFilter.category=1<<b.plugin.layer;b.collisionFilter.mask=1<<b.plugin.layer;Matter.Sleeping.set(b,false);
      const a=Math.random()*6.28;Matter.Body.setVelocity(b,{x:Math.cos(a)*7,y:Math.sin(a)*5});Matter.Body.setAngularVelocity(b,(Math.random()-.5)*.12);
    });
    physicsSteps=prefs.reduced?22:65;sortDirty=geometryDirty=dirty=true;sound('shake');queueSave();wake();
  }
  function hint(){
    if(loading)return;const type=C.hint(state);if(!type)return;highlighted=type;hintUntil=performance.now()+5000;
    const targets=[];
    for(const b of bodies.values()){
      if(b.plugin.layer===5){b.plugin.layer=b.plugin.itemId%Math.ceil(state.total/24);b.collisionFilter.category=1<<b.plugin.layer;b.collisionFilter.mask=1<<b.plugin.layer;}
      if(b.plugin.type===type&&targets.length<3)targets.push(b);
    }
    targets.forEach((b,i)=>{
      b.plugin.layer=5;b.collisionFilter.category=32;b.collisionFilter.mask=32;Matter.Sleeping.set(b,false);
      Matter.Body.setPosition(b,{x:210+i*70,y:210});Matter.Body.setVelocity(b,{x:0,y:0});Matter.Body.setAngularVelocity(b,0);
    });
    physicsSteps=15;sortDirty=geometryDirty=dirty=true;
    view.sync(bodies.values(),state.theme);geometryDirty=false;toast(`找到${A.items[type].name}了${state.reserve.some(x=>x.type===type)?'，寄存区也有哦':''}`);queueSave();wake();
    setTimeout(()=>{if(performance.now()>=hintUntil){highlighted=null;dirty=true;wake();}},5100);
  }
  function hit(x,y){if(geometryDirty){view.sync(bodies.values(),state.theme);geometryDirty=false;}return view.pick(x,y);}
  function point(e){const rect=canvas.getBoundingClientRect();return{x:(e.clientX-rect.left)*560/rect.width,y:(e.clientY-rect.top)*450/rect.height};}
  function showGoose(i){showModal(names[i],`<p>${stats.wins>i?'这位鹅友已经在你的农场安家啦。':`累计获胜 ${i+1} 局后，这位鹅友就会来报到。`}</p>`,[{label:'回到农场',run:closeModal}],true);$('modal-art').firstElementChild.src=A.goose(i);}
  function showSettings(){
    showModal('农场设置',`<label class="setting-row"><span>游戏音效</span><input id="setting-sound" type="checkbox" ${prefs.sound?'checked':''}></label><label class="setting-row"><span>减少动效</span><input id="setting-motion" type="checkbox" ${prefs.reduced?'checked':''}></label><label class="setting-row"><span>省电画质</span><input id="setting-light" type="checkbox" ${prefs.light?'checked':''}></label><label class="setting-row"><span>下一锅难度</span><select id="setting-mode">${Object.entries(C.MODES).map(([id,m])=>`<option value="${id}" ${state.mode===id?'selected':''}>${m.name}</option>`).join('')}</select></label>`,[{label:'完成',run:()=>{
      const mode=$('setting-mode').value,changed=prefs.light!==$('setting-light').checked;
      prefs.sound=$('setting-sound').checked;prefs.reduced=$('setting-motion').checked;prefs.light=$('setting-light').checked;
      renderSound();closeModal();saveNow();if(changed){location.reload();return;}if(mode!==state.mode)requestRound(mode);
    }}]);
  }
  function showHelp(){
    showModal('一锅小小的快乐','<div class="help-copy"><p><b>三个一样，收进篮子。</b><br>点选盘里露出的物品，三个相同物品自动消除。</p><p><b>篮子只有七格。</b><br>清空全部物品就能抓到大鹅；装满也可以免费撤回继续。</p><p><b>道具随时用。</b><br>撤回、三格寄存、颠锅和找一组都不限次。寄存物品可以点回篮子。</p></div>',[
      {label:'选择物品列表',secondary:true,run:showAccessible},{label:'知道啦',run:closeModal}
    ]);
  }
  function showAccessible(){
    const visible=order().filter(b=>hit(b.position.x,b.position.y)===b.plugin.itemId).reverse();
    showModal('可收获的好物',`<div class="accessibility-items">${visible.map(b=>`<button data-accessible="${b.plugin.itemId}">${A.items[b.plugin.type].name}</button>`).join('')}${state.reserve.map(x=>`<button data-accessible="${x.id}" data-source="reserve">${A.items[x.type].name} · 寄存</button>`).join('')}</div>`,[{label:'回到锅里',run:closeModal}]);
  }
  document.querySelector('.scene-tabs').innerHTML=Object.entries(C.THEMES).map(([id,t])=>`<button class="scene-tab" data-theme="${id}" role="tab" aria-selected="false"><i data-lucide="${t.icon}"></i>${t.label}</button>`).join('');
  buildSlots();
  await preload([...new Set([...state.board,...state.tray,...state.reserve].map(x=>x.type))]);
  view=GooseRenderer.create(canvas,images,prefs.light);canvas=$('board');
  $('brand-goose').src=A.image('goose');$('hero-goose').src=A.goose();
  const resize=()=>{
    view.resize(canvas);const scale=Math.min(devicePixelRatio||1,1.5);fx.width=560*scale;fx.height=450*scale;dirty=true;wake();
  };
  new ResizeObserver(resize).observe(canvas);
  canvas.addEventListener('pointerdown',e=>{
    if(state.status!=='playing'||loading)return;const p=point(e);pointer={...p,id:e.pointerId,item:hit(p.x,p.y)};canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup',e=>{
    const p=point(e),down=pointer;pointer=null;
    if(down?.id===e.pointerId&&Math.hypot(p.x-down.x,p.y-down.y)<15&&down.item!==null)pick(down.item);
  });
  canvas.addEventListener('pointercancel',()=>{pointer=null;});
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse'||pointer)return;const p=point(e),id=hit(p.x,p.y);
    if(id!==hovered){hovered=id;canvas.style.cursor=id===null?'default':'pointer';dirty=true;wake();}
  });
  canvas.addEventListener('pointerleave',()=>{if(hovered!==null){hovered=null;dirty=true;wake();}});
  canvas.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showAccessible();}});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();prefs.light=true;saveNow();location.reload();});
  $('reserve').addEventListener('click',e=>{const b=e.target.closest('[data-reserve]');if(b)pick(Number(b.dataset.reserve),'reserve');});
  $('modal-body').addEventListener('click',e=>{const b=e.target.closest('[data-accessible]');if(b){const id=Number(b.dataset.accessible),source=b.dataset.source||'board';closeModal();pick(id,source);if(state.status==='playing')showAccessible();}});
  $('restart-btn').addEventListener('click',()=>requestRound());document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();requestRound();});
  $('undo-btn').addEventListener('click',undo);$('stash-btn').addEventListener('click',()=>{syncPositions();if(C.stash(state)){render();queueSave();toast('已放入寄存区，随时可以取回');}});
  $('shake-btn').addEventListener('click',shake);$('hint-btn').addEventListener('click',hint);
  $('settings-btn').addEventListener('click',showSettings);$('mobile-difficulty').addEventListener('click',showSettings);$('help-btn').addEventListener('click',showHelp);
  $('sound-btn').addEventListener('click',()=>{prefs.sound=!prefs.sound;renderSound();queueSave();if(prefs.sound)sound();});
  $('modal-close').addEventListener('click',closeModal);
  modal.addEventListener('close',()=>{clock();paused=document.hidden;lastClock=performance.now();wake();});
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.mode!==state.mode)requestRound(b.dataset.mode);}));
  document.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.theme!==state.theme)requestRound(state.mode,b.dataset.theme);}));
  $('goose-collection').addEventListener('click',e=>{const b=e.target.closest('[data-goose]');if(b)showGoose(Number(b.dataset.goose));});
  document.querySelector('.scene-tabs').addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
    const tabs=[...document.querySelectorAll('[data-theme]')],i=tabs.indexOf(document.activeElement),n=tabs.length;
    tabs[e.key==='Home'?0:e.key==='End'?n-1:(i+(e.key==='ArrowRight'?1:n-1))%n].focus();
  });
  document.addEventListener('visibilitychange',()=>{clock();paused=document.hidden||modal.open;saveNow();if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{dirty=true;wake();}});
  window.addEventListener('pagehide',()=>{clock();saveNow();});
  reconcile(true);for(let i=0;i<35;i++)stepPhysics();view.sync(bodies.values(),state.theme);geometryDirty=false;
  render(true);renderSound();resize();saveNow();lastClock=performance.now();$('board-loading').hidden=true;dirty=true;wake();
  setInterval(clock,250);
  setInterval(()=>{if(!paused&&state.status==='playing'&&performance.now()-lastInput>1000)saveNow();},10000);
  if(state.status==='lost')showLost();
  if(new URLSearchParams(location.search).has('test'))window.__goose={
    state:()=>JSON.parse(JSON.stringify(state)),
    bodies:()=>order().map(b=>({id:b.plugin.itemId,type:b.plugin.type,x:b.position.x,y:b.position.y,layer:b.plugin.layer})),
    hit,ready:true,metrics:()=>({...view.metrics(),saveCount,animating:!!raf,loading})
  };
})().catch(error=>{
  console.error(error);const box=document.getElementById('toast');box.textContent='游戏加载失败，请刷新页面；请保留 vendor 和素材文件。';box.classList.add('visible');
});

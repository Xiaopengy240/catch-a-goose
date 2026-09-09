/* UI and physics adapter. Matching rules remain independent in core.js. */
(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = GooseCore, A = GooseArt;
  const canvas = $('board'), ctx = canvas.getContext('2d'), modal = $('modal');
  const SAVE = 'goose-garden-v1', STATS = 'goose-garden-stats-v1', PREFS = 'goose-garden-prefs-v1';
  const read = (key,fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  let prefs = read(PREFS,{});
  if (!prefs || typeof prefs !== 'object') prefs = {};
  prefs = {sound:prefs.sound===true,reduced:prefs.reduced===true};
  let rawStats = read(STATS,{});
  if (!rawStats || typeof rawStats !== 'object') rawStats = {};
  const natural = n => Number.isSafeInteger(n) && n>=0;
  let stats = {
    wins:natural(rawStats.wins)?rawStats.wins:0,
    streak:natural(rawStats.streak)?rawStats.streak:0,
    best:Object.fromEntries(Object.keys(C.MODES).filter(k=>Number.isFinite(rawStats.best?.[k]) && rawStats.best[k]>=0).map(k=>[k,rawStats.best[k]]))
  };
  let saved = read(SAVE,null);
  let state = C.validate(saved) && saved.status!=='won' ? saved : C.newGame();
  let storageWarned=false, toastTimeout, comboTimeout, audio, highlighted=null, hintUntil=0, lastShake=0, hovered=null, pointerDown=null;
  let lostDialogPending=false, lastTick=performance.now(), lastSave=0, activeTime=0, physicsActive=0;
  const sprites={}, bodies=new Map(), particles=[], flying=[];
  const colors=['#81a380','#d39a87','#92aeb5','#c7b071','#ad9fbc','#79aca0'];
  const gooseNames=['田园小白','桃桃大鹅','雨天小鹅','麦田守望','葡萄软糖','薄荷朋友'];
  const engine=Matter.Engine.create({enableSleeping:true,gravity:{x:0,y:0}});
  engine.positionIterations=7;
  const icons = () => { if(window.lucide) lucide.createIcons(); };
  function toast(message) {
    $('toast').textContent=message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout=setTimeout(()=>$('toast').classList.remove('visible'),2700);
  }
  function write(key,value) {
    try { localStorage.setItem(key,JSON.stringify(value)); }
    catch { if(!storageWarned) { storageWarned=true; toast('浏览器暂时无法保存进度，本局仍可继续玩'); } }
  }
  function syncPositions() {
    state.board.forEach(item=>{
      const b=bodies.get(item.id);
      if(b) Object.assign(item,{x:b.position.x,y:b.position.y,angle:b.angle,layer:b.plugin.layer});
    });
  }
  function save() { syncPositions(); write(SAVE,state); write(STATS,stats); write(PREFS,prefs); }
  function timeText(seconds) {
    const t=Math.floor(seconds);
    return t>=3600 ? `${Math.floor(t/3600)}:${String(Math.floor(t/60)%60).padStart(2,'0')}:${String(t%60).padStart(2,'0')}` : `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  }
  function sound(kind='pick') {
    if(!prefs.sound) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if(audio.state==='suspended') audio.resume().catch(()=>{});
      const notes=kind==='match'?[523,659,784]:kind==='win'?[523,659,784,1046]:kind==='shake'?[220,330]:[420];
      notes.forEach((frequency,i)=>{
        const oscillator=audio.createOscillator(), gain=audio.createGain();
        oscillator.type='sine'; oscillator.frequency.value=frequency;
        gain.gain.setValueAtTime(0,audio.currentTime+i*.085);
        gain.gain.linearRampToValueAtTime(.055,audio.currentTime+i*.085+.015);
        gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+i*.085+.2);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(audio.currentTime+i*.085); oscillator.stop(audio.currentTime+i*.085+.21);
      });
    } catch { prefs.sound=false; renderSound(); }
  }
  function renderSound() {
    $('sound-btn').innerHTML=`<i data-lucide="${prefs.sound?'volume-2':'volume-x'}"></i>`;
    $('sound-btn').title=prefs.sound?'关闭音效':'开启音效';
    $('sound-btn').setAttribute('aria-label',$('sound-btn').title);
    $('sound-btn').setAttribute('aria-pressed',String(prefs.sound)); icons();
  }
  function safePose(item,index,length) {
    const rng=C.random(state.seed+item.id*103);
    const theta=index*2.399963+state.seed*.01, radius=Math.sqrt((index+.5)/length);
    return {
      x:Number.isFinite(item.x)?Math.max(100,Math.min(460,item.x)):280+Math.cos(theta)*176*radius,
      y:Number.isFinite(item.y)?Math.max(100,Math.min(340,item.y)):220+Math.sin(theta)*124*radius,
      angle:Number.isFinite(item.angle)?item.angle:(rng()-.5)*.95,
      layer:Number.isInteger(item.layer)&&item.layer>=0&&item.layer<=5?item.layer:index%Math.ceil(state.total/24)
    };
  }
  function reconcile(reset=false) {
    if(reset) { Matter.Composite.clear(engine.world,false); bodies.clear(); flying.length=0; particles.length=0; }
    const ids=new Set(state.board.map(x=>x.id));
    for(const [id,b] of bodies) if(!ids.has(id)) { Matter.Composite.remove(engine.world,b); bodies.delete(id); }
    state.board.forEach((item,i)=>{
      const pose=safePose(item,i,state.board.length);
      let b=bodies.get(item.id);
      if(!b) {
        b=Matter.Bodies.circle(pose.x,pose.y,27,{frictionAir:.1,restitution:.4,angle:pose.angle,
          collisionFilter:{category:1<<pose.layer,mask:1<<pose.layer},sleepThreshold:35,
          plugin:{itemId:item.id,type:item.type,layer:pose.layer}});
        bodies.set(item.id,b); Matter.Composite.add(engine.world,b);
      }
    });
    physicsActive=90;
  }
  function order() { return [...bodies.values()].sort((a,b)=>a.plugin.layer-b.plugin.layer || a.position.y-b.position.y || a.id-b.id); }
  function constrain(b) {
    const x=(b.position.x-280)/181, y=(b.position.y-220)/131, d=Math.hypot(x,y);
    if(d>1) {
      Matter.Body.setPosition(b,{x:280+(b.position.x-280)/d,y:220+(b.position.y-220)/d});
      Matter.Body.setVelocity(b,{x:b.velocity.x*-.4,y:b.velocity.y*-.4});
    }
  }
  function stepPhysics() {
    Matter.Engine.update(engine,1000/60);
    for(const b of bodies.values()) constrain(b);
  }
  function pot() {
    ctx.save();
    ctx.fillStyle='#dce2ca';ctx.beginPath();ctx.ellipse(280,404,202,15,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d69d88';ctx.strokeStyle='#bd8b77';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.roundRect(14,202,77,37,10);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.roundRect(469,202,77,37,10);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f0c5b0';ctx.beginPath();ctx.roundRect(19,203,65,10,5);ctx.fill();
    ctx.beginPath();ctx.roundRect(476,203,65,10,5);ctx.fill();
    ctx.fillStyle='#b6c49e';ctx.strokeStyle='#91a780';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.ellipse(280,235,234,169,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#d9e1c4';ctx.beginPath();ctx.ellipse(280,220,234,170,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#c3d2ad';ctx.beginPath();ctx.ellipse(280,220,213,149,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#a9bf94';ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle='#d2dec0';ctx.beginPath();ctx.ellipse(280,226,202,135,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#edf0d8';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(280,216,224,157,0,Math.PI*1.08,Math.PI*1.86);ctx.stroke();
    ctx.strokeStyle='#d6dfbe';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(280,225,180,116,0,.2,Math.PI*.84);ctx.stroke();
    ctx.restore();
  }
  function renderCanvas(now) {
    const scale=Math.min(window.devicePixelRatio||1,2);
    if(canvas.width!==Math.round(560*scale)) { canvas.width=Math.round(560*scale);canvas.height=Math.round(450*scale); }
    ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,560,450);pot();
    const isHint=now<hintUntil;
    for(const b of order()) {
      const {x,y}=b.position, type=b.plugin.type;
      ctx.save();ctx.translate(x,y);ctx.rotate(b.angle);
      if((isHint&&type===highlighted)||hovered===b.plugin.itemId) {
        ctx.fillStyle=isHint&&type===highlighted?'#fff8cc':'#edf7df';
        ctx.strokeStyle=isHint&&type===highlighted?'#d7b760':'#97b084';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,36,0,Math.PI*2);ctx.fill();ctx.stroke();
      }
      ctx.shadowColor='#465a3d38';ctx.shadowBlur=5;ctx.shadowOffsetY=5;
      ctx.drawImage(sprites[type],-38,-38,76,76);ctx.restore();
    }
    for(let i=particles.length-1;i>=0;i--) {
      const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.065;p.life--;
      ctx.globalAlpha=Math.max(0,p.life/35);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,5,5);
      if(p.life<=0) particles.splice(i,1);
    }
    ctx.globalAlpha=1;
    for(let i=flying.length-1;i>=0;i--) {
      const f=flying[i], t=Math.min((now-f.start)/280,1), ease=1-(1-t)**3;
      ctx.save();ctx.globalAlpha=1-t;ctx.translate(f.x+(280-f.x)*ease,f.y+(440-f.y)*ease);
      const size=76*(1-t*.55);ctx.drawImage(sprites[f.type],-size/2,-size/2,size,size);ctx.restore();
      if(t>=1) flying.splice(i,1);
    }
  }
  function burst(x=280,y=240) {
    if(prefs.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for(let i=0;i<22;i++) particles.push({x,y,vx:(Math.random()-.5)*7,vy:-Math.random()*5-1,life:35,color:['#8aaf78','#e4b87b','#d99c8c','#a3b9b5'][i%4]});
  }
  function animate(now) {
    const delta=Math.min(1,(now-lastTick)/1000);lastTick=now;
    if(!document.hidden&&!modal.open) {
      if(state.status==='playing') { state.elapsed+=delta;activeTime+=delta; }
      if(physicsActive>0) { stepPhysics();physicsActive--; }
    }
    renderCanvas(now);
    $('timer').textContent=timeText(state.elapsed);
    if(activeTime-lastSave>5) { save();lastSave=activeTime; }
    requestAnimationFrame(animate);
  }
  function renderCollection() {
    $('total-wins').innerHTML=`${stats.wins}<span> 只</span>`;
    $('win-streak').innerHTML=`${stats.streak}<span> 局</span>`;
    $('collection-count').textContent=`${Math.min(6,stats.wins)} / 6`;
    $('goose-collection').innerHTML=colors.map((color,i)=>`<button class="collection-item ${stats.wins>i?'unlocked':''}" data-goose="${i}" title="${stats.wins>i?gooseNames[i]:`累计获胜 ${i+1} 局解锁`}" aria-label="${gooseNames[i]}，${stats.wins>i?'已解锁':`累计获胜 ${i+1} 局解锁`}"><img src="${A.uri(A.goose(color,i%2===0))}" alt="">${stats.wins>i?'':'<i data-lucide="lock-keyhole"></i>'}</button>`).join('');
  }
  function render() {
    $('scene-title').innerHTML=`${C.THEMES[state.theme].name}<span>${String(Object.keys(C.THEMES).indexOf(state.theme)+1).padStart(2,'0')}</span>`;
    $('level-badge').textContent=C.MODES[state.mode].badge;
    $('remaining').textContent=state.total-state.matched;
    const progress=Math.round(state.matched/state.total*100);
    $('progress-fill').style.width=progress+'%';$('progress-text').textContent=progress+'%';
    $('tray-count').textContent=`${state.tray.length} / 7`;
    $('tray').classList.toggle('danger',state.tray.length>=5);
    $('tray').innerHTML=Array.from({length:7},(_,i)=>`<div class="slot" aria-label="${state.tray[i]?A.items[state.tray[i].type].name:'空格'}">${state.tray[i]?`<img src="${A.uri(A.items[state.tray[i].type].svg)}" alt="${A.items[state.tray[i].type].name}">`:`<span>${i+1}</span>`}</div>`).join('');
    $('reserve-row').hidden=!state.reserve.length;
    $('reserve').innerHTML=state.reserve.map(item=>`<button data-reserve="${item.id}" title="取回${A.items[item.type].name}" aria-label="取回${A.items[item.type].name}"><img src="${A.uri(A.items[item.type].svg)}" alt=""></button>`).join('');
    const counts={};[...state.board,...state.tray,...state.reserve].forEach(x=>counts[x.type]=(counts[x.type]||0)+1);
    $('inventory').innerHTML=C.THEMES[state.theme].order.slice(0,C.MODES[state.mode].kinds).map(type=>`<div class="inventory-item ${counts[type]?'':'empty'}"><div><img src="${A.uri(A.items[type].svg)}" alt=""><strong>${counts[type]||0}</strong></div><span>${A.items[type].name}</span></div>`).join('');
    document.querySelectorAll('[data-mode]').forEach(el=>{const active=el.dataset.mode===state.mode;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-theme]').forEach(el=>{const active=el.dataset.theme===state.theme;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));});
    $('undo-btn').disabled=!state.history.length||state.status==='won';
    $('stash-btn').disabled=!state.tray.length||state.reserve.length>=3||state.status!=='playing';
    $('shake-btn').disabled=!state.board.length||state.status!=='playing';
    $('hint-btn').disabled=state.status!=='playing';
    $('best-time').textContent=stats.best[state.mode]===undefined?'等你来创造':timeText(stats.best[state.mode]);
    renderCollection();icons();
  }
  function showModal(title,body,actions,art=false) {
    $('modal-title').textContent=title;$('modal-body').innerHTML=body;
    $('modal-art').innerHTML=art?`<img src="${A.uri(A.goose())}" alt="田园小白">`:'';
    $('modal-actions').replaceChildren();
    actions.forEach(({label,run,secondary})=>{
      const btn=document.createElement('button');btn.textContent=label;
      btn.className=secondary?'secondary-button':'primary-button';
      btn.addEventListener('click',run);$('modal-actions').append(btn);
    });
    if(!modal.open) modal.showModal();
    icons();
  }
  function closeModal() { modal.close();lastTick=performance.now(); }
  function startRound(mode=state.mode,theme=state.theme) {
    closeModal();
    if(state.status==='playing'&&state.moves>0) stats.streak=0;
    const seed=window.crypto?.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]:Date.now();
    state=C.newGame(mode,theme,seed);highlighted=null;hintUntil=0;hovered=null;
    reconcile(true);
    for(let i=0;i<60;i++) stepPhysics();
    render();save();
  }
  function requestRound(mode=state.mode,theme=state.theme) {
    if(state.moves===0 || state.status!=='playing') return startRound(mode,theme);
    showModal('换一锅新鲜的？','<p>当前这一锅会重新开始，已收集的鹅友和历史纪录会保留。</p>',[
      {label:'继续这锅',run:closeModal,secondary:true},
      {label:'开新一锅',run:()=>startRound(mode,theme)}
    ]);
  }
  function showLost() {
    lostDialogPending=false;
    if(state.status!=='lost') return;
    showModal('篮子装满啦','<p>就差一点点。撤回一步，还能继续这一锅。</p>',[
      {label:'重新开锅',run:()=>startRound(),secondary:true},
      {label:'免费撤回继续',run:()=>{closeModal();undo();}}
    ],true);
  }
  function showWon() {
    const unlocked=Math.min(5,Math.max(0,stats.wins-1));
    showModal('大鹅，抓到啦！',`<p>${stats.wins<=6?`${gooseNames[unlocked]}加入了你的鹅友小队。`:'又是满载而归的一天。'}</p><div class="modal-stat"><div><strong>${timeText(state.elapsed)}</strong><span>本局用时</span></div><div><strong>${state.moves}</strong><span>收获次数</span></div></div>`,[
      {label:'看看鹅友',secondary:true,run:()=>showGoose(unlocked)},
      {label:'再抓一只',run:()=>startRound()}
    ],true);
    $('modal-art').innerHTML=`<img src="${A.uri(A.goose(colors[unlocked],unlocked%2===0))}" alt="${gooseNames[unlocked]}">`;
  }
  function pick(id,source='board') {
    if(modal.open) return;
    syncPositions();
    const body=bodies.get(id);
    const result=C.pick(state,id,source);
    if(!result.ok) return;
    if(body && !prefs.reduced) flying.push({type:result.item.type,x:body.position.x,y:body.position.y,start:performance.now()});
    reconcile();hovered=null;
    if(result.cleared) {
      sound('match');burst(body?.position.x,body?.position.y);
      $('combo').textContent=result.item.type==='goose'?'鹅鹅鹅，收好！':['好事成三！','收获小快乐','这一手，漂亮'][Math.floor(Math.random()*3)];
      $('combo').classList.remove('show');void $('combo').offsetWidth;$('combo').classList.add('show');
      clearTimeout(comboTimeout);comboTimeout=setTimeout(()=>$('combo').classList.remove('show'),1000);
    } else sound();
    if(state.status==='won') {
      stats.wins++;stats.streak++;
      stats.best[state.mode]=Math.min(stats.best[state.mode]??Infinity,state.elapsed);
      render();save();sound('win');showWon();return;
    }
    if(state.status==='lost') { stats.streak=0;lostDialogPending=true; }
    render();save();
    if(lostDialogPending) showLost();
  }
  function undo() {
    if(C.undo(state)) { reconcile(true);render();save();toast('已撤回上一步'); }
  }
  function shake() {
    if(state.status!=='playing') return;
    const now=performance.now();
    if(lastShake && now-lastShake<450) return;
    lastShake=now;
    const shuffled=C.shuffle([...bodies.values()],Math.random), layers=Math.ceil(state.total/24);
    shuffled.forEach((b,i)=>{
      b.plugin.layer=i%layers;b.collisionFilter.category=1<<b.plugin.layer;b.collisionFilter.mask=1<<b.plugin.layer;
      Matter.Sleeping.set(b,false);
      const angle=Math.random()*Math.PI*2;
      Matter.Body.setVelocity(b,{x:Math.cos(angle)*8,y:Math.sin(angle)*6});
      Matter.Body.setAngularVelocity(b,(Math.random()-.5)*.13);
    });
    physicsActive=130;sound('shake');save();
  }
  function hint() {
    const type=C.hint(state);
    if(!type) return;
    highlighted=type;hintUntil=performance.now()+6000;
    const targets=[...bodies.values()].filter(b=>b.plugin.type===type);
    for(const b of bodies.values()) {
      if(b.plugin.layer===5) {
        b.plugin.layer=b.plugin.itemId%Math.ceil(state.total/24);
        b.collisionFilter.category=1<<b.plugin.layer;b.collisionFilter.mask=1<<b.plugin.layer;
      }
    }
    // Bring one matching set to the top so the hint is usable even in a dense pile.
    targets.slice(0,3).forEach((b,i)=>{
      b.plugin.layer=5;b.collisionFilter.category=32;b.collisionFilter.mask=32;
      Matter.Body.setPosition(b,{x:210+i*70,y:210});
      Matter.Body.setVelocity(b,{x:0,y:0});Matter.Sleeping.set(b,false);
    });
    physicsActive=50;
    toast(`找到${A.items[type].name}了${state.reserve.some(x=>x.type===type)?'，寄存区也有哦':''}`);save();
  }
  function hit(x,y) {
    const sorted=order();
    for(let i=sorted.length-1;i>=0;i--) {
      const b=sorted[i];
      if(Math.hypot(x-b.position.x,y-b.position.y)<33) return b.plugin.itemId;
    }
    return null;
  }
  function point(event) {
    const rect=canvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*560/rect.width,y:(event.clientY-rect.top)*450/rect.height};
  }
  function showGoose(index) {
    const unlocked=stats.wins>index;
    showModal(gooseNames[index],`<p>${unlocked?'这位鹅友已经在你的农场安家啦。':`累计获胜 ${index+1} 局后，这位鹅友就会来报到。`}</p>`,[{label:'回到农场',run:closeModal}]);
    $('modal-art').innerHTML=`<img src="${A.uri(A.goose(colors[index],index%2===0))}" alt="${gooseNames[index]}">`;
  }
  function showSettings() {
    showModal('农场设置',`<label class="setting-row"><span>游戏音效</span><input id="setting-sound" type="checkbox" ${prefs.sound?'checked':''}></label><label class="setting-row"><span>减少动效</span><input id="setting-motion" type="checkbox" ${prefs.reduced?'checked':''}></label><label class="setting-row"><span>下一锅难度</span><select id="setting-mode">${Object.entries(C.MODES).map(([id,m])=>`<option value="${id}" ${state.mode===id?'selected':''}>${m.name}</option>`).join('')}</select></label>`,[
      {label:'完成',run:()=>{
        const mode=$('setting-mode').value;
        prefs.sound=$('setting-sound').checked;prefs.reduced=$('setting-motion').checked;
        renderSound();save();closeModal();if(mode!==state.mode) requestRound(mode);
      }}
    ]);
  }
  function showHelp() {
    showModal('一锅小小的快乐',`<div class="help-copy"><p><b>三个一样，收进篮子。</b><br>点选锅里露出的物品，三个相同物品会自动消除。</p><p><b>篮子只有七格。</b><br>清空所有物品就能抓到大鹅；装满也没关系，免费撤回即可继续。</p><p><b>道具随时用。</b><br>撤回上一步、寄存最多三件物品、颠锅、找出一组好物，全都不扣次数。寄存物品可以点回篮子。</p></div>`,[
      {label:'选择物品列表',secondary:true,run:showAccessible},
      {label:'知道啦',run:closeModal}
    ]);
  }
  function showAccessible() {
    const visible=order().filter(b=>hit(b.position.x,b.position.y)===b.plugin.itemId).reverse();
    showModal('可收获的好物',`<div class="accessibility-items">${visible.map(b=>`<button data-accessible="${b.plugin.itemId}">${A.items[b.plugin.type].name}</button>`).join('')}${state.reserve.map(x=>`<button data-accessible="${x.id}" data-source="reserve">${A.items[x.type].name} · 寄存</button>`).join('')}</div>`,[{label:'回到锅里',run:closeModal}]);
  }
  await Promise.all(Object.entries(A.items).map(([id,item])=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{sprites[id]=image;resolve();};image.onerror=()=>reject(new Error(`素材载入失败: ${id}`));image.src=A.uri(item.svg);
  })));
  $('brand-goose').src=A.uri(A.items.goose.svg);$('hero-goose').src=A.uri(A.goose());
  canvas.addEventListener('pointerdown',e=>{if(state.status!=='playing') return;pointerDown={...point(e),id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointerup',e=>{
    const p=point(e), down=pointerDown;pointerDown=null;
    if(down?.id===e.pointerId && Math.hypot(p.x-down.x,p.y-down.y)<15) { const id=hit(p.x,p.y);if(id!==null) pick(id); }
  });
  canvas.addEventListener('pointercancel',()=>{pointerDown=null;});
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse') { const p=point(e);hovered=hit(p.x,p.y);canvas.style.cursor=hovered===null?'default':'pointer'; }});
  canvas.addEventListener('pointerleave',()=>{hovered=null;});
  canvas.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' ') {e.preventDefault();showAccessible();}
  });
  $('reserve').addEventListener('click',e=>{const btn=e.target.closest('[data-reserve]');if(btn) pick(Number(btn.dataset.reserve),'reserve');});
  $('modal-body').addEventListener('click',e=>{
    const btn=e.target.closest('[data-accessible]');
    if(btn) {const id=Number(btn.dataset.accessible), source=btn.dataset.source||'board';closeModal();pick(id,source);if(state.status==='playing') showAccessible();}
  });
  $('restart-btn').addEventListener('click',()=>requestRound());
  document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();requestRound();});
  $('undo-btn').addEventListener('click',undo);
  $('stash-btn').addEventListener('click',()=>{syncPositions();if(C.stash(state)) {render();save();toast('已放入寄存区，随时可以取回');}});
  $('shake-btn').addEventListener('click',shake);$('hint-btn').addEventListener('click',hint);
  $('settings-btn').addEventListener('click',showSettings);$('mobile-difficulty').addEventListener('click',showSettings);
  $('help-btn').addEventListener('click',showHelp);
  $('sound-btn').addEventListener('click',()=>{prefs.sound=!prefs.sound;renderSound();save();if(prefs.sound) sound();});
  $('modal-close').addEventListener('click',closeModal);
  modal.addEventListener('close',()=>{lastTick=performance.now();});
  document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.mode!==state.mode) requestRound(btn.dataset.mode);}));
  document.querySelectorAll('[data-theme]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.theme!==state.theme) requestRound(state.mode,btn.dataset.theme);}));
  $('goose-collection').addEventListener('click',e=>{const btn=e.target.closest('[data-goose]');if(btn) showGoose(Number(btn.dataset.goose));});
  document.querySelector('.scene-tabs').addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    e.preventDefault();const tabs=[...document.querySelectorAll('[data-theme]')], i=tabs.indexOf(document.activeElement);
    const next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;tabs[next].focus();
  });
  document.addEventListener('visibilitychange',()=>{save();lastTick=performance.now();});
  window.addEventListener('pagehide',save);
  reconcile(true);for(let i=0;i<60;i++) stepPhysics();
  render();renderSound();save();lastTick=performance.now();requestAnimationFrame(animate);
  if(state.status==='lost') showLost();
  // Read-only test hooks are available only when explicitly requested in the URL.
  if(new URLSearchParams(location.search).has('test')) window.__goose={
    state:()=>JSON.parse(JSON.stringify(state)),
    bodies:()=>order().map(b=>({id:b.plugin.itemId,type:b.plugin.type,x:b.position.x,y:b.position.y,layer:b.plugin.layer})),
    hit, ready:true
  };
})().catch(error=>{
  console.error(error);
  const box=document.getElementById('toast');
  box.textContent='游戏加载失败，请刷新页面；请保留源码中的 vendor 和素材文件。';
  box.classList.add('visible');
});

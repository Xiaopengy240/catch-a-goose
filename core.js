(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GooseCore = api;
})(globalThis, function () {
  'use strict';
  const MODES = {
    easy: {name:'悠闲一锅', badge:'休闲局', kinds:6, groups:12},
    normal: {name:'有点上头', badge:'进阶局', kinds:9, groups:24},
    hard: {name:'大鹅挑战', badge:'挑战局', kinds:12, groups:36}
  };
  const THEMES = {
    farm: {name:'农场开锅啦', order:['goose','tomato','corn','egg','carrot','mushroom','radish','pumpkin','pear','strawberry','eggplant','bread']},
    garden: {name:'菜园大丰收', order:['goose','carrot','radish','pumpkin','eggplant','corn','tomato','mushroom','pear','egg','strawberry','bread']},
    orchard: {name:'果园甜蜜蜜', order:['goose','pear','strawberry','tomato','pumpkin','bread','corn','egg','mushroom','carrot','radish','eggplant']}
  };
  const ALL_TYPES = THEMES.farm.order;
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(array, rng) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [array[i],array[j]] = [array[j],array[i]];
    }
    return array;
  }
  function newGame(mode='easy', theme='farm', seed=Date.now()) {
    if (!MODES[mode] || !THEMES[theme]) throw new Error('Unknown mode or theme');
    const spec = MODES[mode], rng = random(seed);
    const types = THEMES[theme].order.slice(0,spec.kinds), board = [];
    for (let g=0; g<spec.groups; g++) {
      for (let n=0; n<3; n++) board.push({id:g*3+n, type:types[g%types.length]});
    }
    shuffle(board,rng);
    return {version:1,mode,theme,seed:seed>>>0,board,tray:[],reserve:[],total:board.length,matched:0,moves:0,elapsed:0,status:'playing',history:[]};
  }
  function snapshot(s) {
    return {board:s.board.map(x=>({...x})),tray:s.tray.map(x=>({...x})),reserve:s.reserve.map(x=>({...x})),matched:s.matched,moves:s.moves,status:s.status};
  }
  function remember(s) {
    s.history.push(snapshot(s));
    if(s.history.length>50) s.history.shift();
  }
  function pick(s,id,source='board') {
    if(s.status!=='playing' || !['board','reserve'].includes(source)) return {ok:false};
    const index=s[source].findIndex(x=>x.id===id);
    if(index<0 || s.tray.length>=7) return {ok:false};
    remember(s);
    const [item]=s[source].splice(index,1);
    const after=s.tray.findLastIndex(x=>x.type===item.type);
    s.tray.splice(after<0?s.tray.length:after+1,0,item);
    s.moves++;
    let cleared=0;
    if(s.tray.filter(x=>x.type===item.type).length===3) {
      s.tray=s.tray.filter(x=>x.type!==item.type);
      s.matched+=3; cleared=3;
    }
    if(s.board.length+s.tray.length+s.reserve.length===0) s.status='won';
    else if(s.tray.length===7) s.status='lost';
    return {ok:true,cleared,item};
  }
  function undo(s) {
    if(s.status==='won' || !s.history.length) return false;
    Object.assign(s,s.history.pop());
    return true;
  }
  function stash(s) {
    if(s.status!=='playing' || !s.tray.length || s.reserve.length>=3) return false;
    remember(s);
    s.reserve.push(...s.tray.splice(0,3-s.reserve.length));
    return true;
  }
  function hint(s) {
    if(s.status!=='playing') return null;
    const counts={};
    [...s.board,...s.reserve].forEach(x=>{counts[x.type]=(counts[x.type]||0)+1;});
    const choices=Object.keys(counts);
    choices.sort((a,b)=>s.tray.filter(x=>x.type===b).length-s.tray.filter(x=>x.type===a).length || counts[a]-counts[b]);
    return choices[0] || null;
  }
  function validate(s,withHistory=true) {
    if(!s || s.version!==1 || !Object.hasOwn(MODES,s.mode) || !Object.hasOwn(THEMES,s.theme)) return false;
    if(!['playing','lost','won'].includes(s.status) || s.total!==MODES[s.mode].groups*3) return false;
    if(!Number.isInteger(s.matched) || s.matched<0 || s.matched%3 || !Number.isInteger(s.moves) || s.moves<0 || !Number.isFinite(s.elapsed) || s.elapsed<0 || s.elapsed>31536000) return false;
    if(!Array.isArray(s.board) || !Array.isArray(s.tray) || !Array.isArray(s.reserve) || s.tray.length>7 || s.reserve.length>3) return false;
    const all=[...s.board,...s.tray,...s.reserve], counts={};
    if(all.length+s.matched!==s.total || new Set(all.map(x=>x?.id)).size!==all.length) return false;
    for(const item of all) {
      if(!item || !Number.isInteger(item.id) || item.id<0 || item.id>=s.total || !ALL_TYPES.includes(item.type)) return false;
      counts[item.type]=(counts[item.type]||0)+1;
    }
    if(Object.values(counts).some(n=>n%3)) return false;
    const trayCounts={};
    s.tray.forEach(x=>{trayCounts[x.type]=(trayCounts[x.type]||0)+1;});
    if(Object.values(trayCounts).some(n=>n>2)) return false;
    if(s.status==='won' && all.length!==0) return false;
    if(s.status==='playing' && (s.tray.length>=7 || all.length===0)) return false;
    if(s.status==='lost' && s.tray.length!==7) return false;
    if(withHistory && (!Array.isArray(s.history) || s.history.length>50 || s.history.some(h=>!validate({...s,...h,history:[]},false)))) return false;
    return true;
  }
  return {MODES,THEMES,newGame,random,shuffle,pick,undo,stash,hint,validate};
});

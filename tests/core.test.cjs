const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
const copy=x=>JSON.parse(JSON.stringify(x));
function ids(s,type,source='board'){return s[source].filter(x=>x.type===type).map(x=>x.id);}

test('every theme and difficulty creates complete triples for 100 seeds',()=>{
  for(const mode of Object.keys(C.MODES)) for(const theme of Object.keys(C.THEMES)) for(let seed=0;seed<100;seed++){
    const s=C.newGame(mode,theme,seed), counts={};
    assert.equal(s.board.length,C.MODES[mode].groups*3);
    s.board.forEach(x=>counts[x.type]=(counts[x.type]||0)+1);
    assert.equal(Object.keys(counts).length,C.MODES[mode].kinds);
    assert(Object.values(counts).every(n=>n%3===0));
    assert(C.validate(s));
  }
});
test('seeded generation is reproducible',()=>{
  assert.deepEqual(C.newGame('normal','farm',34),C.newGame('normal','farm',34));
  assert.notDeepEqual(C.newGame('normal','farm',34).board,C.newGame('normal','farm',35).board);
});
test('three of a kind match and undo restores the exact previous state',()=>{
  const s=C.newGame(), selected=ids(s,'goose');
  C.pick(s,selected[0]);C.pick(s,selected[1]);
  const before=copy(s);
  const result=C.pick(s,selected[2]);
  assert.equal(result.cleared,3);assert.equal(s.tray.length,0);assert.equal(s.matched,3);
  assert(C.undo(s));assert.deepEqual(s,before);assert(C.validate(s));
});
test('matching on the seventh slot clears before checking loss',()=>{
  const s=C.newGame('normal');
  for(const type of ['goose','goose','tomato','corn','egg','carrot']) C.pick(s,ids(s,type)[0]);
  assert.equal(s.tray.length,6);
  C.pick(s,ids(s,'goose')[0]);
  assert.equal(s.status,'playing');assert.equal(s.tray.length,4);assert.equal(s.matched,3);
});
test('seven unmatched objects lose; undo allows continuing',()=>{
  const s=C.newGame('normal');
  for(const type of C.THEMES.farm.order.slice(0,7)) C.pick(s,ids(s,type)[0]);
  assert.equal(s.status,'lost');assert(C.validate(s));
  assert.equal(C.pick(s,s.board[0].id).ok,false);
  assert(C.undo(s));assert.equal(s.status,'playing');assert.equal(s.tray.length,6);
});
test('stash is bounded, reversible, and its objects can match back in the tray',()=>{
  const s=C.newGame();
  const selected=ids(s,'goose');
  C.pick(s,selected[0]);C.pick(s,selected[1]);
  const before=copy(s);assert(C.stash(s));assert.equal(s.reserve.length,2);
  assert(C.undo(s));assert.deepEqual(s,before);C.stash(s);
  C.pick(s,selected[2]);C.pick(s,selected[0],'reserve');
  const result=C.pick(s,selected[1],'reserve');
  assert.equal(result.cleared,3);assert.equal(s.reserve.length,0);assert(C.validate(s));
  for(const type of ['tomato','corn','egg']) C.pick(s,ids(s,type)[0]);
  C.stash(s);C.pick(s,ids(s,'carrot')[0]);
  assert.equal(C.stash(s),false);assert.equal(s.reserve.length,3);
});
test('all modes can be completed, and win cannot be undone or picked again',()=>{
  for(const mode of Object.keys(C.MODES)){
    const s=C.newGame(mode);
    for(const type of C.THEMES.farm.order) for(const id of ids(s,type)) C.pick(s,id);
    assert.equal(s.status,'won');assert.equal(s.matched,s.total);assert(C.validate(s));
    assert.equal(C.undo(s),false);assert.equal(C.pick(s,0).ok,false);
  }
});
test('hint prefers the pair in the tray, including a target in reserve',()=>{
  const s=C.newGame();C.pick(s,ids(s,'tomato')[0]);C.pick(s,ids(s,'goose')[0]);C.pick(s,ids(s,'goose')[0]);
  assert.equal(C.hint(s),'goose');
});
test('invalid saved data is rejected, including invalid undo history',()=>{
  const s=C.newGame();
  for(const corrupt of [null,{},[],{...s,mode:'__proto__'},{...s,matched:2},{...s,elapsed:-1},{...s,elapsed:Infinity},{...s,total:99},{...s,board:[s.board[0],...s.board.slice(1,-1)]},{...s,history:[{board:null}]}])
    assert.equal(C.validate(corrupt),false);
});
test('5000 random actions preserve counts, capacity, and a valid save',()=>{
  let s=C.newGame('hard','garden',20);
  const rng=C.random(22);
  for(let i=0;i<5000;i++){
    if(s.status==='won') s=C.newGame('hard','garden',i);
    else if(s.status==='lost') C.undo(s);
    else if(rng()<.15) C.undo(s);
    else if(rng()<.15) C.stash(s);
    else {
      const source=s.reserve.length&&rng()<.3?'reserve':'board';
      if(s[source].length) C.pick(s,s[source][Math.floor(rng()*s[source].length)].id,source);
    }
    assert(C.validate(s),`Invalid at action ${i}`);
  }
});
test('all eight themes have twelve valid types and can finish in every mode',()=>{
  assert.equal(Object.keys(C.THEMES).length,8);
  for(const [theme,spec] of Object.entries(C.THEMES)){
    assert.equal(spec.order.length,12);assert.equal(new Set(spec.order).size,12);
    for(const mode of Object.keys(C.MODES)){
      const s=C.newGame(mode,theme,204);
      for(const type of spec.order)for(const id of ids(s,type))C.pick(s,id);
      assert.equal(s.status,'won',`${theme}/${mode}`);assert(C.validate(s));
    }
  }
});
test('version-one orchard progress remains valid after its catalogue changes',()=>{
  const s=C.newGame('easy','farm',62);s.theme='orchard';
  const oldTypes=['goose','pear','strawberry','tomato','pumpkin','bread'];
  s.board=oldTypes.flatMap((type,i)=>Array.from({length:6},(_,j)=>({id:i*6+j,type})));
  C.pick(s,0);C.pick(s,1);
  assert(C.validate(s));const restored=copy(s);assert(C.validate(restored));assert.equal(restored.tray.length,2);
  C.pick(restored,2);assert.equal(restored.matched,3);assert(C.undo(restored));assert.equal(restored.tray.length,2);
});

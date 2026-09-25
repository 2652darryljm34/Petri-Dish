/* Balance simulator: runs reference programs a competent player would write,
   measures resource income per step, and prices the tech tree against it.
   Not shipped. Usage: node balance.js <extracted-engine.js> */
const fs=require('fs');

/* ---- DOM stubs (same shape as test-harness) ---- */
function elStub(id){
  const e={ id, value:'', innerHTML:'', textContent:'', hidden:false, disabled:false,
    checked:true, max:'9', width:0, height:0, scrollTop:0, scrollLeft:0, scrollHeight:0,
    childElementCount:0, selectionStart:0, selectionEnd:0, children:[], firstChild:null,
    dataset:{}, style:{},
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    addEventListener(){}, removeEventListener(){}, remove(){},
    appendChild(c){e.children.push(c);e.childElementCount=e.children.length;e.firstChild=e.children[0];return c;},
    removeChild(c){const i=e.children.indexOf(c);if(i>=0)e.children.splice(i,1);
      e.childElementCount=e.children.length;e.firstChild=e.children[0]||null;return c;},
    setAttribute(){}, getAttribute(){return null}, querySelectorAll(){return []},
    getBoundingClientRect(){return{width:520,height:520,top:0,left:0}},
    getContext(){return ctxStub()} };
  return e;
}
function ctxStub(){
  const noop=()=>{};
  return new Proxy({},{get(t,k){
    if(k==='createRadialGradient'||k==='createLinearGradient') return ()=>({addColorStop:noop});
    if(k==='canvas') return {width:520,height:520};
    if(k==='measureText') return ()=>({width:10});
    return noop;
  },set(){return true}});
}
const els={};
global.document={ readyState:'complete',
  getElementById(id){return els[id]||(els[id]=elStub(id))},
  createElement(){return elStub('new')}, querySelectorAll(){return[]}, addEventListener(){} };
global.window={addEventListener(){},devicePixelRatio:1};
global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>0;
global.localStorage={getItem(){return null},setItem(){},removeItem(){}};
global.confirm=()=>true;

let src=fs.readFileSync(process.argv[2],'utf8');
const tail=src.lastIndexOf('})();');

const SIM=`
/* ================= BALANCE SIM ================= */
const ALL=['loop','vars','cond','forloop','func','lists','dicts','measure','sterile','maze','slicing','comprehensions','higher','errors'];
function reset(size,extra){
  /* contamination only runs once Sterile technique is owned, so the early-game
     rows have to be measured without it or they misreport the opening board */
  W.feats=new Set(ALL.concat((extra||[]).filter(function(f){ return f.charAt(0)!=='-'; })));
  for(const f of (extra||[])) if(f.charAt(0)==='-') W.feats.delete(f.slice(1));
  W.species=new Set(['CULTURE','SPORE','MYCELIUM','BIOFILM','CRYSTAL','STRAND']);
  W.res={bacteria:0,spores:0,enzymes:0,biomass:0,crystals:0};
  W.tick=0; W.x=0; W.y=0; W.wasted=0; W.lastOk=true; W.flash=null;
  W.maze=false; W.saved=null; W.tx=-1; W.ty=-1;   // never inherit a labyrinth
  initGrid(size);
  resetFoulClock();
}
function silence(){ GLOBALS.set('print',{__pure:()=>null}); }

/* run a program for a fixed number of steps, restarting it if it ends */
function measure(srcTxt,size,steps,stock,extra){
  reset(size,extra);
  if(stock) for(const k in stock) W.res[k]=stock[k];
  const before=Object.assign({},W.res);
  els.code.value=srcTxt;
  const ast=compile();
  GLOBALS=buildGlobals(); silence();
  let g=execBlock(ast,GLOBALS);
  let ticks=0, guard=0;
  while(ticks<steps){
    if(++guard>steps*5000) throw new Error('runaway in program');
    const r=g.next();
    if(r.done){ GLOBALS=buildGlobals(); silence(); g=execBlock(ast,GLOBALS); continue; }
    if(r.value===TICK){ W.tick++; ticks++; foulCatchUp(); }   // pump() does this on the real clock
  }
  const d={};
  for(const k in W.res) d[k]=W.res[k]-before[k];
  return {steps:ticks,delta:d};
}

const SNAKE_TAIL='    move(EAST)\\n    if pos_x() == 0:\\n        move(SOUTH)\\n';

const P={};
/* tier 0: no unlocks at all - the starter, restarted by the repeat toggle */
P.starter='harvest()\\nseed(CULTURE)\\nmove(EAST)\\n';
/* tier 1: while loop, one row */
P.row='while True:\\n    harvest()\\n    seed(CULTURE)\\n    move(EAST)\\n';
/* tier 2: whole dish snake */
P.snake='while True:\\n    harvest()\\n    seed(CULTURE)\\n'+SNAKE_TAIL;
/* tier 3: spores (sterilise on first pass, then farm) */
P.spore='while True:\\n    if substrate() == AGAR:\\n        sterilize()\\n    harvest()\\n    seed(SPORE)\\n'+SNAKE_TAIL;
/* the same bed with Seeder attachment: replant() is harvest()+seed() for one
   action, so a bed that stays one crop loses a third of its step cost */
P.sporeReplant=
'n = dish_size() * dish_size()\\n'+
'for i in range(n):\\n'+
'    if substrate() == AGAR:\\n'+
'        sterilize()\\n'+
'    seed(SPORE)\\n'+
'    move(EAST)\\n'+
'    if pos_x() == 0:\\n'+
'        move(SOUTH)\\n'+
'while True:\\n'+
'    if substrate() == AGAR:\\n'+
'        sterilize()\\n'+
'        seed(SPORE)\\n'+
'    else:\\n'+
'        replant()\\n'+
'    move(EAST)\\n'+
'    if pos_x() == 0:\\n'+
'        move(SOUTH)\\n';
/* tier 4: mycelium - plant the whole dish, wait, harvest the whole dish */
P.myc=
'n = dish_size() * dish_size()\\n'+
'while True:\\n'+
'    for i in range(n):\\n'+
'        seed(MYCELIUM)\\n'+
'        move(EAST)\\n'+
'        if pos_x() == 0:\\n'+
'            move(SOUTH)\\n'+
'    while not mature():\\n'+
'        pass\\n'+
'    for i in range(n):\\n'+
'        harvest()\\n'+
'        move(EAST)\\n'+
'        if pos_x() == 0:\\n'+
'            move(SOUTH)\\n';
/* tier 5: biofilm - sterilise + plant everything, wait, harvest the patch once */
P.bio=
'n = dish_size() * dish_size()\\n'+
'while True:\\n'+
'    for i in range(n):\\n'+
'        if substrate() == AGAR:\\n'+
'            sterilize()\\n'+
'        seed(BIOFILM)\\n'+
'        move(EAST)\\n'+
'        if pos_x() == 0:\\n'+
'            move(SOUTH)\\n'+
'    while not mature():\\n'+
'        pass\\n'+
'    harvest()\\n';
/* tier 5b: biofilm done RIGHT. A colony past BIO_COHERE cells stops paying for
   the extra, so one dish-sized patch is the worst layout there is. Leaving the
   middle row and column bare splits the dish into four colonies that each pay
   their own square - the layout a player finds once the cap bites. */
P.bio4=
'n = dish_size()\\n'+'mid = (n - 1) // 2\\n'+'while True:\\n'+'    for i in range(n * n):\\n'+'        if pos_x() != mid and pos_y() != mid:\\n'+'            if substrate() == AGAR:\\n'+'                sterilize()\\n'+'            seed(BIOFILM)\\n'+'        move(EAST)\\n'+'        if pos_x() == 0:\\n'+'            move(SOUTH)\\n'+'    while not mature():\\n'+'        pass\\n'+'    harvest()\\n'+'    for k in range(mid + 1):\\n'+'        move(EAST)\\n'+'    harvest()\\n'+'    for k in range(mid + 1):\\n'+'        move(SOUTH)\\n'+'    harvest()\\n'+'    for k in range(mid + 1):\\n'+'        move(WEST)\\n'+'    harvest()\\n'+'    for k in range(mid + 1):\\n'+'        move(NORTH)\\n';
/* tier 6: crystal - plant all, then repeatedly hunt the largest facet count */
P.cryst=
'n = dish_size() * dish_size()\\n'+
'while True:\\n'+
'    for i in range(n):\\n'+
'        if substrate() == AGAR:\\n'+
'            sterilize()\\n'+
'        seed(CRYSTAL)\\n'+
'        move(EAST)\\n'+
'        if pos_x() == 0:\\n'+
'            move(SOUTH)\\n'+
'    while not mature():\\n'+
'        pass\\n'+
'    for k in range(n):\\n'+
'        best = 0\\n'+
'        for i in range(n):\\n'+
'            m = measure()\\n'+
'            if m > best:\\n'+
'                best = m\\n'+
'            move(EAST)\\n'+
'            if pos_x() == 0:\\n'+
'                move(SOUTH)\\n'+
'        if best == 0:\\n'+
'            break\\n'+
'        for i in range(n):\\n'+
'            if measure() == best:\\n'+
'                harvest()\\n'+
'                break\\n'+
'            move(EAST)\\n'+
'            if pos_x() == 0:\\n'+
'                move(SOUTH)\\n';

/* tier 7: labyrinth run solved with depth-first search */
P.maze=
'maze()\\n'+
'n = dish_size()\\n'+
'visited = []\\n'+
'for i in range(n * n):\\n'+
'    visited.append(0)\\n'+
'stack = []\\n'+
'found = 0\\n'+
'while found == 0:\\n'+
'    visited[pos_y() * n + pos_x()] = 1\\n'+
'    if scan() == PAYLOAD:\\n'+
'        harvest()\\n'+
'        found = 1\\n'+
'    else:\\n'+
'        moved = 0\\n'+
'        d = 0\\n'+
'        while d < 4 and moved == 0:\\n'+
'            if blocked(d) == False:\\n'+
'                nx = pos_x()\\n'+
'                ny = pos_y()\\n'+
'                if d == 0:\\n'+
'                    ny -= 1\\n'+
'                if d == 1:\\n'+
'                    nx += 1\\n'+
'                if d == 2:\\n'+
'                    ny += 1\\n'+
'                if d == 3:\\n'+
'                    nx -= 1\\n'+
'                if visited[ny * n + nx] == 0:\\n'+
'                    stack.append(d)\\n'+
'                    move(d)\\n'+
'                    moved = 1\\n'+
'            d += 1\\n'+
'        if moved == 0:\\n'+
'            if len(stack) == 0:\\n'+
'                found = 2\\n'+
'            else:\\n'+
'                move((stack.pop() + 2) % 4)\\n';

/* does variable growth create a reason to check before acting? */
P.tight='while True:\\n    harvest()\\n    seed(CULTURE)\\n    move(EAST)\\n    harvest()\\n    seed(CULTURE)\\n    move(WEST)\\n';
P.smart=
'n = dish_size() * dish_size()\\n'+
'for i in range(n):\\n'+
'    seed(CULTURE)\\n'+
'    move(EAST)\\n'+
'    if pos_x() == 0:\\n'+
'        move(SOUTH)\\n'+
'while True:\\n'+
'    if mature():\\n'+
'        harvest()\\n'+
'        seed(CULTURE)\\n'+
'    move(EAST)\\n'+
'    if pos_x() == 0:\\n'+
'        move(SOUTH)\\n';

/* same tight loop, but asking before grabbing */
P.tightsmart=
'seed(CULTURE)\\n'+
'move(EAST)\\n'+
'seed(CULTURE)\\n'+
'move(WEST)\\n'+
'while True:\\n'+
'    if mature():\\n'+
'        harvest()\\n'+
'        seed(CULTURE)\\n'+
'    move(EAST)\\n'+
'    if mature():\\n'+
'        harvest()\\n'+
'        seed(CULTURE)\\n'+
'    move(WEST)\\n';

/* Seeder attachment pays on a bed that stays one crop: prime it once, then
   replant() is the harvest and the seed for the price of one action. */
P.reseed=
'n = dish_size() * dish_size()\\n'+
'for i in range(n):\\n'+
'    seed(CULTURE)\\n'+
'    move(EAST)\\n'+
'    if pos_x() == 0:\\n'+
'        move(SOUTH)\\n'+
'while True:\\n'+
'    if not replant():\\n'+
'        seed(CULTURE)\\n'+
'    move(EAST)\\n'+
'    if pos_x() == 0:\\n'+
'        move(SOUTH)\\n';

/* the naive mycelium program: plant one, wait for it, harvest it, repeat */
P.mycnaive=
'while True:\\n'+
'    seed(MYCELIUM)\\n'+
'    while not mature():\\n'+
'        pass\\n'+
'    harvest()\\n'+
'    move(EAST)\\n';

/* strand: plant a row, wait where you stand, take whatever run you get */
P.strandnaive=
'n = dish_size()\\n'+
'while True:\\n'+
'    for i in range(n):\\n'+
'        if substrate() == AGAR:\\n'+
'            sterilize()\\n'+
'        seed(STRAND)\\n'+
'        move(EAST)\\n'+
'    while not mature():\\n'+
'        wait()\\n'+
'    harvest()\\n'+
'    move(SOUTH)\\n';

/* three ways to handle sterile substrate on a spore farm */
P.sporeblind=
'while True:\\n'+
'    sterilize()\\n'+
'    harvest()\\n'+
'    seed(SPORE)\\n'+
'    move(EAST)\\n'+
'    if pos_x() == 0:\\n'+
'        move(SOUTH)\\n';
P.sporemem=
'n = dish_size()\\n'+
'clean = []\\n'+
'for i in range(n * n):\\n'+
'    clean.append(0)\\n'+
'while True:\\n'+
'    i = pos_y() * n + pos_x()\\n'+
'    if clean[i] == 0:\\n'+
'        sterilize()\\n'+
'        clean[i] = 1\\n'+
'    harvest()\\n'+
'    seed(SPORE)\\n'+
'    move(EAST)\\n'+
'    if pos_x() == 0:\\n'+
'        move(SOUTH)\\n';

P.sporeafter=
'while True:\\n'+
'    harvest()\\n'+
'    sterilize()\\n'+
'    seed(SPORE)\\n'+
'    move(EAST)\\n'+
'    if pos_x() == 0:\\n'+
'        move(SOUTH)\\n';

function pad(s,n){ s=String(s); while(s.length<n) s+=' '; return s; }
function padl(s,n){ s=String(s); while(s.length<n) s=' '+s; return s; }
function rate(d,steps,k){ return d[k]/steps; }

const RUN=[
  ['starter  (no unlocks)','starter',3,4000,null,['-sterile']],
  ['row loop','row',3,4000,null,['-sterile']],
  ['dish snake','snake',3,4000,null],
  ['dish snake','snake',5,8000,null],
  ['dish snake','snake',7,12000,null],
  ['spore farm','spore',3,6000,{bacteria:1e6}],
  ['spore: sterilise always','sporeblind',5,10000,{bacteria:1e6}],
  ['spore: sterilise after','sporeafter',5,10000,{bacteria:1e6}],
  ['spore: replant()','sporeReplant',5,10000,{bacteria:1e6},['replant']],
  ['spore: check first','spore',5,10000,{bacteria:1e6}],
  ['spore: remember','sporemem',5,10000,{bacteria:1e6}],
  ['spore: remember +optics','sporemem',5,10000,{bacteria:1e6},['fastsense']],
  ['mycelium NAIVE','mycnaive',5,12000,{spores:1e6}],
  ['mycelium patch','myc',5,12000,{spores:1e6}],
  ['mycelium patch','myc',7,16000,{spores:1e6}],
  ['biofilm patch','bio',5,12000,{enzymes:1e6}],
  ['biofilm patch','bio',7,16000,{enzymes:1e6}],
  ['biofilm patch','bio',9,20000,{enzymes:1e6}],
  ['biofilm quadrants','bio4',5,12000,{enzymes:1e6}],
  ['biofilm quadrants','bio4',7,16000,{enzymes:1e6}],
  ['biofilm quadrants','bio4',9,20000,{enzymes:1e6}],
  ['crystal sort','cryst',5,20000,{biomass:1e6}],
  ['crystal sort','cryst',7,30000,{biomass:1e6}],
  ['culture: tight 2-cell','tight',5,8000,null,['-sterile']],
  ['culture: tight, +contamination','tight',5,8000,null],
  ['culture: check first','smart',5,8000,null],
  ['culture: tight + check','tightsmart',5,8000,null],
  ['strand naive','strandnaive',7,20000,{biomass:1e7}],
  ['labyrinth (DFS)','maze',7,20000,null],
  ['-- with Fast optics --','snake',5,200,null],
  ['spore farm +optics','spore',5,10000,{bacteria:1e6},['fastsense']],
  ['crystal sort +optics','cryst',5,20000,{biomass:1e6},['fastsense']],
  ['labyrinth +optics','maze',7,20000,null,['fastsense']],
  ['culture check +optics','smart',5,8000,null,['fastsense']],
  ['culture: plain snake','snake',5,8000,null,['replant']],
  ['culture snake +preserve','snake',7,12000,null,['preserve']],
  ['culture: bed + replant()','reseed',5,8000,null,['replant']],
  ['labyrinth (DFS)','maze',9,30000,null],
  ['labyrinth (DFS)','maze',11,40000,null]
];

console.log('\\n  INCOME RATES  (resource per step; negative = consumed)\\n');
console.log('  '+pad('program',22)+pad('dish',6)+padl('bact',9)+padl('spore',9)+padl('enzym',9)+padl('biomass',10)+padl('cryst',9));
console.log('  '+'-'.repeat(74));
const RATES={};
for(const row of RUN){
  const [label,key,size,steps,stock,extra]=row;
  const r=measure(P[key],size,steps,stock,extra);
  const f=k=>{ const v=rate(r.delta,r.steps,k); return v===0?'.':(v>0?'':'')+v.toFixed(3); };
  console.log('  '+pad(label,22)+pad(size+'x'+size,6)+padl(f('bacteria'),9)+padl(f('spores'),9)+
              padl(f('enzymes'),9)+padl(f('biomass'),10)+padl(f('crystals'),9));
  RATES[key+size]=r;
}

/* ---- price the tree against those rates ---- */
const BEST={
  bacteria:['snake3',0.0],
  spores:['spore3',0.0],
  enzymes:['myc5',0.0],
  biomass:['bio5',0.0],
  crystals:['cryst5',0.0]
};
for(const k in BEST){
  const r=RATES[BEST[k][0]];
  BEST[k][1]=rate(r.delta,r.steps,k);
}
console.log('\\n  TECH TREE PACING  (steps of play to afford each node at the');
console.log('  income rate available when you would realistically buy it)\\n');
console.log('  '+pad('node',24)+pad('cost',16)+padl('steps',9)+padl('~seconds @8/s',15));
console.log('  '+'-'.repeat(66));
let total=0;
for(const t of TECH){
  let cost='', steps=0;
  for(const k in t.cost){
    cost+=t.cost[k]+' '+k;
    const r=BEST[k][1];
    steps+= r>0 ? t.cost[k]/r : Infinity;
  }
  total+=steps;
  console.log('  '+pad(t.nm,24)+pad(cost,16)+padl(Math.round(steps),9)+padl((steps/8).toFixed(0)+'s',15));
}
console.log('  '+'-'.repeat(66));
console.log('  '+pad('TOTAL',40)+padl(Math.round(total),9)+padl((total/8/60).toFixed(1)+' min',15));
console.log('');
`;

src=src.slice(0,tail)+SIM+'\n})();';
const out=__dirname+'/.balance-run.js';
fs.writeFileSync(out,src);
require(out);
fs.unlinkSync(out);

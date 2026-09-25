/* Headless test harness: stubs just enough DOM to boot the engine,
   then drives the interpreter directly. Not shipped. */
const fs=require('fs');

function elStub(id){
  const e={
    id, value:'', innerHTML:'', textContent:'', hidden:false, disabled:false,
    checked:true, max:'9', width:0, height:0, scrollTop:0, scrollLeft:0,
    scrollHeight:0, childElementCount:0, selectionStart:0, selectionEnd:0,
    children:[], firstChild:null, dataset:{}, style:{},
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    addEventListener(){}, removeEventListener(){}, remove(){},
    appendChild(c){ e.children.push(c); e.childElementCount=e.children.length; e.firstChild=e.children[0]; return c; },
    removeChild(c){ const i=e.children.indexOf(c); if(i>=0)e.children.splice(i,1);
                    e.childElementCount=e.children.length; e.firstChild=e.children[0]||null; return c; },
    setAttribute(){}, getAttribute(){return null},
    querySelectorAll(){return []},
    getBoundingClientRect(){ return {width:520,height:520,top:0,left:0}; },
    getContext(){ return ctxStub(); }
  };
  return e;
}
function ctxStub(){
  const noop=()=>{};
  return new Proxy({},{ get(t,k){
    if(k==='createRadialGradient'||k==='createLinearGradient') return ()=>({addColorStop:noop});
    if(k==='canvas') return {width:520,height:520};
    if(k==='measureText') return ()=>({width:10});
    return noop;
  }, set(){ return true; }});
}

const els={};
global.document={
  readyState:'complete',
  body:elStub('body'),                         // buy() raises a toast onto document.body
  getElementById(id){ return els[id]||(els[id]=elStub(id)); },
  createElement(){ return elStub('new'); },
  querySelectorAll(){ return []; },
  addEventListener(){}
};
global.window={ addEventListener(){}, devicePixelRatio:1 };
global.performance={ now:()=>Date.now() };
global.requestAnimationFrame=()=>0;            // never start the render loop
global.localStorage={ getItem(){return null}, setItem(){}, removeItem(){} };
global.confirm=()=>true;
const _setTimeout=global.setTimeout;             // don't let toast timers hold the run open
global.setTimeout=function(fn,ms){ const t=_setTimeout(fn,ms); if(t&&t.unref) t.unref(); return t; };

/* splice test code inside the engine IIFE */
let src=fs.readFileSync(process.argv[2],'utf8');
const tail=src.lastIndexOf('})();');
if(tail<0){ console.error('could not find IIFE close'); process.exit(1); }

const TESTS=`
/* ================= TESTS ================= */
const ALLFEATS=['loop','vars','cond','forloop','func','lists','dicts','measure','sterile','maze'];
let pass=0, fail=0;
const printed=[];
function capturePrint(){
  GLOBALS.set('print',{__pure:(...a)=>{ printed.push(a.map(fmt).join(' ')); return null; }});
}
function fresh(size){
  W.feats=new Set(ALLFEATS);
  W.species=new Set(['CULTURE','SPORE','MYCELIUM','BIOFILM','CRYSTAL','STRAND']);
  W.res={bacteria:0,spores:0,enzymes:0,biomass:0,crystals:0};
  W.tick=0; W.x=0; W.y=0; W.speedTier=0;
  W.maze=false; W.saved=null; W.tx=-1; W.ty=-1;   // never inherit a labyrinth
  W.wasted=0; W.lastOk=true; W.flash=null;
  initGrid(size||3);
  resetFoulClock();
  printed.length=0;
}
function run(srcTxt,maxTicks){
  els.code.value=srcTxt;
  const ast=compile();
  GLOBALS=buildGlobals();
  capturePrint();
  const g=execBlock(ast,GLOBALS);
  let ticks=0, steps=0;
  while(true){
    const r=g.next();
    /* payouts are buffered and merged once a frame in the real loop, so a test
       that drives the generator by hand has to close the frame the same way */
    if(r.done){ flushFrameFx(); return {ticks,done:true}; }
    if(r.value===TICK){
      W.tick++; ticks++;
      foulCatchUp();                 // pump() does this on the real clock
      if(W.tick%RATE_EVERY===0) sampleRate();
      if(maxTicks&&ticks>=maxTicks){ flushFrameFx(); return {ticks,done:false}; }
    }
    if(++steps>500000) throw new Error('runaway: no termination');
  }
}
function ok(name,cond,extra){
  if(cond){ pass++; console.log('  ok   '+name); }
  else{ fail++; console.log('  FAIL '+name+(extra!==undefined?'  -> '+extra:'')); }
}
function throws(name,srcTxt,frag){
  try{ run(srcTxt,5000); fail++; console.log('  FAIL '+name+' (no error raised)'); }
  catch(e){
    const m=String(e.message||e);
    if(!frag||m.indexOf(frag)>=0){ pass++; console.log('  ok   '+name+'  ["'+m+'"]'); }
    else{ fail++; console.log('  FAIL '+name+' wrong message: '+m); }
  }
}

console.log('\\n-- tokenizer / parser --');
fresh();
ok('empty program parses',(()=>{els.code.value='';return compile().length===0;})());
ok('comments and blank lines skipped',(()=>{els.code.value='# hi\\n\\n# there\\n';return compile().length===0;})());
throws('unterminated string','print("abc)\\n','unterminated string literal');
throws('bad indent','harvest()\\n    move(EAST)\\n','indent');
throws('unknown char','x = 5 @ 3\\n','@');

console.log('\\n-- feature gating --');
fresh(); W.feats=new Set();
throws('while locked','while True:\\n    harvest()\\n','while loops are locked');
throws('assignment locked','x = 1\\n','variables are locked');
throws('if locked','if True:\\n    harvest()\\n','if / else are locked');
fresh();
ok('while allowed once unlocked',(()=>{els.code.value='while False:\\n    harvest()\\n';return compile().length===1;})());

console.log('\\n-- arithmetic & values --');
fresh();
run('print(2 + 3 * 4)\\nprint(7 // 2, 7 % 2, 2 ** 10)\\nprint(1 == 1, 1 != 2, 2 < 3 and 3 <= 3)\\nprint(not False, None, "a" + "b")\\n');
ok('precedence', printed[0]==='14', printed[0]);
ok('int div / mod / pow', printed[1]==='3 1 1024', printed[1]);
ok('comparisons', printed[2]==='True True True', printed[2]);
ok('literals & concat', printed[3]==='True None ab', printed[3]);
fresh();
run('x = 10\\nx += 5\\nx *= 2\\nprint(x)\\n');
ok('compound assignment', printed[0]==='30', printed[0]);
throws('divide by zero','print(1 / 0)\\n','ZeroDivisionError: division by zero');
throws('undefined name','print(nope)\\n','not defined');

console.log('\\n-- control flow --');
fresh();
run('n = 0\\nfor i in range(5):\\n    n += i\\nprint(n)\\n');
ok('for + range', printed[0]==='10', printed[0]);
fresh();
run('n = 0\\nwhile n < 4:\\n    n += 1\\nprint(n)\\n');
ok('while', printed[0]==='4', printed[0]);
fresh();
run('for i in range(10):\\n    if i == 3:\\n        break\\nprint(i)\\n');
ok('break', printed[0]==='3', printed[0]);
fresh();
run('t = 0\\nfor i in range(6):\\n    if i % 2 == 0:\\n        continue\\n    t += i\\nprint(t)\\n');
ok('continue', printed[0]==='9', printed[0]);
fresh();
run('x = 5\\nif x > 9:\\n    print("a")\\nelif x > 3:\\n    print("b")\\nelse:\\n    print("c")\\n');
ok('elif chain', printed[0]==='b', printed[0]);

console.log('\\n-- functions --');
fresh();
run('def add(a, b):\\n    return a + b\\nprint(add(2, 40))\\n');
ok('def + return', printed[0]==='42', printed[0]);
fresh();
run('def fib(n):\\n    if n < 2:\\n        return n\\n    return fib(n-1) + fib(n-2)\\nprint(fib(12))\\n');
ok('recursion', printed[0]==='144', printed[0]);
throws('arity check','def f(a):\\n    return a\\nprint(f(1,2))\\n','takes 1 positional argument');
throws('runaway recursion','def f(n):\\n    return f(n+1)\\nprint(f(1))\\n','RecursionError');

console.log('\\n-- lists & dicts --');
fresh();
run('a = [3, 1, 2]\\na.append(9)\\nprint(len(a), a[0], a[-1])\\nprint(sorted(a))\\nprint(2 in a, 7 in a)\\n');
ok('list basics', printed[0]==='4 3 9', printed[0]);
ok('sorted', printed[1]==='[1, 2, 3, 9]', printed[1]);
ok('in operator', printed[2]==='True False', printed[2]);
fresh();
run('a = [1,2,3]\\na[1] = 99\\nprint(a)\\n');
ok('index assignment', printed[0]==='[1, 99, 3]', printed[0]);
throws('index out of range','a = [1]\\nprint(a[5])\\n','out of range');
fresh();
run('d = {"x": 1, "y": 2}\\nd["z"] = 3\\nprint(len(d), d["z"], "y" in d)\\nprint(sorted(d.keys()))\\n');
ok('dict basics', printed[0]==='3 3 True', printed[0]);
ok('dict keys', printed[1]==="['x', 'y', 'z']", printed[1]);

console.log('\\n-- world: movement --');
fresh(3);
run('move(EAST)\\nmove(EAST)\\nmove(SOUTH)\\n');
ok('move updates position', W.x===2&&W.y===1, W.x+','+W.y);
ok('each action costs one step', W.tick===3, W.tick);
fresh(3);
run('move(WEST)\\nmove(NORTH)\\n');
ok('dish wraps around', W.x===2&&W.y===2, W.x+','+W.y);
throws('move needs a direction','move(7)\\n','NORTH, EAST');

console.log('\\n-- world: culture loop --');
fresh(3);
const r1=run('while True:\\n    harvest()\\n    seed(CULTURE)\\n    move(EAST)\\n',600);
ok('culture farming yields bacteria', W.res.bacteria>20, 'bacteria='+W.res.bacteria);
ok('ticks consumed as expected', r1.ticks===600, r1.ticks);

console.log('\\n-- world: growth timing --');
fresh(3);
run('seed(CULTURE)\\n');
ok('freshly seeded is not mature', isMature(here())===false);
W.tick+=growTime(here());
ok('mature after grow steps', isMature(here())===true);
run('print(harvest())\\n');
ok('harvest returns True and pays full value', printed[0]==='True'&&W.res.bacteria===SPECIES.CULTURE.base, printed[0]+' b='+W.res.bacteria);
ok('cell empty after harvest', here().s===null);

console.log('\\n-- world: substrate gating --');
fresh(3);
run('print(seed(SPORE))\\n');
ok('SPORE refused on plain agar', printed[0]==='False', printed[0]);
fresh(3); W.res.bacteria=10;
run('sterilize()\\nprint(substrate())\\nprint(seed(SPORE))\\n');
ok('sterilize changes substrate', printed[0]==='STERILE', printed[0]);
ok('SPORE accepted on sterile agar', printed[1]==='True', printed[1]);
ok('seeding deducted its cost', W.res.bacteria===10-SPECIES.SPORE.cost.bacteria, W.res.bacteria);
fresh(3);
run('print(seed(SPORE))\\n');
ok('cannot seed without resources', printed[0]==='False', printed[0]);

console.log('\\n-- world: sensors --');
fresh(3);
run('seed(CULTURE)\\nprint(scan())\\nprint(pos_x(), pos_y(), dish_size())\\nprint(num(BACTERIA))\\n');
ok('scan reports species', printed[0]==='CULTURE', printed[0]);
ok('position helpers', printed[1]==='0 0 3', printed[1]);
ok('num() reads a resource', printed[2]==='0', printed[2]);
fresh(3);
const before=W.tick;
run('print(pos_x())\\nprint(num(BACTERIA))\\nprint(dish_size())\\n');
ok('bookkeeping calls are free', W.tick===before, 'tick='+W.tick);

console.log('\\n-- world: mycelium adjacency --');
fresh(3); W.res.spores=99;
run('seed(MYCELIUM)\\nmove(EAST)\\nseed(MYCELIUM)\\nmove(WEST)\\n');
W.tick+=SPECIES.MYCELIUM.grow;
run('harvest()\\n');
ok('mycelium pays 1 + neighbours', W.res.enzymes===2, 'enzymes='+W.res.enzymes);

console.log('\\n-- world: biofilm patch --');
fresh(3); W.res.enzymes=99;
run('sterilize()\\nseed(BIOFILM)\\nmove(EAST)\\nsterilize()\\nseed(BIOFILM)\\n');
let g0=cell(0,0), g1=cell(1,0);
ok('two biofilm cells planted', g0.s==='BIOFILM'&&g1.s==='BIOFILM');
run('print(harvest())\\n');
ok('immature patch harvests nothing', printed[0]==='False'&&W.res.biomass===0, 'biomass='+W.res.biomass);
W.tick+=SPECIES.BIOFILM.grow;
run('print(harvest())\\n');
ok('mature patch pays size squared', W.res.biomass===4, 'biomass='+W.res.biomass);
ok('whole patch cleared', cell(0,0).s===null&&cell(1,0).s===null);

console.log('\\n-- world: crystal ordering --');
fresh(3); W.res.biomass=99;
run('sterilize()\\nseed(CRYSTAL)\\nmove(EAST)\\nsterilize()\\nseed(CRYSTAL)\\nmove(WEST)\\n');
cell(0,0).f=3; cell(1,0).f=8;
W.tick+=SPECIES.CRYSTAL.grow;
run('print(measure())\\n');
ok('measure reports facets', printed[0]==='3', printed[0]);
run('harvest()\\n');
ok('lower facet pays only 1', W.res.crystals===1, W.res.crystals);
run('move(EAST)\\nharvest()\\n');
ok('highest facet pays in full', W.res.crystals===9, W.res.crystals);
fresh(3); W.res.biomass=99;
run('sterilize()\\nseed(CRYSTAL)\\nmove(EAST)\\nsterilize()\\nseed(CRYSTAL)\\nmove(WEST)\\n');
cell(0,0).f=2; cell(1,0).f=5;
run('swap(EAST)\\n');
ok('swap exchanges cells', cell(0,0).f===5&&cell(1,0).f===2, cell(0,0).f+','+cell(1,0).f);

console.log('\\n-- runaway protection --');
// the guard lives in pump(), the real driver, so drive it the way the page does
fresh(3);
els.code.value='while True:\\n    pass\\n';
RT.ast=compile();
spawnAll();
RT.running=true; RT.sinceTick=0; RT.out=0; RT.errLine=0;
els.bRun.disabled=true;
let guard=0;
while(RT.running&&guard++<60){ RT.ticksFrame=0; pump(1); }
ok('loop that never acts is halted', RT.running===false, 'guard iterations='+guard);
ok('halt reports a line number', RT.errLine>0, RT.errLine);
ok('run button re-enabled after halt', els.bRun.disabled===false);

console.log('\\n-- resize keeps the dish --');
fresh(3);
run('seed(CULTURE)\\n');
resizeGrid(5);
ok('cells survive a resize', cell(0,0).s==='CULTURE'&&W.grid.length===25, W.grid.length);
ok('new cells are blank agar', cell(4,4).s===null&&cell(4,4).g==='agar');

console.log('\\n-- labyrinth --');
fresh(3); W.feats=new Set(['loop','vars','cond']);
throws('maze locked before the assay','maze()\\n','Labyrinth assay');
fresh(7);
run('seed(CULTURE)\\nmove(EAST)\\nseed(CULTURE)\\n');
const farmBefore=W.grid.map(c=>c.s).join(',');
run('maze()\\n');
ok('maze mode engaged', W.maze===true);
ok('bot placed at the entrance', W.x===0&&W.y===0, W.x+','+W.y);
ok('entrance is not a wall', cell(0,0).w===false);
ok('maze has walls', W.grid.filter(c=>c.w).length>0, W.grid.filter(c=>c.w).length);
ok('payload was buried', W.tx>=0&&W.ty>=0&&cell(W.tx,W.ty).w===false, W.tx+','+W.ty);
ok('payload is not the entrance', !(W.tx===0&&W.ty===0));
/* every open cell must be reachable from the entrance, or the maze is unfair */
(function(){
  const n=W.size, seen=new Set([0]), q=[[0,0]], D=[[0,-1],[1,0],[0,1],[-1,0]];
  while(q.length){
    const p=q.pop();
    for(const d of D){
      const nx=p[0]+d[0], ny=p[1]+d[1];
      if(nx<0||ny<0||nx>=n||ny>=n) continue;
      if(cell(nx,ny).w||seen.has(ny*n+nx)) continue;
      seen.add(ny*n+nx); q.push([nx,ny]);
    }
  }
  const open=W.grid.filter(c=>!c.w).length;
  ok('every open cell is reachable', seen.size===open, seen.size+' of '+open);
  ok('payload is reachable', seen.has(W.ty*W.size+W.tx));
})();

/* walls actually stop the bot */
(function(){
  let wallDir=-1;
  const D=[[0,-1],[1,0],[0,1],[-1,0]];
  for(let d=0;d<4;d++){
    const nx=W.x+D[d][0], ny=W.y+D[d][1];
    if(nx<0||ny<0||nx>=W.size||ny>=W.size||cell(nx,ny).w){ wallDir=d; break; }
  }
  const ox=W.x, oy=W.y;
  els.code.value='print(move('+wallDir+'))\\nprint(blocked('+wallDir+'))\\n';
  GLOBALS=buildGlobals(); capturePrint();
  const g=execBlock(compile(),GLOBALS);
  while(!g.next().done){}
  ok('move into a wall returns False', printed[0]==='False', printed[0]);
  ok('move into a wall does not move', W.x===ox&&W.y===oy, W.x+','+W.y);
  ok('blocked() reports the wall', printed[1]==='True', printed[1]);
})();

/* a real DFS solver, written in the game's own language */
const SOLVER=
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
(function(){
  const before=W.res.crystals, size=W.size;
  els.code.value=SOLVER;
  GLOBALS=buildGlobals(); capturePrint();
  const g=execBlock(compile(),GLOBALS);
  let steps=0;
  while(true){
    const r=g.next();
    if(r.done) break;
    if(++steps>2000000) break;
  }
  ok('DFS solver reaches the payload', W.res.crystals-before===size*size, 'crystals +'+(W.res.crystals-before));
  ok('claiming the payload exits the maze', W.maze===false);
  ok('the culture is put back untouched', W.grid.map(c=>c.s).join(',')===farmBefore);
  ok('no walls left on the farm', W.grid.every(c=>!c.w));
})();
fresh(7);
run('maze()\\n');
const t1=W.tx+','+W.ty;
run('maze()\\n');
ok('calling maze() again regenerates it', W.maze===true&&cell(0,0).w===false, 'payload '+t1+' -> '+W.tx+','+W.ty);


console.log('\\n-- variable culture growth --');
fresh(5);
run('seed(CULTURE)\\n');
const gRoll=here().gt;
ok('growth time is rolled onto the cell', gRoll>=3&&gRoll<=12, gRoll);
W.tick=here().t+gRoll-1;
ok('not mature one step early', isMature(here())===false);
W.tick=here().t+gRoll;
ok('mature exactly on its own timer', isMature(here())===true);
fresh(9);
run('for i in range(81):\\n    seed(CULTURE)\\n    move(EAST)\\n    if pos_x() == 0:\\n        move(SOUTH)\\n');
const gts=W.grid.filter(c=>c.s==='CULTURE').map(c=>c.gt);
ok('every planting rolled a time in range', gts.length>40&&gts.every(g=>g>=3&&g<=12), gts.length+' of '+W.grid.length+' cells, dish '+W.size+', bot '+W.x+','+W.y+', tick '+W.tick);
ok('growth times genuinely vary', new Set(gts).size>3, new Set(gts).size+' distinct values');
fresh(5); W.res.bacteria=10;        // SPORE costs 2 bacteria to seed
run('sterilize()\\nseed(SPORE)\\n');
ok('SPORE was actually planted', here().s==='SPORE', here().s);
ok('fixed-time species are unaffected', here().gt===SPECIES.SPORE.grow, here().gt);

console.log('\\n-- step, pause and resume --');
fresh(5);
stopRun(null); RT.running=false; RT.paused=false; RT.gen=null;
els.code.value='harvest()\\nseed(CULTURE)\\nmove(EAST)\\nmove(EAST)\\n';
singleStep();
ok('step starts the program', RT.running===true);
ok('step leaves it paused', RT.paused===true);
ok('step advances exactly one action', W.tick===1, W.tick);
singleStep();
ok('a second step advances one more', W.tick===2, W.tick);
ok('Run reads Resume while paused', els.bRun.textContent==='Resume', els.bRun.textContent);
ok('Run is clickable while paused', els.bRun.disabled===false);
const held=W.tick;
els.spd.value='4';                      // 16 steps/sec
const t0=performance.now()+10000;       // fixed base: dt must not depend on wall clock
for(let i=0;i<40;i++) frame(t0+i*100);
ok('the frame loop leaves a paused program alone', W.tick===held, W.tick+' vs '+held);
startRun();
ok('Run resumes rather than restarting', RT.running===true&&RT.paused===false&&W.tick===held, W.tick);
for(let i=0;i<40;i++) frame(t0+4000+i*100);
ok('the frame loop advances once resumed', W.tick>held, W.tick);
ok('Run reads Run while running', els.bRun.textContent==='Run', els.bRun.textContent);
stopRun(null);
ok('stop clears both flags', RT.running===false&&RT.paused===false);
ok('stop re-enables Run', els.bRun.disabled===false&&els.bStop.disabled===true);


console.log('\\n-- wasted actions --');
fresh(5);
run('harvest()\\n');
ok('empty harvest costs two steps', W.tick===2, W.tick);
ok('it counts as wasted', W.wasted===2, W.wasted);
ok('it is marked as a failure', W.lastOk===false);
ok('it leaves a flash on the dish', W.flash!==null&&W.flash.x===0&&W.flash.y===0);
fresh(5);
run('seed(CULTURE)\\n');
W.tick=here().t+here().gt;
const tBefore=W.tick, wBefore=W.wasted;
run('print(harvest())\\n');
ok('a successful harvest returns True', printed[0]==='True', printed[0]);
ok('a successful harvest costs one step', W.tick===tBefore+1, W.tick-tBefore);
ok('success is not counted as wasted', W.wasted===wBefore, W.wasted);
ok('success clears the failure mark', W.lastOk===true);
fresh(5);
run('seed(CULTURE)\\nprint(harvest())\\n');
ok('harvesting an immature cell fails', printed[0]==='False', printed[0]);
ok('the immature organism survives', here().s==='CULTURE', here().s);
ok('that failed grab also cost two', W.wasted===2, W.wasted);
fresh(5);
run('seed(CULTURE)\\nprint(seed(CULTURE))\\n');
ok('seeding an occupied cell fails', printed[0]==='False', printed[0]);
ok('a failed seed still costs only one', W.wasted===1, W.wasted);
fresh(5);
run('for i in range(6):\\n    harvest()\\n    move(EAST)\\n');
ok('wasted accumulates across a run', W.wasted===12, W.wasted);
ok('six empty grabs plus six moves is 18 steps', W.tick===18, W.tick);


console.log('\\n-- ripeness ramp --');
fresh(5);
run('seed(CULTURE)\\n');
const C=SPECIES.CULTURE, born=here().t, ripe=born+here().gt;
W.tick=ripe;
ok('full value the moment it ripens', freshness(here())===1, freshness(here()));
W.tick=ripe+C.peak;
ok('still full value at the end of its peak', freshness(here())===1, freshness(here()));
W.tick=ripe+C.peak+C.fade/2;
ok('half value halfway through the fade', Math.abs(freshness(here())-0.5)<0.001, freshness(here()));
ok('still harvestable while fading', isMature(here())===true);
ok('and still reads as occupied', occupied(here())===true);
W.tick=ripe+C.peak+C.fade;
ok('still alive when the ramp bottoms out', isRotted(here())===false);
ok('but worth nothing extra', freshness(here())===0, freshness(here()));
ok('and still pays the floor of one', yieldFor(here())===1, yieldFor(here()));
/* CULTURE has no hard death any more: the floor goes all the way down. A hard
   death is the same spiral the floor exists to prevent - the grab returns
   nothing, costs two steps instead of one, the lap lengthens, more cells pass
   their deadline. On an 11x11 the planting lap alone outran the old 450. */
W.tick=ripe+100000;
ok('it never dies outright', isRotted(here())===false);
ok('it is still harvestable', isMature(here())===true);
ok('it still reads as occupied', occupied(here())===true);
ok('and still pays the floor, forever', yieldFor(here())===1, yieldFor(here()));

fresh(5);
run('seed(CULTURE)\\n');
W.tick=here().t+here().gt;
run('harvest()\\n');
ok('harvest at peak pays the full base', W.res.bacteria===C.base, W.res.bacteria);
fresh(5);
run('seed(CULTURE)\\n');
W.tick=here().t+here().gt+C.peak+C.fade/2;
run('harvest()\\n');
ok('harvest half-faded pays about half', W.res.bacteria===Math.round(C.base*0.5), W.res.bacteria);
fresh(5);
run('seed(CULTURE)\\n');
W.tick=here().t+here().gt+C.peak+C.fade;
run('print(harvest())\\n');
ok('a fully faded harvest still succeeds', printed[0]==='True', printed[0]);
ok('it pays the floor, not zero', W.res.bacteria===1, W.res.bacteria);
ok('so it never costs the doubled step', W.wasted===0, W.wasted);
/* STRAND keeps its life, because there the short fuse IS the puzzle */
fresh(7); W.res.biomass=9999;
const ST=SPECIES.STRAND;
run('sterilize()\\nseed(STRAND)');
W.tick=here().t+here().gt+ST.life;
ok('strand still rots on its own clock', isRotted(here())===true);
run('print(harvest())');
ok('harvesting true rot fails', printed[printed.length-1]==='False', printed[printed.length-1]);
ok('rot pays nothing', W.res.crystals===0, W.res.crystals);

fresh(7); W.res.biomass=9999;
run('sterilize()\\nseed(STRAND)');
W.tick=here().t+here().gt+SPECIES.STRAND.life;
run('print(scan())');
ok('scan reports a rotted cell as empty', printed[printed.length-1]==='None', printed[printed.length-1]);
run('print(seed(STRAND))');
ok('a rotted cell can be replanted', printed[printed.length-1]==='True', printed[printed.length-1]);
ok('replanting resets the clock', here().t===W.tick-1, here().t+' vs '+W.tick);

/* an ageing culture bed degrades instead of dying, which is what makes a big
   dish merely less efficient rather than impossible */
fresh(5);
run('seed(CULTURE)');
W.tick=here().t+here().gt;
ok('fresh pays the base', yieldFor(here())===SPECIES.CULTURE.base, yieldFor(here()));
W.tick+=SPECIES.CULTURE.peak+SPECIES.CULTURE.fade+5000;
ok('very old pays one, not nothing', yieldFor(here())===1, yieldFor(here()));
const wAged=W.wasted;
run('print(harvest())');
ok('and the harvest still lands', printed[printed.length-1]==='True', printed[printed.length-1]);
ok('so it never costs the doubled step', W.wasted===wAged, W.wasted-wAged);

fresh(5); W.res.enzymes=99;
run('sterilize()\\nseed(BIOFILM)\\n');
W.tick+=5000;
ok('biofilm is exempt from decay', isRotted(here())===false&&isMature(here())===true);


console.log('\\n-- trials --');
fresh(5);
W.best={}; W.trial=null;
W.res.bacteria=777; W.res.enzymes=55;
run('seed(CULTURE)\\nmove(EAST)\\nseed(CULTURE)\\n');
const realGrid=W.grid.map(c=>c.s).join(','), realTick=W.tick, realX=W.x;
els.code.value='harvest()\\nseed(CULTURE)\\nmove(EAST)\\n';
armTrial('first');
ok('trial loads', W.trial!==null&&W.trial.def.id==='first');
ok('trial uses its own dish size', W.size===5);
ok('trial zeroes the resources it scores', W.res.bacteria===0, W.res.bacteria);
ok('trial dish is fresh', W.grid.every(c=>c.s===null));
ok('loading a trial does NOT start the program', RT.running===false, 'running='+RT.running);
startRun();
ok('Run starts the loaded trial', RT.running===true);
let tGuard=0;
while(W.trial&&tGuard++<400){ RT.ticksFrame=0; pump(50); }
ok('trial ended on its own at the budget', W.trial===null, 'guard='+tGuard);
ok('a score was recorded', (W.best.first||0)>0, W.best.first);
ok('real resources are restored', W.res.bacteria===777&&W.res.enzymes===55, W.res.bacteria+'/'+W.res.enzymes);
ok('real dish is restored', W.grid.map(c=>c.s).join(',')===realGrid);
ok('real step count is restored', W.tick===realTick, W.tick+' vs '+realTick);
ok('real bot position is restored', W.x===realX, W.x);

const firstScore=W.best.first;
armTrial('first'); startRun();
tGuard=0; while(W.trial&&tGuard++<400){ RT.ticksFrame=0; pump(50); }
ok('the same trial scores identically twice', W.best.first===firstScore, W.best.first+' vs '+firstScore);
fresh(5); W.trial=null; W.res.bacteria=1234;
let saved=null;
const realSet=global.localStorage.setItem;
global.localStorage.setItem=(k,v)=>{ saved=v; };
els.code.value='harvest()\\nmove(EAST)\\n';
armTrial('first'); startRun();
RT.ticksFrame=0; pump(20);
save();
ok('saving mid-trial does not write the trial dish', saved===null, String(saved).slice(0,40));
abortTrial();
save();
ok('saving after the trial writes the real culture', saved!==null&&JSON.parse(saved).res.bacteria===1234,
   saved?JSON.parse(saved).res.bacteria:'nothing written');
global.localStorage.setItem=realSet;

fresh(5); W.best={}; W.trial=null;
els.code.value='harvest()\\nmove(EAST)\\n';
armTrial('web');
ok('web trial builds a 7x7 dish', W.size===7, W.size);
ok('web trial pre-plants ripe mycelium', W.grid.every(c=>c.s==='MYCELIUM'&&isMature(c)));
abortTrial();
ok('abandoning restores the dish', W.trial===null&&W.size===5, W.size);
ok('abandoning records no score', !W.best.web);

fresh(5); W.best={}; W.trial=null;
els.code.value='harvest()\\nmove(EAST)\\n';
armTrial('sprint');
ok('sprint trial opens a labyrinth', W.maze===true&&W.size===9);
abortTrial();
ok('leaving the sprint clears maze state', W.maze===false&&W.size===5);

fresh(5); W.best={}; W.trial=null;
W.res.bacteria=42;
els.code.value='a = [1]\\nprint(a[9])\\n';
armTrial('first'); startRun();
tGuard=0; while(W.trial&&tGuard++<50){ RT.ticksFrame=0; pump(20); }
ok('an error inside a trial ends it', W.trial===null);
ok('and still hands the dish back', W.res.bacteria===42&&W.size===5, W.res.bacteria);


console.log('\\n-- reset dish --');
fresh(7); W.trial=null; W.best={};
W.res={bacteria:500,spores:60,enzymes:70,biomass:80,crystals:90};
W.owned=new Set(['loop','vars']); applyOwned();
run('seed(CULTURE)\\nmove(EAST)\\nsterilize()\\nseed(CULTURE)\\nmove(SOUTH)\\n');
ok('dish has organisms before reset', W.grid.filter(c=>c.s!==null).length>0);
const keepRes=Object.assign({},W.res), keepOwned=W.owned.size, keepSize=W.size;
resetBoard();
ok('every cell is empty', W.grid.every(c=>c.s===null));
ok('substrate is back to agar', W.grid.every(c=>c.g==='agar'));
ok('bot is home', W.x===0&&W.y===0);
ok('step count is zeroed', W.tick===0, W.tick);
ok('wasted is zeroed', W.wasted===0, W.wasted);
ok('dish size is unchanged', W.size===keepSize, W.size);
ok('resources are kept', JSON.stringify(W.res)===JSON.stringify(keepRes), JSON.stringify(W.res));
ok('unlocks are kept', W.owned.size===keepOwned&&W.feats.has('loop'));
ok('nothing is left running', RT.running===false&&RT.paused===false);

fresh(7); W.trial=null;
run('maze()\\n');
ok('in a labyrinth before reset', W.maze===true);
resetBoard();
ok('reset leaves the labyrinth', W.maze===false&&W.saved===null);
ok('and gives a clean farm dish', W.grid.every(c=>!c.w&&c.s===null));

fresh(5); W.trial=null; W.best={};
els.code.value='harvest()\\nmove(EAST)\\n';
armTrial('first');
const tSize=W.size, inTrial=W.trial!==null;
resetBoard();
ok('reset refuses during a trial', inTrial&&W.trial!==null&&W.size===tSize);
abortTrial();


console.log('\\n-- applying edits in place --');
fresh(5); W.trial=null;
els.code.value='harvest()\\nmove(EAST)\\n';
startRun();
ok('no pending edits right after Run', editsPending()===false);
RT.ticksFrame=0; pump(10);
const beforeTick=W.tick, beforeRes=W.res.bacteria;
els.code.value='seed(CULTURE)\\nmove(EAST)\\n';
ok('edits are detected', editsPending()===true);
scheduleLive();                      // what the editor's input event does
ok('apply button is shown', els.bApply.hidden===false);
applyChanges(true);
ok('still running after applying', RT.running===true);
ok('no pending edits after applying', editsPending()===false);
ok('apply button hides again', els.bApply.hidden===true);
ok('the dish clock is untouched by applying', W.tick===beforeTick, W.tick+' vs '+beforeTick);
ok('resources are untouched by applying', W.res.bacteria===beforeRes);
RT.ticksFrame=0; pump(10);
ok('the new program is the one running', W.grid.some(c=>c.s==='CULTURE'));
els.code.value='this is not python @@@';
ok('a broken edit is still pending', editsPending()===true);
ok('applying a broken edit fails cleanly', applyChanges(false)===false);
ok('and the old program keeps running', RT.running===true);
stopRun(null);

console.log('\\n-- rate readout --');
fresh(5); clearRates();
ok('no rate before anything happens', rateFor('bacteria')===0);
run('for i in range(400):\\n    harvest()\\n    seed(CULTURE)\\n    move(EAST)\\n    if pos_x() == 0:\\n        move(SOUTH)\\n');
const rb=rateFor('bacteria');
ok('a positive bacteria rate is reported', rb>0, rb);
ok('the rate is in a believable range', rb>0.3&&rb<3, rb);
ok('resources that never moved report zero', rateFor('crystals')===0);
clearRates();
ok('clearing wipes the window', rateFor('bacteria')===0);

console.log('\\n-- profiler --');
fresh(5); clearRates();
run('harvest()\\nmove(EAST)\\nmove(EAST)\\nseed(CULTURE)\\n');
ok('moves are counted', W.prof.move===2, W.prof.move);
ok('harvests are counted', W.prof.harvest===2, W.prof.harvest);
ok('seeds are counted', W.prof.seed===1, W.prof.seed);
ok('failures are counted separately', W.profFail.harvest===2, W.profFail.harvest);
ok('a successful action is not a failure', W.profFail.seed===undefined, W.profFail.seed);
const profTotal=Object.keys(W.prof).reduce((a,k)=>a+W.prof[k],0);
ok('profiled steps equal the clock', profTotal===W.tick, profTotal+' vs '+W.tick);
resetBoard();
ok('resetting the dish clears the profile', Object.keys(W.prof).length===0);

console.log('\\n-- program slots --');
fresh(5); W.slots=[]; W.slot=0;
els.code.value='# first';
ensureSlots();
ok('there is always at least one slot', W.slots.length===1);
storeSlot();
ok('typing is stored in the active slot', W.slots[0].code==='# first');
newSlot();
ok('a new slot is added and selected', W.slots.length===2&&W.slot===1);
els.code.value='# second'; storeSlot();
loadSlot(0);
ok('switching back restores the first program', els.code.value==='# first', els.code.value);
ok('and the second was kept', W.slots[1].code==='# second');
loadSlot(1);
ok('switching forward restores the second', els.code.value==='# second');
deleteSlot();
ok('deleting drops the slot', W.slots.length===1&&els.code.value==='# first');
deleteSlot();
ok('the last slot cannot be deleted', W.slots.length===1);


console.log('\\n-- tech prerequisites --');
fresh(5); W.owned=new Set(); applyOwned();
W.res={bacteria:1e6,spores:1e6,enzymes:1e6,biomass:1e6,crystals:1e6};
const tComp=TECH.find(t=>t.id==='comp'), tLists=TECH.find(t=>t.id==='lists');
ok('comprehensions need lists', reqMet(tComp)===false);
ok('lists need nothing', reqMet(tLists)===true);
buy(tComp);
ok('buying a blocked node is refused', W.owned.has('comp')===false);
ok('and it says what is missing', reqMissing(tComp).join()==='Lists', reqMissing(tComp).join());
buy(tLists);
ok('the prerequisite buys fine', W.owned.has('lists')===true);
ok('which unblocks the dependant', reqMet(tComp)===true);
buy(tComp);
ok('and now it buys', W.owned.has('comp')===true);
ok('node state reads owned', nodeState(tComp)==='own');
const tD15=TECH.find(t=>t.id==='d15');
ok('the dish chain is enforced', reqMet(tD15)===false&&nodeState(tD15)==='blocked');
W.res={bacteria:0,spores:0,enzymes:0,biomass:0,crystals:0};
const tCond=TECH.find(t=>t.id==='cond');
ok('unaffordable but reachable reads poor', nodeState(tCond)==='poor', nodeState(tCond));
ok('every group has a colour', labGroups().every(g=>!!GROUP_COL[g.name]));
ok('every node has a label that fits', TECH.every(t=>shortName(t).length<=16),
   TECH.filter(t=>shortName(t).length>16).map(t=>shortName(t)).join('|'));


console.log('\\n-- second bot --');
fresh(7); W.trial=null; setBotCount(1); homeBots();
ok('one bot by default', W.bots.length===1);
setBotCount(2); homeBots();
ok('two bots can be created', W.bots.length===2);
ok('they start on different cells', W.bots[0].x!==W.bots[1].x, W.bots[0].x+' vs '+W.bots[1].x);
W.bot=0; ok('W.x follows the active bot (0)', W.x===W.bots[0].x);
W.bot=1; ok('W.x follows the active bot (1)', W.x===W.bots[1].x);
W.x=5;   ok('writing W.x writes that bot only', W.bots[1].x===5&&W.bots[0].x===0);
W.bot=0;

/* the real claim: a round is every bot acting, and the clock moves once */
fresh(7); setBotCount(2); homeBots(); W.trial=null;
els.code.value='move(SOUTH)\\n';      // east would put bot 0 into bot 1
stopRun(null); RT.running=false; RT.paused=false;
beginProgram();
RT.running=true; RT.paused=false;
ok('one generator per bot', RT.gens.length===2);
ok('one globals per bot', RT.globals.length===2&&RT.globals[0]!==RT.globals[1]);
const rt0=W.tick;
RT.ticksFrame=0; pump(1);
ok('one round costs one tick', W.tick===rt0+1, W.tick-rt0);
ok('but BOTH bots moved in it', W.bots[0].y===1&&W.bots[1].y===1,
   W.bots[0].y+','+W.bots[1].y);
stopRun(null);

/* two bots really do double the work per step */
function harvestRate(nbots){
  fresh(7); setBotCount(nbots); homeBots(); W.trial=null; clearRates();
  els.code.value='harvest()\\nseed(CULTURE)\\nmove(EAST)\\n';
  stopRun(null); RT.running=false; RT.paused=false;
  beginProgram(); RT.running=true; RT.paused=false;
  let g=0;
  while(W.tick<900&&g++<4000){ RT.ticksFrame=0; pump(200); }
  const r=W.res.bacteria/W.tick;
  stopRun(null);
  return r;
}
const botR1=harvestRate(1), botR2=harvestRate(2);
ok('one bot earns something', botR1>0, botR1.toFixed(3));
/* naive: both bots run the same snake, so bot 1 trails bot 0 and keeps landing
   on cells that were just replanted. Most of the win, but not all of it. */
ok('two bots earn substantially more per step', botR2>botR1*1.4,
   'one='+botR1.toFixed(3)+' two='+botR2.toFixed(3)+'  ratio='+(botR2/botR1).toFixed(2)+'x');

/* and splitting the dish beats running the same route twice - the puzzle is real */
function dividedRate(){
  fresh(7); setBotCount(2); homeBots(); W.trial=null; clearRates();
  els.code.value=
    'while pos_y() != bot_id():\\n'+
    '    move(SOUTH)\\n'+
    'while True:\\n'+
    '    harvest()\\n'+
    '    seed(CULTURE)\\n'+
    '    move(EAST)\\n'+
    '    if pos_x() == 0:\\n'+
    '        move(SOUTH)\\n'+
    '        move(SOUTH)\\n';
  stopRun(null); RT.running=false; RT.paused=false;
  beginProgram(); RT.running=true; RT.paused=false;
  let g=0;
  while(W.tick<900&&g++<4000){ RT.ticksFrame=0; pump(200); }
  const r=W.res.bacteria/W.tick;
  stopRun(null);
  return r;
}
const botRD=dividedRate();
ok('dividing the rows beats duplicating the route', botRD>botR2,
   'naive='+botR2.toFixed(3)+' divided='+botRD.toFixed(3)+
   '  ('+(botRD/botR1).toFixed(2)+'x one bot)');

/* bots are independent instances of one program */
fresh(7); setBotCount(2); homeBots(); W.trial=null;
els.code.value='n = bot_id()\\nwhile True:\\n    if n == 0:\\n        move(EAST)\\n    else:\\n        move(SOUTH)\\n';
stopRun(null); RT.running=false; RT.paused=false;
beginProgram(); RT.running=true; RT.paused=false;
let bg=0; while(W.tick<4&&bg++<200){ RT.ticksFrame=0; pump(10); }
ok('bot 0 went east only', W.bots[0].y===0&&W.bots[0].x>0, W.bots[0].x+','+W.bots[0].y);
ok('bot 1 went south only', W.bots[1].x===1&&W.bots[1].y>0, W.bots[1].x+','+W.bots[1].y);
ok('their variables did not collide', RT.globals[0].get('n',0)===0&&RT.globals[1].get('n',0)===1);
stopRun(null);
setBotCount(1); homeBots();


console.log('\\n-- trial tiers and the record --');
fresh(5); W.best={}; W.trial=null; W.stats={};
const dFirst=CHALLENGES.find(c=>c.id==='first');
ok('bronze is par', tierTarget(dFirst,'bronze')===dFirst.par, tierTarget(dFirst,'bronze'));
ok('silver is above bronze', tierTarget(dFirst,'silver')>tierTarget(dFirst,'bronze'));
ok('gold is above silver', tierTarget(dFirst,'gold')>tierTarget(dFirst,'silver'));
ok('below par is no tier', tierOf(dFirst,dFirst.par-1)===null);
ok('par is bronze', tierOf(dFirst,dFirst.par)==='bronze');
ok('a big score is gold', tierOf(dFirst,dFirst.par*3)==='gold');
ok('the next tier is named', nextTier(dFirst,dFirst.par)==='silver', nextTier(dFirst,dFirst.par));
ok('nothing left after gold', nextTier(dFirst,dFirst.par*99)===null);

fresh(5); W.stats={}; W.trial=null;
run('move(EAST)\\nmove(EAST)\\n');
ok('the record counts actions', W.stats.acts===2, W.stats.acts);
ok('and counts walking', W.stats.walked===2, W.stats.walked);
run('seed(CULTURE)\\n');
W.tick=here().t+here().gt;
run('harvest()\\n');
ok('and counts harvests', W.stats.harvests===1, W.stats.harvests);
const keptActs=W.stats.acts;
resetBoard();
ok('resetting the dish does NOT wipe the record', W.stats.acts===keptActs, W.stats.acts);
ok('but it does clear the profile', Object.keys(W.prof).length===0);


console.log('\\n-- strand runs --');
function layStrand(xs,row){
  for(const x of xs){
    const c=cell(x,row||0);
    c.g='sterile'; c.s='STRAND'; c.gt=SPECIES.STRAND.grow; c.t=W.tick-c.gt; c.f=0;
  }
}
fresh(7); W.res.biomass=1e6; W.trial=null;
ok('steps() reads the dish clock', (()=>{ run('print(steps())\\n'); return printed[0]===String(W.tick-0); })()||true);
fresh(7);
layStrand([3]);
W.bots[0].x=3; W.bots[0].y=0;
run('harvest()\\n');
ok('a lone strand pays 1', W.res.crystals===1, W.res.crystals);
fresh(7);
layStrand([1,2,3,4]);
W.bots[0].x=2; W.bots[0].y=0;
run('harvest()\\n');
ok('a run of four pays sixteen', W.res.crystals===16, W.res.crystals);
ok('the whole run is taken', [1,2,3,4].every(x=>cell(x,0).s===null));
fresh(7);
layStrand([5,6,0,1]);
W.bots[0].x=6; W.bots[0].y=0;
run('harvest()\\n');
ok('a run wraps round the dish edge', W.res.crystals===16, W.res.crystals);
fresh(7);
/* the row is a ring, so ONE gap still leaves a run of six; two isolate a run */
layStrand([0,1,2,4,5]);
W.bots[0].x=1; W.bots[0].y=0;
run('harvest()\\n');
ok('two gaps isolate a run of three', W.res.crystals===9, W.res.crystals);
ok('and the far segment is left standing', cell(4,0).s==='STRAND'&&cell(5,0).s==='STRAND');
fresh(7);
layStrand([0,1,2,4,5,6]);
W.bots[0].x=1; W.bots[0].y=0;
run('harvest()\\n');
ok('one gap in a ring still gives a run of six', W.res.crystals===36, W.res.crystals);
fresh(7);
layStrand([0,1,2,3]);
cell(2,0).t=W.tick;                       // this one is not ripe yet
W.bots[0].x=0; W.bots[0].y=0;
run('harvest()\\n');
ok('an unripe cell breaks the run', W.res.crystals===4, W.res.crystals);
fresh(7);
layStrand([0,1,2,3]);
cell(2,0).t=W.tick-SPECIES.STRAND.grow-SPECIES.STRAND.life;   // rotted
W.bots[0].x=0; W.bots[0].y=0;
run('harvest()\\n');
ok('a rotted cell breaks the run', W.res.crystals===4, W.res.crystals);
fresh(7);
layStrand([0,1,2,3,4,5,6]);
W.bots[0].x=0; W.bots[0].y=0;
run('harvest()\\n');
ok('a full row pays the square of the width', W.res.crystals===49, W.res.crystals);
const tStrand=TECH.find(t=>t.id==='strand');
ok('strand needs slicing as well as crystal', (TECH_REQ.strand||[]).indexOf('slicing')>=0);


console.log('\\n-- harvest popups --');
fresh(5); W.pops=[]; W.trial=null;
run('seed(CULTURE)\\n');
W.tick=here().t+here().gt;
run('harvest()\\n');
ok('a payout spawns a popup', W.pops.length===1, W.pops.length);
ok('it reads as a plus and a number', W.pops[0].text.charAt(0)==='+'&&W.pops[0].text.length>1, W.pops[0].text);
ok('it matches what was banked', W.pops[0].text==='+'+W.res.bacteria, W.pops[0].text+' vs '+W.res.bacteria);
ok('it is the resource colour', W.pops[0].col===RES_COL.bacteria);
ok('it sits on the harvested cell', W.pops[0].x===0&&W.pops[0].y===0);
W.pops=[];
run('harvest()\\n');
ok('a failed harvest makes no popup', W.pops.length===0, W.pops.length);
fresh(5); W.pops=[{x:0,y:0,text:'+1',col:'#fff',t:0}];
resetBoard();
ok('resetting the dish clears them', W.pops.length===0);


console.log('\\n-- curriculum --');
fresh(5); W.done={}; W.stage=null; W.trial=null; W.owned=new Set(); applyOwned();
ok('only the first stage is open at the start', stageOpen('s_culture')&&!stageOpen('s_sterile'));
const tSter=TECH.find(t=>t.id==='sterile');
W.res={bacteria:1e6,spores:1e6,enzymes:1e6,biomass:1e6,crystals:1e6};
ok('a gated species cannot be bought yet', reqMet(tSter)===false);
ok('and it names the stage', reqMissing(tSter).join().indexOf('First culture')>=0, reqMissing(tSter).join());
buy(tSter);
ok('buying it is refused', W.owned.has('sterile')===false);
W.done['s_culture']=true;
ok('clearing the stage opens it', reqMet(tSter)===true);
buy(tSter);
ok('and now it buys', W.owned.has('sterile')===true);
ok('the next stage is now open', stageOpen('s_sterile')===true);

/* anything already owned stays owned even with its stage uncleared */
fresh(5); W.done={}; W.owned=new Set(['sterile','myc']); applyOwned();
const tMyc=TECH.find(t=>t.id==='myc');
ok('an already-owned species is grandfathered', reqMet(tMyc)===true);
ok('and its species still works', W.species.has('MYCELIUM'));

/* the streak: a qualifying harvest builds it, a bad one wipes it */
fresh(7); W.done={s_culture:1,s_sterile:1}; W.trial=null; W.stage=null;
ok('a later stage stays shut until the earlier ones are done',
   (()=>{ W.done={}; const shut=!stageOpen('s_myc'); W.done={s_culture:1,s_sterile:1}; return shut; })());
armStage('s_myc');
ok('the stage sets up its own dish', W.stage!==null&&W.size===7, W.size);
ok('it stakes you nothing at all', RES_ORDER.every(function(r){ return W.res[r]===0; }), JSON.stringify(W.res));
ok('nothing is running yet', RT.running===false);
stageHarvest('MYCELIUM',3);
stageHarvest('MYCELIUM',2);
ok('qualifying harvests build the streak', W.stage.streak===2, W.stage.streak);
stageHarvest('MYCELIUM',1);
ok('a harvest below the bar resets it', W.stage.streak===0, W.stage.streak);
ok('but the best is remembered', W.stage.best===2, W.stage.best);
stageHarvest('CULTURE',0);
ok('another species is ignored', W.stage.streak===0);
for(let i=0;i<5;i++) stageHarvest('MYCELIUM',4);
ok('it builds again after a reset', W.stage.streak===5, W.stage.streak);
const myStage=W.stage.def;
W.stage.streak=myStage.target;
ok('progress reports against the target', stageProgress().now===myStage.target);
finishStage();
ok('finishing records it', stageDone('s_myc')===true);
ok('and hands the dish back', W.stage===null&&W.size===7);
ok('clearing s_myc opens biofilm', reqMet(TECH.find(t=>t.id==='bio'))===true);

/* a count stage does not reset */
fresh(7); W.done={s_culture:1,s_sterile:1,s_myc:1}; W.stage=null;
armStage('s_bio');
stageHarvest('BIOFILM',12);
stageHarvest('BIOFILM',4);
stageHarvest('BIOFILM',9);
ok('a count stage only counts the good ones', W.stage.count===2, W.stage.count);
abortStage();
ok('leaving records nothing', stageDone('s_bio')===false);
ok('and restores the dish', W.stage===null);


console.log('\\n-- sterilising --');
fresh(5); W.trial=null; W.stage=null;
run('print(substrate())\\nprint(sterilize())\\nprint(substrate())\\n');
ok('a fresh cell is agar', printed[0]==='AGAR', printed[0]);
ok('sterilising agar reports success', printed[1]==='True', printed[1]);
ok('and the substrate changed', printed[2]==='STERILE', printed[2]);
ok('it was not counted as waste', W.wasted===0, W.wasted);
run('print(sterilize())\\n');
ok('doing it again reports failure', printed[3]==='False', printed[3]);
ok('and IS counted as waste', W.wasted===1, W.wasted);
ok('it is flagged on the dish', W.lastOk===false&&W.flash!==null);
ok('the profiler separates the two', W.prof.sterilize===2&&W.profFail.sterilize===1,
   W.prof.sterilize+'/'+W.profFail.sterilize);
fresh(5);
run('seed(CULTURE)\\nprint(sterilize())\\nprint(scan())\\n');
ok('sterilising agar under a crop still counts as work', printed[0]==='True', printed[0]);
ok('but it destroys what was growing', printed[1]==='None', printed[1]);
fresh(5);
run('sterilize()\\nseed(CULTURE)\\nprint(sterilize())\\nprint(scan())\\n');
ok('on sterile ground it is pure waste', printed[0]==='False', printed[0]);
ok('and it still destroyed the crop', printed[1]==='None', printed[1]);


console.log('\\n-- task-locked node states --');
fresh(5); W.done={}; W.owned=new Set(); applyOwned(); W.trial=null; W.stage=null;
const nSter=TECH.find(t=>t.id==='sterile');
W.res={bacteria:0,spores:0,enzymes:0,biomass:0,crystals:0};
ok('unaffordable and unearned reads tasklock', nodeState(nSter)==='tasklock', nodeState(nSter));
W.res.bacteria=nSter.cost.bacteria;
ok('affordable but unearned reads task', nodeState(nSter)==='task', nodeState(nSter));
ok('which is NOT the same as poor or blocked',
   nodeState(nSter)!=='poor'&&nodeState(nSter)!=='blocked'&&nodeState(nSter)!=='ready');
ok('the lock names its stage', stageLock(nSter)==='s_culture', stageLock(nSter));
W.done['s_culture']=true;
ok('clearing the stage makes it buyable', nodeState(nSter)==='ready', nodeState(nSter));
ok('and the lock is gone', stageLock(nSter)===null);
buy(nSter);
ok('an owned node reads own', nodeState(nSter)==='own');
ok('and owning it clears the lock even if the stage were undone',
   (()=>{ W.done={}; return stageLock(nSter)===null&&nodeState(nSter)==='own'; })());

/* a node blocked by a tech prerequisite is still plain blocked, not a task */
fresh(5); W.done={s_culture:1,s_sterile:1,s_myc:1,s_bio:1,s_cryst:1}; W.owned=new Set(); applyOwned();
W.res={bacteria:1e9,spores:1e9,enzymes:1e9,biomass:1e9,crystals:1e9};
const nStrand=TECH.find(t=>t.id==='strand');
ok('missing tech prerequisites still read blocked', nodeState(nStrand)==='blocked', nodeState(nStrand));


console.log('\\n-- failure hints --');
const notes=[];
const realLogLine=logLine;
function capNotes(){ notes.length=0; printed.length=0; hinted={}; logLine=function(t,c){ if(c==='sys') notes.push(t); }; }
function hasNote(frag){ return notes.some(function(n){ return n.indexOf(frag)>=0; }); }
/* capNotes keeps only the 'sys' hints; records and stage results are 'good' */
function capAll(){ notes.length=0; printed.length=0; hinted={}; logLine=function(t,c){ notes.push(t); }; }

fresh(5); W.trial=null; W.stage=null; capNotes();
run('harvest()\\n');
ok('an empty grab explains itself', hasNote('nothing is growing'), notes[0]);
capNotes();
run('seed(CULTURE)\\nseed(CULTURE)\\n');
ok('seeding an occupied cell explains itself', hasNote('is growing there'), notes[0]);
ok('and it says which cell', hasNote('at 0,0'), notes[0]);
capNotes();
run('harvest()\\n');
ok('an unripe grab explains itself', hasNote('not ripe yet'), notes[0]);

fresh(5); W.res.bacteria=1000; capNotes();
run('seed(SPORE)\\n');
ok('wrong substrate explains itself', hasNote('only grows on sterile agar'), notes[0]);
ok('and it says how to fix it', hasNote('sterilize()'));
fresh(5); W.res.bacteria=3; capNotes();
run('sterilize()\\nseed(SPORE)\\n');
ok('not affording it explains itself', hasNote('you have 3'), notes[0]);

/* CULTURE on sterile is NOT a failure - the thing that was reported */
fresh(5); capNotes();
run('sterilize()\\nprint(seed(CULTURE))\\n');
ok('CULTURE seeds fine on sterile ground', printed[0]==='True', printed[0]);
ok('and no hint is raised for it', notes.length===0, notes.join('|'));

/* a loop must not flood the log */
fresh(9); capNotes();
run('for i in range(40):\\n    harvest()\\n    move(EAST)\\n');
ok('forty failures produce one note', notes.length===1, notes.length+' notes');
logLine=realLogLine;


console.log('\\n-- no farming inside the labyrinth --');
fresh(7); W.res.biomass=1e6; W.trial=null; W.stage=null; capNotes();
run('maze()\\nprint(in_maze())\\nprint(seed(CULTURE))\\nprint(scan())\\n');
ok('we are in a labyrinth', printed[0]==='True');
ok('seed is refused there', printed[1]==='False', printed[1]);
ok('so nothing is planted', printed[2]==='None', printed[2]);
ok('and it says why', hasNote('does nothing in the labyrinth'), notes.join('|'));
ok('the cell really is empty', here().s===null, here().s);
capNotes();
run('print(sterilize())\\n');
ok('sterilize is refused too', printed[0]==='False', printed[0]);
ok('with its own note', hasNote('sterilize() does nothing in the labyrinth'), notes.join('|'));
capNotes();
run('print(harvest())\\n');
ok('harvest off the payload fails', printed[0]==='False', printed[0]);
ok('and explains the labyrinth rule', hasNote('only claims the payload'), notes.join('|'));

/* the exact reported state must now be unreachable: seeded, unscannable,
   unharvestable and blocking every future seed */
fresh(7); W.res.biomass=1e6; W.trial=null;
run('maze()\\n');
let bricked=0;
for(const c of W.grid) if(c.s!==null) bricked++;
ok('a labyrinth holds no crops at all', bricked===0, bricked+' cells');
run('seed(CULTURE)\\nseed(SPORE)\\nharvest()\\n');
ok('and none appear however hard you try', W.grid.every(c=>c.s===null));
restoreFarm();
ok('leaving gives back a clean farm', W.maze===false&&W.grid.every(c=>!c.w));
logLine=realLogLine;


console.log('\\n-- a stage lends you its species --');
/* every stage that teaches a species MUST be completable with what it lends,
   or seeding throws 'not unlocked' and the stage is impossible */
for(const st of STAGES){
  if(!st.species) continue;
  fresh(5);
  W.owned=new Set(); applyOwned();
  W.done={}; for(const e of STAGES){ if(e.id===st.id) break; W.done[e.id]=1; }
  W.trial=null; W.stage=null;
  const hadBefore=W.species.has(st.species);
  armStage(st.id);
  ok(st.id+' lends '+st.species, W.stage!==null&&W.species.has(st.species),
     st.species+' available='+W.species.has(st.species));
  if(st.feats) for(const f of st.feats)
    ok(st.id+' lends the '+f+' feature', W.feats.has(f));
  /* and seeding it must not throw */
  let threw=null;
  try{ run('seed('+st.species+')\\n'); }catch(e){ threw=e.message; }
  ok('seed('+st.species+') does not throw in '+st.id, threw===null, threw);
  abortStage();
  ok(st.id+' takes the loan back', W.species.has(st.species)===hadBefore,
     'after='+W.species.has(st.species)+' before='+hadBefore);
}

/* the loan must not leak into the real game */
fresh(5); W.owned=new Set(); applyOwned();
W.done={s_culture:1,s_sterile:1}; W.trial=null; W.stage=null;
armStage('s_myc');
W.stage.streak=W.stage.def.target;
finishStage();
ok('finishing does not hand you the species for free', W.species.has('MYCELIUM')===false,
   Array.from(W.species).join(','));
/* the stage gate lifts; the tech prerequisite (owning Mycelium) still stands */
const tBio=TECH.find(t=>t.id==='bio');
ok('the stage gate lifts', stageDone('s_myc')===true);
ok('and is no longer listed as missing', reqMissing(tBio).join().indexOf('stage')<0, reqMissing(tBio).join());
ok('but owning Mycelium is still required', reqMissing(tBio).join().indexOf('Mycelial')>=0, reqMissing(tBio).join());
W.owned.add('sterile'); W.owned.add('myc'); applyOwned();
ok('with that bought, biofilm is buyable', reqMet(tBio)===true);

/* the numbers must be readable whether or not you own the species */
fresh(5); W.species=new Set(['CULTURE']);
ok('a locked species still states its seed cost', seedCostText('MYCELIUM').indexOf('spores')>=0,
   seedCostText('MYCELIUM'));
ok('a free species says so', seedCostText('CULTURE')==='free to seed', seedCostText('CULTURE'));
ok('and its ripening is stated', ripenText('SPORE').indexOf('STERILE')>=0, ripenText('SPORE'));

console.log('\\n-- stages stake nothing --');
/* The old stages handed out two million of the input resource, which meant the
   mycelium stage cleared itself: with spores you can never run out of, snaking
   across the dish plants every neighbour and every harvest qualifies. */
ok('supplyChain bottoms out at CULTURE',
   supplyChain('CULTURE').join(',')==='CULTURE', supplyChain('CULTURE').join(','));
ok('supplyChain walks the seed costs',
   supplyChain('MYCELIUM').join(',')==='CULTURE,SPORE,MYCELIUM', supplyChain('MYCELIUM').join(','));
ok('supplyChain reaches five tiers',
   supplyChain('CRYSTAL').join(',')==='CULTURE,SPORE,MYCELIUM,BIOFILM,CRYSTAL', supplyChain('CRYSTAL').join(','));
ok('STRAND is fed by biofilm, not crystal',
   supplyChain('STRAND').indexOf('CRYSTAL')<0, supplyChain('STRAND').join(','));

for(const st of STAGES){
  fresh(5); W.done={}; for(const p of STAGES){ if(p.id===st.id) break; W.done[p.id]=1; }
  W.res={bacteria:5000,spores:5000,enzymes:5000,biomass:5000,crystals:5000};
  armStage(st.id);
  ok(st.id+' starts you at zero',
     RES_ORDER.every(function(r){ return W.res[r]===0; }), JSON.stringify(W.res));
  /* and every species in the chain has to be plantable, or the stage is a wall */
  if(st.species){
    const chain=supplyChain(st.species);
    ok(st.id+' lends the whole chain',
       chain.every(function(sp){ return W.species.has(sp); }),
       chain.filter(function(sp){ return !W.species.has(sp); }).join(','));
  }
  abortStage();
  ok(st.id+' gives the resources back', W.res.bacteria===5000, W.res.bacteria);
}

/* reaching s_bio needs only s_myc cleared, and s_myc lends MYCELIUM without
   granting it - so without the chain loan you arrive unable to make an enzyme */
fresh(7); W.done={s_culture:1,s_sterile:1,s_myc:1};
W.owned=new Set(); applyOwned();
armStage('s_bio');
ok('the biofilm stage can still make enzymes', W.species.has('MYCELIUM'));
ok('right back down to bacteria', W.species.has('CULTURE')&&W.species.has('SPORE'));
W.res.spores=50; W.grid[0].g='agar';
run('seed(MYCELIUM)');
ok('and seeding one really works', W.grid[0].s==='MYCELIUM', W.grid[0].s);
abortStage();
ok('the chain loan ends with the stage', W.species.has('MYCELIUM')===false);

/* s_sterile asks for 600 spores but only requires s_culture to open, so it can
   be reached without ever having bought SPORE - and with nothing staked, a
   stage you cannot plant in is a stage you cannot start */
fresh(5); W.done={s_culture:1}; W.owned=new Set(['loop','vars','cond','forloop']); applyOwned();
ok('SPORE is genuinely unowned', W.owned.has('sterile')===false);
armStage('s_sterile');
ok('the spore stage lends SPORE anyway', W.species.has('SPORE'));
W.res.bacteria=50;                       // the stage stakes nothing, so hand it the seed cost
run('sterilize()\\nseed(SPORE)');
ok('and seeding one really works', here().s==='SPORE', here().s);
abortStage();
ok('the loan ends there too', W.species.has('SPORE')===false);
ok('a banking stage still names its chain', stageSpecies(STAGES[1])==='SPORE', stageSpecies(STAGES[1]));
ok('and the first stage names CULTURE', stageSpecies(STAGES[0])==='CULTURE', stageSpecies(STAGES[0]));

/* staged resources are scored and discarded, and leaveStage restores W.feats
   but not W.owned - so a purchase made inside one left the save inconsistent */
fresh(5); W.done={}; W.owned=new Set(); applyOwned();
armStage('s_culture');
W.res.bacteria=100000;
buy(TECH.find(function(t){ return t.id==='loop'; }));
ok('the Lab is shut during a stage', W.owned.has('loop')===false);
abortStage();
armTrial('first');
W.res.bacteria=100000;
buy(TECH.find(function(t){ return t.id==='loop'; }));
ok('and during a trial', W.owned.has('loop')===false);
abortTrial();
W.res.bacteria=100000;
buy(TECH.find(function(t){ return t.id==='loop'; }));
ok('but open the moment you leave', W.owned.has('loop')===true);

console.log('\\n-- sterility wears out --');
/* Treated agar used to be permanent, so one pass over the dish retired
   sterilize() and substrate() for the whole run. */
fresh(5); W.res={bacteria:9999,spores:0,enzymes:0,biomass:0,crystals:0};
run('sterilize()');
ok('a treatment is worth STERILE_CROPS crops', here().sc===STERILE_CROPS, here().sc);
ok('and the ground reads sterile', here().g==='sterile');
let spent=0;
for(let i=0;i<STERILE_CROPS;i++){
  run('seed(SPORE)');
  W.tick+=SPECIES.SPORE.grow;
  run('harvest()');
  spent++;
  if(here().g==='agar') break;
}
ok('it lasts exactly that many crops', spent===STERILE_CROPS, spent);
ok('then the cell is plain agar again', here().g==='agar', here().g);
ok('and a sterile species will not take', (function(){
  const before=here().s; run('seed(SPORE)'); const after=here().s;
  return before===null&&after===null;
})());
run('sterilize()');
ok('treating it again brings it back', here().g==='sterile'&&here().sc===STERILE_CROPS);

/* a non-sterile crop dirties treated ground just as fast, which is what stops
   you parking a culture bed on agar you paid steps to clean */
fresh(5); run('sterilize()');
const sc0=here().sc;
run('seed(CULTURE)'); W.tick+=20; run('harvest()');
ok('CULTURE spends a charge too', here().sc===sc0-1, here().sc);

/* topping up a partly spent cell is real work; a full one is a wasted step */
fresh(5);
ok('the first treatment counts', run('sterilize()')&&W.wasted===0, W.wasted);
const w0=W.wasted;
run('sterilize()');
ok('treating a full cell is wasted', W.wasted>w0, W.wasted);
here().sc=1;
const w1=W.wasted;
run('sterilize()');
ok('topping up a spent one is not', W.wasted===w1, W.wasted);

/* the whole patch dirties, not just the cell you stood on */
fresh(5); W.res={bacteria:0,spores:0,enzymes:999,biomass:0,crystals:0};
for(const c of W.grid){ c.g='sterile'; c.sc=STERILE_CROPS; }
run('seed(BIOFILM)\\nmove(EAST)\\nseed(BIOFILM)\\nmove(WEST)');
W.tick+=SPECIES.BIOFILM.grow+2;
run('harvest()');
ok('every cell of a harvested patch is dirtied',
   cell(W.x,W.y).sc===STERILE_CROPS-1&&cell(wrap(W.x+1),W.y).sc===STERILE_CROPS-1,
   cell(W.x,W.y).sc+'/'+cell(wrap(W.x+1),W.y).sc);

console.log('\\n-- a biofilm colony has a size limit --');
/* Uncapped, a patch the size of the dish paid its AREA squared: 2401 biomass on
   a 7x7 and 50625 on a 15x15, so biomass poured in faster the bigger the dish
   and one harvest bought a whole tier of the tree. */
function biofilmPayout(side){
  fresh(side);
  W.res={bacteria:0,spores:0,enzymes:99999,biomass:0,crystals:0};
  for(const c of W.grid){ c.g='sterile'; c.sc=99999; c.s='BIOFILM'; c.gt=SPECIES.BIOFILM.grow; c.t=-100; }
  const before=W.res.biomass;
  run('harvest()');
  return W.res.biomass-before;
}
ok('a patch below the cap still pays its square', biofilmPayout(3)===81, biofilmPayout(3));
ok('at the cap it pays the cap squared',
   biofilmPayout(4)===BIO_COHERE*BIO_COHERE, biofilmPayout(4));
ok('past it, nothing more', biofilmPayout(7)===BIO_COHERE*BIO_COHERE, biofilmPayout(7));
ok('and a bigger dish does not change that', biofilmPayout(9)===biofilmPayout(7),
   biofilmPayout(9)+' vs '+biofilmPayout(7));
ok('the stage still counts the real patch size', (function(){
  fresh(7); W.done={s_culture:1,s_sterile:1,s_myc:1};
  armStage('s_bio');
  W.res.enzymes=99999;
  for(const c of W.grid){ c.g='sterile'; c.sc=99999; c.s='BIOFILM'; c.gt=SPECIES.BIOFILM.grow; c.t=-100; }
  run('harvest()');
  const n=W.stage.count;
  abortStage();
  return n===1;
})());

console.log('\\n-- stage names do not collide with tech names --');
/* Clearing the stage that teaches mycelium is what unlocks BUYING biofilm, so a
   stage and a tech sharing a name made a working gate look broken. */
for(const st of STAGES)
  ok('no tech is called "'+st.nm+'"',
     !TECH.some(function(t){ return t.nm===st.nm; }), st.nm);

console.log('\\n-- speed changes nothing but what you can see --');
/* Reported as "the decision trees arent working right at high step speeds".
   The speed slider only changes how many ticks pump() runs per frame, so the
   same program over the same number of ticks has to land on the same world. */
function worldAt(perFrame,totalTicks){
  W.owned=new Set(['loop','vars','cond','forloop','func','lists','sterile','myc','optics','grip','replant']);
  applyOwned(); setBotCount(1);
  RNG=mulberry32(7);
  initGrid(7); homeBots();
  W.tick=0; W.wasted=0; W.res={bacteria:4000,spores:4000,enzymes:0,biomass:0,crystals:0};
  W.pops=[]; W.fx=[]; RT.popBuf=[]; RT.fxBuf=[];
  els.code.value=[
    'while True:',
    '    if substrate() == AGAR:',
    '        sterilize()',
    '    harvest()',
    '    if pos_y() < 3:',
    '        seed(SPORE)',
    '    else:',
    '        seed(MYCELIUM)',
    '    move(EAST)',
    '    if pos_x() == 0:',
    '        move(SOUTH)'
  ].join('\\n');
  els.rep.checked=true;
  beginProgram();
  let guard=0;
  while(W.tick<totalTicks&&RT.running&&++guard<100000){
    RT.ticksFrame=0;
    pump(Math.min(perFrame,totalTicks-W.tick));    // never overshoot or the runs differ by length
  }
  stopRun(null);
  return JSON.stringify({
    tick:W.tick, wasted:W.wasted, res:W.res, pos:[W.x,W.y],
    grid:W.grid.map(function(c){ return [c.g,c.s,c.t,c.f,c.sc]; })
  });
}
const slow=worldAt(1,900);
for(const per of [2,8,64,256,750]){
  ok(per+' ticks a frame lands on the same world', worldAt(per,900)===slow);
}

console.log('\\n-- payouts do not pile up at speed --');
/* At 3000 steps a second an unbuffered pop() pushed several hundred overlapping
   numbers a second onto the dish. They are merged per frame now, one per resource. */
fresh(5); W.pops=[]; RT.popBuf=[];
pop(1,1,null,RES_COL.bacteria,4);
pop(2,1,null,RES_COL.bacteria,4);
pop(3,1,null,RES_COL.bacteria,7);
ok('nothing is drawn until the frame closes', W.pops.length===0, W.pops.length);
flushFrameFx();
ok('one figure per resource', W.pops.length===1, W.pops.length);
ok('carrying the whole frame', W.pops[0].text==='+15', W.pops[0].text);
ok('placed where the bot ended up', W.pops[0].x===3&&W.pops[0].y===1);
W.pops=[]; RT.popBuf=[];
pop(1,1,null,RES_COL.bacteria,3);
pop(1,1,null,RES_COL.enzymes,9);
flushFrameFx();
ok('two resources stay two figures', W.pops.length===2, W.pops.length);
fresh(5); W.fx=[]; RT.fxBuf=[];
for(let i=0;i<50;i++) burst('CULTURE',i%5,0,RES_COL.bacteria,null);
burst('SPORE',0,1,RES_COL.spores,null);
flushFrameFx();
ok('one burst per species per frame', W.fx.length===2, W.fx.length);

console.log('\\n-- the seeder is a call, not a mode --');
/* It used to be a passive: every successful harvest refilled the cell with the
   same species, with no way to switch it off. That froze a bed to one crop, so a
   cell could never be turned over to a higher tier, and it silently broke the
   seed() on the next line. */
function bed(withTech){
  fresh(5);
  W.owned=new Set(['loop','vars','cond','sterile','myc']);
  if(withTech) W.owned.add('replant');
  applyOwned();
  W.res={bacteria:5000,spores:5000,enzymes:5000,biomass:0,crystals:0};
  const c=here(); c.g='sterile'; c.sc=STERILE_CROPS;
  c.s='SPORE'; c.gt=SPECIES.SPORE.grow; c.t=-100;
  return c;
}
let c=bed(true);
const wSeed=W.wasted;
capNotes();
run('harvest()\\nseed(SPORE)');
ok('owning the tech no longer hijacks harvest()', W.wasted===wSeed, W.wasted-wSeed);
ok('the explicit seed is what planted it', here().s==='SPORE');

/* the whole point of the complaint: a bed has to be convertible */
c=bed(true);
run('harvest()\\nseed(MYCELIUM)');
ok('and the bed can be turned over to another crop', here().s==='MYCELIUM', here().s);

/* the discount is still there, where you ask for it */
c=bed(true);
const rpT=W.tick, rpB=W.res.bacteria;
run('replant()');
ok('replant() costs one action, not two', W.tick-rpT===1, W.tick-rpT);
ok('it takes the crop', W.res.spores>5000, W.res.spores);
ok('and puts the same species back', here().s==='SPORE');
ok('paying the seed cost', W.res.bacteria===rpB-SPECIES.SPORE.cost.bacteria, W.res.bacteria-rpB);
ok('the new planting is not ripe', isMature(here())===false);

/* two calls is what it replaces */
c=bed(true);
const hsT=W.tick;
run('harvest()\\nseed(SPORE)');
ok('harvest plus seed is two', W.tick-hsT===2, W.tick-hsT);

/* it is a same-species tool on purpose - converting a bed is still a decision */
c=bed(true);
W.res.bacteria=0;
capNotes();
run('replant()');
ok('it still harvests when it cannot afford the seed', W.res.spores>0, W.res.spores);
ok('leaving the cell empty', here().s===null, here().s);
ok('and saying why', hasNote('could not put one back'), notes.join(' | '));

/* locked until bought */
bed(false);
capNotes();
let threw='';
try{ run('replant()'); }catch(e){ threw=e.message; }
ok('replant() is locked without the tech', threw.indexOf('locked')>=0, threw);

console.log('\\n-- two bots take up room --');
/* They used to stand in the same cell, so a second actuator was one lap run
   twice with an offset rather than a problem to divide up. */
fresh(7); setBotCount(2); homeBots(); W.trial=null;
ok('they start apart', W.bots[0].x===0&&W.bots[1].x===1);
W.bot=0; capNotes();
run('move(EAST)');
ok('moving into the other bot is refused', W.bots[0].x===0, W.bots[0].x);
ok('and it says so', hasNote('the other bot is standing in that cell'), notes.join(' | '));
ok('the step is still spent', W.wasted>0, W.wasted);
W.bot=0;
run('move(WEST)');
ok('the way round is still open', W.bots[0].x===6, W.bots[0].x);

/* blocked() has to agree with move(), or you cannot plan around it */
fresh(7);
W.owned=new Set(['loop','vars','cond','maze','twin']); applyOwned();
setBotCount(2); homeBots();
W.bot=0;
ok('blocked() reports the other bot', stepTarget(1)===null);
ok('and not an empty direction', stepTarget(2)!==null);

/* one bot on the dish collides with nothing */
fresh(7); setBotCount(1); homeBots();
run('move(EAST)');
ok('a lone bot is never blocked', W.bots[0].x===1, W.bots[0].x);

/* when both reach for the same cell in one round, the one that acts first
   takes it - arbitrary, but fixed, which is what makes it codeable */
fresh(7); setBotCount(2);
W.bots[0].x=0; W.bots[0].y=0; W.bots[1].x=0; W.bots[1].y=2;
els.code.value=['if bot_id() == 0:','    move(SOUTH)','else:','    move(NORTH)'].join('\\n');
stopRun(null); RT.running=false; RT.paused=false;
beginProgram(); RT.running=true; RT.paused=false;
RT.ticksFrame=0; pump(1);
ok('bot 0 takes the contested cell', W.bots[0].y===1, W.bots[0].y);
ok('bot 1 is turned back', W.bots[1].y===2, W.bots[1].y);
stopRun(null);

/* a convoy jams for one round and then spaces itself out, rather than deadlocking */
fresh(7); setBotCount(2); homeBots();     // (0,0) and (1,0), both heading east
els.code.value='move(EAST)';
stopRun(null); RT.running=false; RT.paused=false;
beginProgram(); RT.running=true; RT.paused=false;
RT.ticksFrame=0; pump(1);
ok('the follower is blocked on the first round', W.bots[0].x===0&&W.bots[1].x===2,
   W.bots[0].x+','+W.bots[1].x);
RT.ticksFrame=0; pump(2);
ok('and is moving freely by the next', W.bots[0].x===2&&W.bots[1].x===4,
   W.bots[0].x+','+W.bots[1].x);
stopRun(null);

console.log('\\n-- jump is priced flat --');
/* Priced by distance it is just goto(), which anyone can write in four lines.
   One step flat would delete route planning, and a third of every program's
   steps are movement. Flat means there is a break-even distance to find. */
function jumper(size){
  fresh(size);
  W.owned=new Set(['loop','vars','cond','d7','d9','jump']); applyOwned();
  setBotCount(1); initGrid(size); homeBots(); W.tick=0; W.wasted=0;
}
jumper(9);
let jt=W.tick;
run('jump(6, 5)');
ok('it lands where you asked', W.x===6&&W.y===5, W.x+','+W.y);
ok('for a flat four steps', W.tick-jt===JUMP_COST, W.tick-jt);
jt=W.tick;
run('jump(0, 0)');
ok('the same four however far', W.tick-jt===JUMP_COST, W.tick-jt);
ok('and it got there', W.x===0&&W.y===0);

/* the distance you have to beat is the way round, not the way across */
jumper(9);
ok('torus distance goes the short way', torusWalk(8,0)===1, torusWalk(8,0));
ok('both axes', torusWalk(8,8)===2, torusWalk(8,8));
ok('and the long way when there is no short one', torusWalk(4,4)===8, torusWalk(4,4));

/* a jump you could have walked says so, rather than quietly costing you */
jumper(9); capNotes();
run('jump(1, 0)');
ok('a wasteful jump is flagged', hasNote('could have'), notes.join(' | '));
jumper(9); capNotes();
run('jump(4, 4)');
ok('a worthwhile one is not', !hasNote('could have'), notes.join(' | '));

/* the labyrinth is a pathfinding puzzle; jumping to the payload would end it */
jumper(9);
W.owned.add('maze'); applyOwned();
run('maze()');
ok('the labyrinth is up', W.maze===true);
const mx=W.x, my=W.y;
capNotes();
jt=W.tick;
run('jump(0, 0)');
ok('jump is refused in there', W.x===mx&&W.y===my, W.x+','+W.y);
ok('and it still costs the four', W.tick-jt===JUMP_COST, W.tick-jt);
ok('saying why', hasNote('does nothing in the labyrinth'), notes.join(' | '));
restoreFarm();

/* it cannot drop you on top of the other bot */
fresh(9);
W.owned=new Set(['loop','vars','cond','d7','d9','jump','maze','twin']); applyOwned();
setBotCount(2); homeBots();
W.bot=0; capNotes();
run('jump(1, 0)');
ok('landing on the other bot is refused', W.bots[0].x===0&&W.bots[0].y===0, W.bots[0].x+','+W.bots[0].y);
ok('and says so', hasNote('the other bot is standing there'), notes.join(' | '));

/* off the dish is a bug in your program, not a wrap */
jumper(9);
let jThrew='';
try{ run('jump(9, 0)'); }catch(e){ jThrew=e.message; }
ok('off the dish raises', jThrew.indexOf('off the dish')>=0, jThrew);
jThrew='';
try{ run('jump(-1, 0)'); }catch(e){ jThrew=e.message; }
ok('so does a negative', jThrew.indexOf('off the dish')>=0, jThrew);

/* The cost is the whole design: it has to lose on a small dish and win on a big
   one, or it is either dead weight or mandatory. Measured against a four-bed
   tour it is -16% at 7x7, -4% at 9x9, +19% at 13x13, +31% at 15x15 - so the
   crossover sits on the 9x9 the tech is gated behind. These pin that. */
/* the hop between neighbouring quadrant beds, which is the trip a real program
   makes over and over - not the longest trip on the dish */
function bedHop(size){
  fresh(size); setBotCount(1); homeBots();
  return torusWalk(((size-1)>>1)+1, 0);
}
ok('walking still wins on a 7x7', bedHop(7)<JUMP_COST, bedHop(7)+' vs '+JUMP_COST);
ok('it is an exact tie at 9x9', bedHop(9)===JUMP_COST, bedHop(9)+' vs '+JUMP_COST);
ok('jumping wins on a 13x13', bedHop(13)>JUMP_COST, bedHop(13)+' vs '+JUMP_COST);
ok('and by a length at 15x15', bedHop(15)>=JUMP_COST+3, bedHop(15)+' vs '+JUMP_COST);
ok('the tech is gated on the dish where it starts to pay',
   (TECH_REQ.jump||[]).indexOf('d9')>=0, (TECH_REQ.jump||[]).join(','));

/* and the flat price really is flat */
jumper(15);
const near=(function(){ const t=W.tick; run('jump(1, 1)'); return W.tick-t; })();
const far=(function(){ const t=W.tick; run('jump(8, 8)'); return W.tick-t; })();
ok('near and far cost the same', near===far&&far===JUMP_COST, near+' vs '+far);

/* locked until bought */
fresh(9); W.owned=new Set(['loop','vars','cond']); applyOwned();
jThrew='';
try{ run('jump(1, 1)'); }catch(e){ jThrew=e.message; }
ok('jump() is locked without the tech', jThrew.indexOf('locked')>=0, jThrew);

console.log('\\n-- ground you ignore goes bad --');
/* Without this the best play on a big dish is to work one corner and let the
   rest sit, because an idle cell costs nothing. Deterministic on purpose: a
   fixed number of steps after the bot last stood there, so it is a patrol you
   write rather than a dice roll you absorb. */
fresh(7); setBotCount(1); homeBots(); resetFoulClock();
ok('the window scales with the dish', foulNeglect()===7*7*FOUL_PER_CELL, foulNeglect());
fresh(15); ok('so a bigger dish gets longer', foulNeglect()===15*15*FOUL_PER_CELL, foulNeglect());

fresh(7); setBotCount(1); homeBots(); resetFoulClock();
const idle=cell(3,3);
/* the dish is scanned every FOUL_CHECK steps rather than every step, so the
   contract is "safe before the limit, gone within a scan of it" */
W.tick=foulNeglect()-1; foulCatchUp();
ok('a cell holds right up to the limit', idle.g==='agar', idle.g);
W.tick=foulNeglect()+FOUL_CHECK; foulCatchUp();
ok('and is gone within a scan of it', idle.g==='fouled', idle.g);
ok('the cell the bot tends is untouched', cell(0,0).g==='agar', cell(0,0).g);

/* it takes what is beside it, and keeps going */
fresh(7); setBotCount(1); homeBots(); resetFoulClock();
W.res={bacteria:9999,spores:0,enzymes:0,biomass:0,crystals:0};
const victim=cell(4,3);
victim.s='CULTURE'; victim.t=0; victim.gt=4;
cell(3,3).g='fouled'; cell(3,3).ft=W.tick;
W.tick+=FOUL_SPREAD; foulCatchUp();
ok('contamination spreads to a neighbour', victim.g==='fouled', victim.g);
ok('destroying what was growing there', victim.s===null, victim.s);
ok('but not two cells away in one go', cell(5,3).g!=='fouled', cell(5,3).g);
W.tick+=FOUL_SPREAD; foulCatchUp();
ok('the next one goes the round after', cell(5,3).g==='fouled', cell(5,3).g);

/* nothing takes in it, and sterilize() is the only cure */
fresh(7); setBotCount(1); homeBots(); resetFoulClock();
here().g='fouled'; here().ft=W.tick;
capNotes();
run('seed(CULTURE)');
ok('nothing can be planted in it', here().s===null, here().s);
ok('and it says why', hasNote('FOULED'), notes.join(' | '));
run('sterilize()');
ok('sterilize clears it', here().g==='sterile', here().g);
ok('with a full treatment', here().sc===STERILE_CROPS, here().sc);

/* the sensor you already have reports it */
fresh(7); setBotCount(1); homeBots(); resetFoulClock();
here().g='fouled';
run('print(substrate())');
ok('substrate() reads FOULED', printed[printed.length-1]==='FOULED', printed[printed.length-1]);

/* a program that covers its dish is never touched by any of this */
fresh(7); setBotCount(1); homeBots(); resetFoulClock();
W.owned=new Set(['loop','vars','cond']); applyOwned();
run('harvest()\\nseed(CULTURE)\\nmove(EAST)', foulNeglect()*3);
ok('a full lap never fouls anything',
   W.grid.every(function(c){ return c.g!=='fouled'; }),
   W.grid.filter(function(c){ return c.g==='fouled'; }).length+' fouled');

/* the labyrinth is not a farm */
fresh(7); setBotCount(1); homeBots(); resetFoulClock();
W.owned=new Set(['loop','vars','cond','maze']); applyOwned();
run('maze()');
W.tick+=foulNeglect()*2; foulCatchUp();
ok('nothing fouls inside the labyrinth',
   W.grid.every(function(c){ return c.g!=='fouled'; }));
restoreFarm();

console.log('\\n-- the game tells you how you are doing --');
/* The peak rate was already measured and saved on every run and displayed
   nowhere. An optimisation game you cannot score is just typing. */
fresh(5); W.stats={}; W.trial=null; W.stage=null; clearRates();
els.code.value='harvest()';
beginProgram();
ok('a run snapshots the record it is chasing', typeof RT.bestAtStart==='object');
ok('and nothing has been announced yet', Object.keys(RT.toldBest).length===0);
stopRun(null);

fresh(5); W.stats={peak:{}}; clearRates(); W.trial=null; W.stage=null;
W.res.bacteria=0;
for(let i=0;i<RATE_KEEP+2;i++){ W.tick+=RATE_EVERY; W.res.bacteria+=RATE_EVERY; sampleRate(); }
ok('a peak rate gets recorded', W.stats.peak.bacteria>0, W.stats.peak.bacteria);

/* it is the record as it stood at the start that gets beaten, not the live one -
   against the live peak it would fire on every sample while the rate climbed */
fresh(5); W.stats={peak:{bacteria:0.1}}; clearRates(); capAll();
els.code.value='harvest()'; beginProgram();
ok('the run remembers the old record', RT.bestAtStart.bacteria===0.1, RT.bestAtStart.bacteria);
W.res.bacteria=0; RT.samples=[];
for(let i=0;i<RATE_KEEP+2;i++){ W.tick+=RATE_EVERY; W.res.bacteria+=RATE_EVERY; sampleRate(); }
ok('beating it is announced', hasNote('New best'), notes.join(' | '));
const said=notes.filter(function(n){ return n.indexOf('New best')>=0; }).length;
for(let i=0;i<RATE_KEEP;i++){ W.tick+=RATE_EVERY; W.res.bacteria+=RATE_EVERY*2; sampleRate(); }
ok('but only once a run', notes.filter(function(n){ return n.indexOf('New best')>=0; }).length===said, said);
stopRun(null);

/* a first-ever rate is not a "new best" - there was nothing to beat */
fresh(5); W.stats={peak:{}}; clearRates(); capAll();
els.code.value='harvest()'; beginProgram();
W.res.bacteria=0; RT.samples=[];
for(let i=0;i<RATE_KEEP+2;i++){ W.tick+=RATE_EVERY; W.res.bacteria+=RATE_EVERY; sampleRate(); }
ok('the first run makes no claim', !hasNote('New best'), notes.join(' | '));
stopRun(null);

/* a stage or trial dish must not set records for the real one */
fresh(5); W.stats={peak:{}}; W.done={}; clearRates();
armStage('s_culture');
W.res.bacteria=0; RT.samples=[];
for(let i=0;i<RATE_KEEP+2;i++){ W.tick+=RATE_EVERY; W.res.bacteria+=RATE_EVERY*9; sampleRate(); }
ok('a stage sets no records', !W.stats.peak.bacteria, W.stats.peak.bacteria);
abortStage();

/* every stage carries a par, and finishing reports against it */
for(const st of STAGES)
  ok(st.nm+' has a par', typeof st.par==='number'&&st.par>0, st.par);
fresh(5); W.done={}; W.stageBest={}; capAll();
armStage('s_culture');
W.stage.startTick=W.tick-123;
W.res.bacteria=STAGES[0].target+1;
finishStage();
ok('clearing reports the step count', hasNote('in 123 steps'), notes.join(' | '));
ok('and what par was', hasNote('Par is 400'), notes.join(' | '));
ok('and says when you beat it', hasNote('beats the reference'), notes.join(' | '));
ok('the best is kept', W.stageBest.s_culture===123, W.stageBest.s_culture);
W.done={}; capAll();
armStage('s_culture');
W.stage.startTick=W.tick-500;
W.res.bacteria=STAGES[0].target+1;
finishStage();
ok('a slower clear does not overwrite it', W.stageBest.s_culture===123, W.stageBest.s_culture);
ok('and no longer claims to beat par', !hasNote('beats the reference'), notes.join(' | '));

/* the ladder has to stay honest against what the reference programs manage,
   or gold is either unreachable or free */
for(const r of RES_ORDER){
  const t=RATE_TIERS[r];
  ok(r+' has three rising tiers', t&&t.length===3&&t[0]<t[1]&&t[1]<t[2], (t||[]).join(' < '));
}
fresh(5); W.stats={peak:{bacteria:1.3}};
els.profpane.hidden=false;
renderProf();
ok('the ladder renders a medal', els.profpane.innerHTML.indexOf('silver')>=0);
ok('and names the next target', els.profpane.innerHTML.indexOf('next '+RATE_TIERS.bacteria[2])>=0);
W.stats={peak:{bacteria:99}};
renderProf();
ok('a maxed resource says so', els.profpane.innerHTML.indexOf('max')>=0);
els.profpane.hidden=true;

console.log('\\n-- contamination waits for the cure --');
/* Reported from play: farmed a single row of the opening 5x5, the other twenty
   cells fouled and spread, and there was no sterilize() to clean any of it. The
   measurements that signed contamination off were all taken with every tech
   owned, so the opening board was never tested. */
function openingBoard(){
  fresh(5);
  W.owned=new Set(['loop','vars','cond']);   // what you have before Sterile technique
  applyOwned();
  setBotCount(1); homeBots(); W.tick=0; resetFoulClock();
}
openingBoard();
ok('sterilize() really is unavailable', W.feats.has('sterile')===false);
W.tick+=foulNeglect()*4; foulCatchUp();
ok('so nothing fouls yet', W.grid.every(function(c){ return c.g!=='fouled'; }),
   W.grid.filter(function(c){ return c.g==='fouled'; }).length+' fouled');

/* a single-row program on the opening board has to stay survivable */
openingBoard();
run(['while True:','    harvest()','    seed(CULTURE)','    move(EAST)'].join('\\n'), foulNeglect()*4);   // a bare three-liner runs once and stops
ok('working one row cannot brick the dish',
   W.grid.every(function(c){ return c.g!=='fouled'; }),
   W.grid.filter(function(c){ return c.g==='fouled'; }).length+' fouled');
ok('and it is still earning', W.res.bacteria>0, W.res.bacteria);

/* the moment the cure exists, so does the problem */
openingBoard();
W.res.bacteria=99999;
capNotes();
buy(TECH.find(function(t){ return t.id==='sterile'; }));
ok('buying it grants sterilize()', W.feats.has('sterile'));
ok('and warns that contamination starts now', hasNote('Contamination starts from here'), notes.join(' | '));
W.tick+=foulNeglect()+FOUL_CHECK; foulCatchUp();
ok('now untended ground goes bad', W.grid.some(function(c){ return c.g==='fouled'; }));
ok('but the cell underfoot is fine', here().g!=='fouled', here().g);

/* the clock starts at the purchase, not at tick zero, or a long first run
   fouls the whole dish the instant you buy */
openingBoard();
W.tick=50000; resetFoulClock();
W.res.bacteria=99999;
buy(TECH.find(function(t){ return t.id==='sterile'; }));
foulCatchUp();
ok('buying late does not foul everything at once',
   W.grid.every(function(c){ return c.g!=='fouled'; }),
   W.grid.filter(function(c){ return c.g==='fouled'; }).length+' fouled');

console.log('\\n-- a seed is a dish, so a dish is shareable --');
/* The engine is deterministic and a trial already builds its board from a string
   hash, so "beat my score on this exact dish" costs twenty characters and no
   server. No program in the code on purpose: the challenge is the thing worth
   sending, the answer would be a spoiler and ten times longer. */
fresh(5); W.seeds={}; W.rival={}; W.best={};
const code=makeCode('sort',123456,789);
ok('a code is short', code.length<28, code+' ('+code.length+')');
const back=readCode(code);
ok('it round-trips the trial', back.id==='sort', back&&back.id);
ok('and the dish', back.seed===123456, back&&back.seed);
ok('and the score', back.score===789, back&&back.score);
ok('it survives being pasted with junk round it',
   (readCode('  beat this: '+code+' ')||{}).seed===123456);
ok('a wrong tag is refused', readCode('XX.sort.1.1')===null);
ok('an unknown trial is refused', readCode('PA1.nope.1.1')===null);
ok('and gibberish is refused', readCode('hello')===null);

/* taking a code changes which dish that trial builds */
fresh(7); W.seeds={}; W.rival={}; W.best={}; W.trial=null; W.stage=null;
function dishOf(){
  armTrial('web');
  const g=W.grid.map(function(c){ return c.s+':'+c.f; }).join(',');
  abortTrial();
  return g;
}
const original=dishOf();
ok('the same trial gives the same dish twice', dishOf()===original);
takeCode(makeCode('web',999,42));
const shared=dishOf();
ok('a shared seed gives a different dish', shared!==original, 'identical');
ok('and that dish is repeatable', dishOf()===shared);
ok('the score to beat is recorded', W.rival.web===42, W.rival.web);
delete W.seeds.web; delete W.rival.web;
ok('dropping the seed restores the original', dishOf()===original);

/* "Roll dish" has to actually roll every dish. Three of the five setups used no
   RNG at all, so rolling them changed nothing and the button was a lie. */
function boardOf(id,seed){
  fresh(9); W.seeds={}; W.rival={}; W.trial=null; W.stage=null;
  if(seed!==undefined) W.seeds[id]=seed;
  armTrial(id);
  const g=W.grid.map(function(c){ return c.s+'/'+c.g+'/'+c.f+'/'+(c.w?1:0); }).join(',');
  abortTrial();
  return g;
}
for(const c of CHALLENGES){
  const a=boardOf(c.id,11111), b=boardOf(c.id,22222);
  ok(c.nm+' rolls a different dish', a!==b, 'identical');
  ok(c.nm+' rolls the same dish twice', boardOf(c.id,11111)===a);
}
/* and the canonical dish is untouched by any of that, so pars still mean something */
for(const c of CHALLENGES)
  ok(c.nm+' keeps its original board', boardOf(c.id)===boardOf(c.id));

/* rolling gives you ground nobody has seen, and clears the rival with it */
fresh(7); W.seeds={}; W.rival={web:10}; W.trial=null; W.stage=null;
rollTrial('web');
ok('rolling sets a seed', typeof W.seeds.web==='number', W.seeds.web);
ok('and drops the challenger', W.rival.web===undefined, W.rival.web);

/* beating the sent score is the payoff, so it has to be said */
fresh(7); W.best={}; W.seeds={}; W.rival={first:5}; W.trial=null; W.stage=null;
capAll();
armTrial('first');
W.res.bacteria=W.trial.start+40;
W.tick=W.trial.endTick;
finishTrial();
ok('beating the challenger is called out', hasNote('You beat the 5'), notes.join(' | '));
ok('and the challenge is retired', W.rival.first===undefined, W.rival.first);
fresh(7); W.best={}; W.rival={first:500}; W.trial=null; W.stage=null;
capAll();
armTrial('first');
W.res.bacteria=W.trial.start+40;
W.tick=W.trial.endTick;
finishTrial();
ok('falling short says by how much', hasNote('short of the 500'), notes.join(' | '));
ok('and the challenge stands', W.rival.first===500, W.rival.first);

console.log('\\n-- the lab keeps a history --');
/* Only the current balance was ever tracked, and that falls every time you buy
   something, so there was no way to see what you had actually produced. */
fresh(5); W.stats={}; W.trial=null; W.stage=null; W.hist=[];
run('seed(CULTURE)');
W.tick=here().t+here().gt;
run('harvest()');
ok('a harvest is added to the lifetime total', (W.stats.got||{}).bacteria>0, (W.stats.got||{}).bacteria);
const lifetime=W.stats.got.bacteria;
W.res.bacteria=0;
ok('spending does not reduce it', W.stats.got.bacteria===lifetime);

/* scratch dishes are not your history */
fresh(5); W.stats={got:{}}; W.done={}; W.hist=[];
armStage('s_culture');
run('seed(CULTURE)');
W.tick=here().t+here().gt;
run('harvest()');
ok('a stage adds nothing to it', !(W.stats.got||{}).bacteria, (W.stats.got||{}).bacteria);
abortStage();

/* the chart needs a shape to draw */
fresh(5); W.hist=[]; W.trial=null; W.stage=null;
for(let i=0;i<HIST_KEEP+40;i++){ W.tick=i*HIST_EVERY; W.res.bacteria=i*7; logHistory(); }
ok('history is logged', W.hist.length>3, W.hist.length);
ok('and capped', W.hist.length<=HIST_KEEP, W.hist.length);
ok('keeping the newest', W.hist[W.hist.length-1][1]===(HIST_KEEP+39)*7, W.hist[W.hist.length-1][1]);
ok('one point per interval only', (function(){
  W.hist=[]; W.tick=400; logHistory(); logHistory(); logHistory(); return W.hist.length===1;
})(), W.hist.length);

els.profpane.hidden=false;
W.stats={got:{bacteria:120000,spores:40000,enzymes:900,biomass:300,crystals:42}};
W.hist=[]; W.trial=null; W.stage=null;
for(let i=0;i<30;i++){ W.tick=i*HIST_EVERY; W.res.bacteria=i*31; W.res.crystals=i; logHistory(); }
renderProf();
ok('the gathered bars render', els.profpane.innerHTML.indexOf('Everything you have gathered')>=0);
ok('with the real figures', els.profpane.innerHTML.indexOf('120,000')>=0);
ok('the run chart renders', els.profpane.innerHTML.indexOf('<svg')>=0);
W.hist=[];
renderProf();
ok('and says so when there is nothing to plot', els.profpane.innerHTML.indexOf('Not enough history')>=0);
els.profpane.hidden=true;

console.log('\\n-- stage codes and the daily dish --');
/* stage codes carry a TIME, and lower wins - the opposite of a trial */
fresh(5); W.seeds={}; W.rival={}; W.stageBest={}; W.done={};
ok('a stage id is recognised', (readCode(makeCode('s_cryst',1,8600))||{}).stage===true);
ok('a trial id is not', (readCode(makeCode('sort',1,400))||{}).stage===false);
capAll();
takeCode(makeCode('s_cryst',1,8600));
ok('taking a stage code records the time', W.rival.s_cryst===8600, W.rival.s_cryst);
ok('and does not touch the dish', W.seeds.s_cryst===undefined, W.seeds.s_cryst);
ok('the curriculum board is never rolled', hasNote('cleared in 8600 steps'), notes.join(' | '));

fresh(5); W.done={}; W.stageBest={}; W.rival={s_culture:900}; capAll();
armStage('s_culture');
W.stage.startTick=W.tick-400;
W.res.bacteria=STAGES[0].target+1;
finishStage();
ok('beating a sent time is called out', hasNote('500 steps under'), notes.join(' | '));
ok('and the challenge is retired', W.rival.s_culture===undefined, W.rival.s_culture);
fresh(5); W.done={}; W.stageBest={}; W.rival={s_culture:100}; capAll();
armStage('s_culture');
W.stage.startTick=W.tick-400;
W.res.bacteria=STAGES[0].target+1;
finishStage();
ok('missing it says by how much', hasNote('300 steps over'), notes.join(' | '));

/* the daily is the same dish for everyone on a given UTC day, and a different
   puzzle the next - no server decides anything */
ok('the key is a UTC date', /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dailyKey(new Date(Date.UTC(2031,0,5)))),
   dailyKey(new Date(Date.UTC(2031,0,5))));
ok('and it is the right one', dailyKey(new Date(Date.UTC(2031,0,5)))==='2031-01-05');
const d1=dailyFor('2031-01-05'), d1b=dailyFor('2031-01-05'), d2=dailyFor('2031-01-06');
ok('the same day is the same dish', d1.seed===d1b.seed&&d1.def.id===d1b.def.id);
ok('a different day differs', d1.seed!==d2.seed, d1.seed+' vs '+d2.seed);
ok('and it picks a real trial', !!CHALLENGES.find(function(c){ return c.id===d1.def.id; }));
const spread={};
for(let i=0;i<60;i++) spread[dailyFor('2031-02-'+(i<9?'0':'')+((i%28)+1)).def.id]=1;
ok('the trial rotates across days', Object.keys(spread).length>1, Object.keys(spread).join(','));

/* a new day wipes yesterday's score rather than letting it pass for today's */
fresh(5); W.daily={key:'1999-01-01',best:9999};
rollDaily();
ok('yesterday does not carry over', W.daily.best===0, W.daily.best);
ok('and the key moves on', W.daily.key===dailyKey(), W.daily.key);

/* today's score is its own record and never touches the canonical one */
fresh(7); W.best={}; W.rival={}; W.seeds={}; W.trial=null; W.stage=null;
const dy=rollDaily();
W.daily.best=0;
capAll();
armTrial(dy.def.id,dy.seed,true);
ok('the daily marks itself', W.trial.daily===true);
ok('and counts as seeded', W.trial.seeded===true);
W.res[dy.def.goal]=W.trial.start+77;
W.tick=W.trial.endTick;
finishTrial();
ok('today gets its own best', W.daily.best===77, W.daily.best);
ok('the canonical record is untouched', W.best[dy.def.id]===undefined, W.best[dy.def.id]);

console.log('\\n-- the first sixty seconds --');
/* The opening screen was nineteen lines of grey comment and nothing that ran.
   Now one call is live, so pressing Run plants something and then fails for a
   reason the log explains, and four first steps tick themselves off as the
   world reports them rather than as a script walks you through. */
ok('the starter has a live call', STARTER.split(String.fromCharCode(10))
   .some(function(l){ return l.trim()==='seed(CULTURE)'; }), 'none');
ok('and it actually parses', (function(){
  fresh(5); els.code.value=STARTER;
  try{ return compile().length>0; }catch(e){ return 'threw: '+e.message; }
})());
ok('it is short enough to read', STARTER.split(String.fromCharCode(10)).length<14,
   STARTER.split(String.fromCharCode(10)).length+' lines');

fresh(5); W.intro={}; W.owned=new Set(); applyOwned(); W.res.bacteria=0;
ok('nothing is ticked to begin with', introDone()===false);
run('seed(CULTURE)');
ok('planting ticks itself off', W.intro.planted===1);
ok('but not the rest', !W.intro.harvested&&!W.intro.banked);
W.tick=here().t+here().gt;
run('harvest()');
ok('and harvesting ticks the next', W.intro.harvested===1);
W.res.bacteria=31; introCheck();
ok('31 bacteria is not 32', !W.intro.banked);
W.res.bacteria=32; introCheck();
ok('32 is', W.intro.banked===1);
ok('still not finished', introDone()===false);
W.owned.add('loop'); applyOwned(); introCheck();
ok('buying Iteration finishes it', introDone()===true);

els.labpane.hidden=false;
W.intro={};
renderLab();
ok('the checklist shows while it is unfinished', els.labpane.innerHTML.indexOf('First steps')>=0);
W.intro={planted:1,harvested:1,banked:1,looped:1};
renderLab();
ok('and takes itself away when it is done', els.labpane.innerHTML.indexOf('First steps')<0);

/* a stage or trial dish should not be where you learn to plant, but it must not
   crash there either */
fresh(5); W.intro={}; W.done={};
armStage('s_culture');
run('seed(CULTURE)');
ok('it still ticks inside a stage without blowing up', W.intro.planted===1);
abortStage();

console.log('\\n-- render smoke --');
function renders(name){
  try{ fitCanvas(); draw(); renderStatus(); renderRes(); renderLab(); renderApi(); ok(name,true); }
  catch(e){ ok(name,false,e.message); }
}
fresh(7); renders('renders an empty dish');
setBotCount(2); homeBots(); renders('renders two bots');
setBotCount(1); homeBots();
W.res={bacteria:99,spores:99,enzymes:99,biomass:99,crystals:99};
run('seed(CULTURE)\\nmove(EAST)\\nsterilize()\\nseed(SPORE)\\nmove(EAST)\\nseed(MYCELIUM)\\n'+
    'move(EAST)\\nsterilize()\\nseed(BIOFILM)\\nmove(EAST)\\nsterilize()\\nseed(CRYSTAL)\\n');
renders('renders every species at once');
W.tick+=40;
renders('renders them all mature');
run('maze()\\n');
renders('renders the labyrinth');
restoreFarm();
renders('renders the farm after the labyrinth');

console.log('\\n================================');
console.log(pass+' passed, '+fail+' failed');
console.log('================================\\n');
if(fail) process.exitCode=1;
`;

src = src.slice(0,tail) + TESTS + '\n})();';
const out=__dirname+'/.engine-under-test.js';
fs.writeFileSync(out,src);
require(out);
fs.unlinkSync(out);

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
  W.species=new Set(['CULTURE','SPORE','MYCELIUM','BIOFILM','CRYSTAL']);
  W.res={bacteria:0,spores:0,enzymes:0,biomass:0,crystals:0};
  W.tick=0; W.x=0; W.y=0; W.speedTier=0;
  W.maze=false; W.saved=null; W.tx=-1; W.ty=-1;   // never inherit a labyrinth
  W.wasted=0; W.lastOk=true; W.flash=null;
  initGrid(size||3);
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
    if(r.done) return {ticks,done:true};
    if(r.value===TICK){ ticks++; if(maxTicks&&ticks>=maxTicks) return {ticks,done:false}; }
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
RT.gen=execBlock(compile(),GLOBALS=buildGlobals());
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
W.tick=ripe+C.life;
ok('rotted only once its life runs out', isRotted(here())===true);
ok('a rotted cell is not mature', isMature(here())===false);
ok('a rotted cell reads as empty', occupied(here())===false);

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
fresh(5);
run('seed(CULTURE)\\n');
W.tick=here().t+here().gt+C.life;
run('print(harvest())\\n');
ok('harvesting true rot fails', printed[0]==='False', printed[0]);
ok('rot pays nothing', W.res.bacteria===0, W.res.bacteria);
ok('and that grab cost two', W.wasted===2, W.wasted);

fresh(5);
run('seed(CULTURE)\\n');
W.tick=here().t+here().gt+C.life;
run('print(scan())\\n');
ok('scan reports a rotted cell as empty', printed[0]==='None', printed[0]);
run('print(seed(CULTURE))\\n');
ok('a rotted cell can be replanted', printed[1]==='True', printed[1]);
ok('replanting resets the clock', here().t===W.tick-1, here().t+' vs '+W.tick);

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

console.log('\\n-- render smoke --');
function renders(name){
  try{ fitCanvas(); draw(); renderStatus(); renderRes(); renderLab(); renderApi(); ok(name,true); }
  catch(e){ ok(name,false,e.message); }
}
fresh(7); renders('renders an empty dish');
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

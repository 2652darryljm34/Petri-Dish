/* Petri Automaton - playable CLI against the real game engine.
   Lets an agent (or a person) play a full progression headlessly.

     node play.js --state s1.json reset
     node play.js --state s1.json api
     node play.js --state s1.json status
     node play.js --state s1.json peek
     node play.js --state s1.json run myprog.py 2000
     node play.js --state s1.json buy loop

   Each --state file is an independent save, so several players can run at once.
   Not shipped with the game. */
const fs=require('fs');
const path=require('path');

/* ---- args ---- */
const argv=process.argv.slice(2);
let stateFile=path.join(__dirname,'.play-state.json');
const si=argv.indexOf('--state');
if(si>=0){ stateFile=path.resolve(argv[si+1]); argv.splice(si,2); }
let engineFile=path.join(__dirname,'.engine-play.js');
const cmd=argv[0]||'status';

/* ---- DOM stubs ---- */
function elStub(id){
  const e={ id, value:'', innerHTML:'', textContent:'', hidden:false, disabled:false,
    checked:true, max:'11', width:0, height:0, scrollTop:0, scrollLeft:0, scrollHeight:0,
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
  body:elStub('body'),            // buy() raises a toast, which appends to document.body
  getElementById(id){return els[id]||(els[id]=elStub(id))},
  createElement(){return elStub('new')}, querySelectorAll(){return[]}, addEventListener(){} };
/* the toast also sets a 2s dismissal timer; don't let it hold the CLI open */
const _setTimeout=global.setTimeout;
global.setTimeout=function(fn,ms){ const t=_setTimeout(fn,ms); if(t&&t.unref) t.unref(); return t; };
global.window={addEventListener(){},devicePixelRatio:1};
global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>0;
/* the save file IS localStorage, so the game's own save()/load() do the work */
global.localStorage={
  getItem(){ try{ return fs.readFileSync(stateFile,'utf8'); }catch(e){ return null; } },
  setItem(k,v){ fs.writeFileSync(stateFile,v); },
  removeItem(){ try{ fs.unlinkSync(stateFile); }catch(e){} }
};
global.confirm=()=>true;
global.PLAY={cmd, args:argv.slice(1)};

/* ---- splice the CLI into the engine ---- */
const html=fs.readFileSync(path.join(__dirname,'game.html'),'utf8');
const m=html.match(/\n<script>\n([\s\S]*?)\n<\/script>/);
if(!m){ console.error('could not find the engine <script> in game.html'); process.exit(1); }
let src=m[1];
const tail=src.lastIndexOf('})();');

const CLI=`
/* ================= PLAY CLI ================= */
const CMD=PLAY.cmd, ARGS=PLAY.args;
const RES=['bacteria','spores','enzymes','biomass','crystals'];
function pad(x,n){ x=String(x); while(x.length<n) x+=' '; return x; }
function padl(x,n){ x=String(x); while(x.length<n) x=' '+x; return x; }
function known(r){
  const sp={bacteria:null,spores:'SPORE',enzymes:'MYCELIUM',biomass:'BIOFILM',crystals:'CRYSTAL'}[r];
  return sp===null||W.species.has(sp);
}
function featList(){
  const names={loop:'while loops',vars:'variables (= and +=)',cond:'if / elif / else',
    forloop:'for ... in range()',func:'def and lambda',lists:'lists, indexing, slicing, comprehensions',
    dicts:'dicts',measure:'measure() and swap()',sterile:'sterilize()',maze:'maze() and blocked()'};
  const out=[];
  for(const k in names) if(W.feats.has(k)) out.push(names[k]);
  return out;
}

function doStatus(){
  console.log('=== STATUS ===');
  console.log('dish '+W.size+'x'+W.size+(W.maze?' (LABYRINTH)':'')+'   bot at '+W.x+','+W.y+
              '   step '+W.tick+'   wasted '+W.wasted);
  console.log('resources: '+RES.map(r=>r+' '+(known(r)?W.res[r]:'-')).join('   '));
  console.log('language:  '+(featList().join(', ')||'nothing yet - only move/harvest/seed/sterilize/scan/print'));
  console.log('species:   '+Array.from(W.species).join(', '));
  const aff=[],poor=[];
  for(const t of TECH){
    if(W.owned.has(t.id)) continue;
    const cost=Object.keys(t.cost).map(k=>t.cost[k]+' '+k).join(' + ');
    (canAfford(t.cost)?aff:poor).push('  '+pad(t.id,9)+pad(t.nm,22)+cost);
  }
  if(aff.length){ console.log('--- you can buy now ---'); aff.forEach(l=>console.log(l)); }
  if(poor.length){ console.log('--- not yet affordable ---'); poor.forEach(l=>console.log(l)); }
  if(!aff.length&&!poor.length) console.log('--- tech tree complete ---');
}

function doPeek(){
  const legend=[];
  console.log('=== DISH '+W.size+'x'+W.size+' ===  bot @ '+W.x+','+W.y);
  for(let y=0;y<W.size;y++){
    let row='';
    for(let x=0;x<W.size;x++){
      const c=cell(x,y);
      let ch;
      if(c.w) ch='#';
      else if(W.maze&&x===W.tx&&y===W.ty) ch='$';
      else if(!occupied(c)) ch=(c.g==='sterile'?':':'.');
      else{
        const k=c.s[0].toLowerCase();
        if(!isMature(c)) ch=k;                       // still growing
        else if(freshness(c)>=1) ch=c.s[0];          // ripe, full value
        else ch='~';                                 // ripe but fading
      }
      if(x===W.x&&y===W.y) ch='['+ch+']'; else ch=' '+ch+' ';
      row+=ch;
    }
    console.log(row);
  }
  console.log('legend: . agar   : sterile   lowercase=growing   UPPERCASE=ripe   ~ fading   [x] bot');
  if(W.maze) console.log('        # wall   $ payload');
}

function doApi(){
  console.log('=== PETRI AUTOMATON ===');
  console.log('');
  console.log('You program a nanobot on a petri dish in PYTHON. Time in the dish only');
  console.log('moves when the bot acts: every call below costs one step unless marked FREE.');
  console.log('A harvest() that comes up empty costs TWO steps.');
  console.log('');
  console.log('ACTIONS (1 step each)');
  console.log('  move(dir)        dir is NORTH EAST SOUTH WEST. The dish wraps at its edges.');
  console.log('                   Returns False if something blocked it.');
  console.log('  harvest()        take the organism here if it is ripe. True if you got something.');
  console.log('  seed(SPECIES)    plant here. Needs an empty cell, the right substrate, and the cost.');
  console.log('  sterilize()      turn this cell STERILE. Destroys whatever is growing on it.');
  console.log('  scan()           the species here, or None');
  console.log('  mature()         True if the organism here is ready');
  console.log('  substrate()      AGAR or STERILE');
  console.log('  measure()        facet count of a CRYSTAL here (needs Crystal lattice)');
  console.log('  swap(dir)        exchange this cell with a neighbour (needs Crystal lattice)');
  console.log('  maze()           flood the dish into a labyrinth (needs Labyrinth assay)');
  console.log('  blocked(dir)     True if a wall stops you (needs Labyrinth assay)');
  console.log('');
  console.log('FREE (no step)');
  console.log('  pos_x() pos_y() dish_size() in_maze() num(RESOURCE) print(...)');
  console.log('  RESOURCE is one of BACTERIA SPORES ENZYMES BIOMASS CRYSTALS');
  console.log('');
  console.log('RIPENESS');
  console.log('  Some species do not wait forever. After ripening a cell pays full value for');
  console.log('  a while, then its payout ramps down to 1, then it rots and the cell is lost.');
  console.log('  Your lap length decides whether this bites: 3 steps per cell means a 5x5 dish');
  console.log('  is an 80-step round trip.');
  console.log('');
  console.log('SPECIES');
  for(const k in SPECIES){
    const s=SPECIES[k];
    const bits=[];
    bits.push(s.growVar?('ripens in '+s.growVar[0]+'-'+s.growVar[1]+' steps (varies per planting)')
                       :('ripens in '+s.grow+' steps'));
    bits.push(s.sterile?'needs STERILE':'any substrate');
    bits.push(s.cost?('costs '+Object.keys(s.cost).map(r=>s.cost[r]+' '+r).join(', ')+' to seed')
                    :'free to seed');
    if(s.fade) bits.push('full value '+s.peak+' steps, ramps to 1 over '+s.fade+', rots at '+s.life);
    else bits.push('never spoils');
    console.log('  '+pad(k,9)+(W.species.has(k)?'':'(LOCKED) ')+bits.join(' | '));
    console.log('           '+SPECIES_NOTE[k].replace(/<[^>]+>/g,''));
  }
  console.log('');
  console.log('REPEATING');
  console.log('  When your program reaches the end it starts again from the top, keeping the');
  console.log('  dish and the bot exactly where they were. A straight-line script is therefore');
  console.log('  already a loop - that is how you play before you can afford while loops.');
  console.log('  "run" reports how many times it restarted.');
  console.log('');
  console.log('WHAT YOU CAN USE RIGHT NOW');
  console.log('  calls:    '+['move','harvest','seed','sterilize','scan','mature','substrate',
                'pos_x','pos_y','dish_size','num','print']
                .concat(W.feats.has('sterile')?[]:[]).join(' '));
  console.log('  language: '+(featList().join(', ')||'NOTHING beyond straight-line calls - no variables,'+
              ' no if, no loops. Those are tech-tree purchases (see below).'));
  console.log('  Using a locked feature is an error telling you which one to buy.');
  console.log('');
  console.log('LANGUAGE (the full set, once unlocked)');
  console.log('  Real Python: if/elif/else, while, for..in range(), def with defaults and');
  console.log('  keyword args, lambda, list/dict comprehensions, tuples and unpacking, slicing,');
  console.log('  f-strings, chained comparisons, global, list/dict/str methods.');
  console.log('  NOT supported: classes, import, try/except, sets, generators.');
  console.log('  int and float are one type, so 4/2 prints 2 rather than 2.0.');
  console.log('  Parts of the language are LOCKED until you buy them in the tech tree -');
  console.log('  using a locked feature is a clear error telling you what to unlock.');
  console.log('');
  console.log('TECH TREE (buy with: node play.js buy <id>)');
  let grp=null;
  for(const t of TECH){
    if(t.g!==grp){ grp=t.g; console.log('  ['+grp+']'); }
    const cost=Object.keys(t.cost).map(k=>t.cost[k]+' '+k).join(' + ');
    console.log('    '+pad(t.id,9)+pad(t.nm,22)+pad(cost,20)+(W.owned.has(t.id)?'OWNED':''));
  }
}

/* in-game errors say "the Lab panel"; from the CLI that is a buy command */
function cliHint(msg){
  if(!/Lab panel|not unlocked/.test(msg)) return '';
  const ids=TECH.filter(t=>!W.owned.has(t.id)).map(t=>t.id).join(' ');
  return '\\n  (in this CLI, unlock with: node play.js buy <id> \\u2014 available ids: '+ids+')';
}
function doRun(){
  const file=ARGS[0];
  const cap=ARGS[1]?parseInt(ARGS[1],10):2000;
  if(!file){ console.log('usage: run <program.py> [maxSteps]'); return; }
  let code;
  try{ code=require('fs').readFileSync(file,'utf8'); }
  catch(e){ console.log('cannot read '+file); return; }

  const before=Object.assign({},W.res);
  const tick0=W.tick, waste0=W.wasted;
  els.code.value=code;
  const out=[];
  let ast;
  try{ ast=compile(); }
  catch(e){
    console.log('=== RUN '+file+' ===');
    console.log('SYNTAX ERROR on line '+(e.line||'?')+': '+e.message+cliHint(e.message));
    return;
  }
  GLOBALS=buildGlobals();
  GLOBALS.set('print',{__pure:function(){
    out.push(Array.prototype.slice.call(arguments).map(fmt).join(' '));
    return null;
  }});
  let g=execBlock(ast,GLOBALS), ticks=0, guard=0, err=null, restarts=0, done=false;
  while(ticks<cap){
    if(++guard>cap*3000+2000000){ err='program computed for a very long time without acting'; break; }
    let r;
    try{ r=g.next(); }
    catch(e){ err=(e.line?('line '+e.line+': '):'')+e.message; break; }
    if(r.done){
      if(++restarts>100000){ done=true; break; }
      GLOBALS=buildGlobals();
      GLOBALS.set('print',{__pure:function(){
        out.push(Array.prototype.slice.call(arguments).map(fmt).join(' '));
        return null;
      }});
      g=execBlock(ast,GLOBALS);
      continue;
    }
    if(r.value===TICK) ticks++;
  }
  save();
  console.log('=== RUN '+file+' ===');
  const used=W.tick-tick0, waste=W.wasted-waste0;
  console.log('steps used: '+used+'    wasted: '+waste+
              (used?('    ('+(100*waste/used).toFixed(1)+'% of steps did nothing)'):'')+
              '    program restarts: '+restarts);
  if(err) console.log('ERROR: '+err+cliHint(err));
  else if(done) console.log('program finished and stopped restarting');
  else console.log('stopped at the '+cap+'-step cap (program was still going)');
  let any=false;
  for(const r of RES){
    const d=W.res[r]-before[r];
    if(!d) continue;
    any=true;
    console.log('  '+pad(r,9)+padl((d>0?'+':'')+d,8)+'   '+(used?(d/used).toFixed(4)+' per step':''));
  }
  if(!any) console.log('  no resources gained or spent');
  if(out.length){
    console.log('output ('+out.length+' lines'+(out.length>25?', first 25':'')+'):');
    out.slice(0,25).forEach(l=>console.log('  '+l));
  }
}

function doBuy(){
  const id=ARGS[0];
  const t=TECH.find(x=>x.id===id);
  if(!t){ console.log('no such tech id: '+id+'   (see: node play.js api)'); return; }
  if(W.owned.has(id)){ console.log(t.nm+' is already owned'); return; }
  if(!canAfford(t.cost)){
    console.log('cannot afford '+t.nm+' - needs '+Object.keys(t.cost).map(k=>t.cost[k]+' '+k).join(' + ')+
                ', you have '+Object.keys(t.cost).map(k=>W.res[k]+' '+k).join(' + '));
    return;
  }
  buy(t);
  save();
  console.log('bought '+t.nm+'.');
  if(t.feat) console.log('  unlocked language feature: '+t.feat);
  if(t.species) console.log('  unlocked species: '+t.species);
  if(t.size) console.log('  dish is now '+W.size+'x'+W.size);
  if(t.speed) console.log('  actuator tier is now '+W.speedTier);
  console.log('  remaining: '+RES.filter(known).map(r=>W.res[r]+' '+r).join('   '));
}

function doReset(){
  W.owned=new Set();
  W.res={bacteria:0,spores:0,enzymes:0,biomass:0,crystals:0};
  W.tick=0; W.x=0; W.y=0; W.wasted=0; W.lastOk=true; W.flash=null;
  W.maze=false; W.saved=null; W.tx=-1; W.ty=-1;
  applyOwned(); initGrid(5); W.px=0; W.py=0;
  els.code.value='';
  save();
  console.log('new game: 5x5 dish, nothing unlocked, no resources.');
  console.log('run "node play.js api" for the rules.');
}

switch(CMD){
  case 'status': doStatus(); break;
  case 'peek': doPeek(); break;
  case 'api': doApi(); break;
  case 'run': doRun(); break;
  case 'buy': doBuy(); break;
  case 'reset': doReset(); break;
  case 'board': resetBoard(); doPeek(); break;
  default:
    console.log('commands: reset | api | status | peek | board | run <file.py> [steps] | buy <id>');
    console.log('  board = clear the dish and send the bot home, keeping resources and unlocks');
}
`;

fs.writeFileSync(engineFile+'.'+process.pid+'.js', src.slice(0,tail)+CLI+'\n})();');
const tmp=engineFile+'.'+process.pid+'.js';
try{ require(tmp); } finally { try{ fs.unlinkSync(tmp); }catch(e){} }

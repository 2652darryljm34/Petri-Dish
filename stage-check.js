/* Are the curriculum stages actually clearable?

   Stages hand out no resources: you arrive with an empty dish and an empty
   ledger and have to grow everything you spend. That is the point, but it also
   means a stage can be set to a target the dish cannot physically reach, and
   nothing else in the tooling would notice. This runs a reference program a
   competent player could write against each stage and reports how far it got.

   The last case is the one that matters most: the naive snake used to clear the
   mycelium stage on its own, because with spores you cannot run out of, a fully
   planted torus always leaves a harvested cell two ripe neighbours. It must
   fail now.

     sed -n '/^<script>$/,/^<\/script>$/p' game.html | sed '1d;$d' > /tmp/eng.js
     node stage-check.js /tmp/eng.js

   Reference programs live in stages/. They are deliberately unoptimised - the
   step counts below are an upper bound, not a par.
*/
const fs=require('fs'), path=require('path');

/* --- the same headless DOM the test harness boots the engine against --- */
const harness=fs.readFileSync(path.join(__dirname,'test-harness.js'),'utf8');
const cut=harness.indexOf('/* splice test code inside the engine IIFE */');
if(cut<0){ console.error('test-harness.js changed shape; cannot borrow its stubs'); process.exit(1); }
const stubPath=path.join(__dirname,'.stage-check-stubs.js');
fs.writeFileSync(stubPath, harness.slice(0,cut));
require(stubPath);

const ENG=process.argv[2];
if(!ENG){ console.error('usage: node stage-check.js <engine.js>'); process.exit(1); }

/* stage, program, tick budget, and whether it is supposed to clear */
const CASES=[
  ['s_culture','stages/s_culture.py',   5000, true ],
  ['s_sterile','stages/s_sterile.py',  10000, true ],
  ['s_myc',    'stages/s_myc.py',      20000, true ],
  ['s_bio',    'stages/s_bio.py',      60000, true ],
  ['s_cryst',  'stages/s_cryst.py',    30000, true ],
  ['s_strand', 'stages/s_strand.py',  200000, true ],
  ['s_myc',    'stages/naive-snake.py',30000, false],
];

function attempt(stage, progPath, budget){
  const prog=fs.readFileSync(path.join(__dirname,progPath),'utf8');
  let src=fs.readFileSync(ENG,'utf8');
  const tail=src.lastIndexOf('})();');
  const DRIVE=`
    for(const t of TECH) W.owned.add(t.id);
    applyOwned(); setBotCount(1);
    W.done={}; for(const st of STAGES){ if(st.id===${JSON.stringify(stage)}) break; W.done[st.id]=1; }
    armStage(${JSON.stringify(stage)});
    els.code.value=${JSON.stringify(prog)};
    let out={err:null,done:false};
    try{
      const ast=compile();
      GLOBALS=buildGlobals();
      const g=execBlock(ast,GLOBALS);
      let ticks=0, guard=0;
      while(ticks<${budget}){
        let r;
        try{ r=g.next(); }catch(e){ out.err=e.message; break; }
        if(r.done) break;
        if(r.value===TICK){
          ticks++; W.tick++;
          const pr=stageProgress();
          if(pr.now>=pr.target){ out.done=true; break; }
        }
        if(++guard>40000000){ out.err='runaway'; break; }
      }
    }catch(e){ out.err=e.message; }
    const pr=stageProgress();
    out.now=pr.now; out.target=pr.target; out.steps=W.tick; out.wasted=W.wasted;
    const sd=STAGES.find(function(x){ return x.id===${JSON.stringify(stage)}; });
    out.par=sd?sd.par:0;
    global.__STAGE_RESULT=out;
  `;
  const file=path.join(__dirname,'.stage-check-run.js');
  fs.writeFileSync(file, src.slice(0,tail) + DRIVE + '\n})();');
  delete require.cache[require.resolve(file)];
  require(file);
  return global.__STAGE_RESULT;
}

let fail=0;
console.log('\n  stage        program              result        steps   wasted     par');
console.log('  ' + '-'.repeat(78));
for(const [stage,prog,budget,shouldClear] of CASES){
  const r=attempt(stage,prog,budget);
  const good = r.done===shouldClear && !r.err;
  if(!good) fail++;
  console.log('  ' +
    stage.padEnd(12) +
    path.basename(prog).padEnd(21) +
    (r.done?'cleared':r.now+'/'+r.target).padEnd(14) +
    String(r.steps).padStart(7) +
    String(Math.round(100*r.wasted/Math.max(1,r.steps))+'%').padStart(9) +
    (good?'':'   <-- expected ' + (shouldClear?'a clear':'no clear')) +
    String(r.par||'-').padStart(8) +
    /* par is shown to the player, so it has to keep tracking the program here */
    ((shouldClear&&r.par&&Math.abs(r.steps-r.par)/r.par>0.2)?'  <-- par has drifted':'') +
    (r.err?'   ERR '+r.err:''));
}
console.log('  ' + '-'.repeat(78));
console.log(fail ? '\n  '+fail+' case(s) off expectation\n' : '\n  all stages behave as designed\n');
try{ fs.unlinkSync(stubPath); fs.unlinkSync(path.join(__dirname,'.stage-check-run.js')); }catch(e){}
process.exit(fail?1:0);

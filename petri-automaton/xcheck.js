/* Cross-check the conformance suite's expectations against real CPython.
   Run: node xcheck.js   (needs python on PATH). Not shipped. */
const {execFileSync}=require('child_process');
const fs=require('fs');
const path=require('path');

const txt=fs.readFileSync(__dirname+'/python-tests.js','utf8');
const m=txt.match(/const CASES=\[([\s\S]*?)\n\];/);
if(!m){ console.error('could not find CASES'); process.exit(1); }
const CASES=eval('['+m[1]+']');

let py='';
for(const c of CASES) py+='print("=== '+c[0]+'")\n'+c[1]+'\n';
const casefile=path.join(__dirname,'.cases.py');
fs.writeFileSync(casefile,py);

let out;
try{ out=execFileSync('python',[casefile],{encoding:'utf8'}); }
catch(e){
  console.log('python failed:\n'+(e.stdout||'')+(e.stderr||''));
  process.exit(1);
}
fs.unlinkSync(casefile);

const blocks={};
let cur=null;
for(const line of out.replace(/\r/g,'').split('\n')){
  const h=/^=== (.*)$/.exec(line);
  if(h){ cur=h[1]; blocks[cur]=[]; continue; }
  if(cur!==null) blocks[cur].push(line);
}

let ok=0, bad=0;
for(const c of CASES){
  const got=(blocks[c[0]]||[]).join('\n').replace(/\n+$/,'');
  if(got===c[2]) ok++;
  else{
    bad++;
    console.log('MISMATCH  '+c[0]);
    console.log('   my expectation: '+JSON.stringify(c[2]));
    console.log('   real CPython:   '+JSON.stringify(got));
  }
}
console.log('\n'+ok+' of '+(ok+bad)+' expectations match real CPython');
if(bad) process.exitCode=1;

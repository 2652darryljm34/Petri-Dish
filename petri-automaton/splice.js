/* Swap the language core and evaluator regions of game.html for new files.
   Region boundaries are the banner comments in the engine. Not shipped. */
const fs=require('fs');
const P=__dirname+'/game.html';
let src=fs.readFileSync(P,'utf8');

function swap(startMark,endMark,file){
  const a=src.indexOf(startMark);
  const b=src.indexOf(endMark);
  if(a<0) throw new Error('start marker not found: '+startMark.slice(0,40));
  if(b<0) throw new Error('end marker not found: '+endMark.slice(0,40));
  if(b<=a) throw new Error('markers out of order for '+file);
  const body=fs.readFileSync(__dirname+'/'+file,'utf8').replace(/\s+$/,'')+'\n\n';
  src=src.slice(0,a)+body+src.slice(b);
  console.log('replaced '+(b-a)+' chars with '+body.length+' from '+file);
}

swap('/* ---------- errors ---------- */',
     '/* ============================================================\n   WORLD',
     'lang1.js');
swap('/* --- pure builtins (free, no tick) --- */',
     '/* ============================================================\n   DRIVER',
     'lang2.js');

fs.writeFileSync(P,src);
console.log('game.html now '+src.length+' chars');

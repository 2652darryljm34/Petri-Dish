/* Python conformance suite. Each case is a program plus the exact text
   CPython prints for it. Run: node python-tests.js <extracted-engine.js>
   Verify expectations with: python python-tests.js --emit > cases.py
   Not shipped. */
const fs=require('fs');

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
  getElementById(id){return els[id]||(els[id]=elStub(id))},
  createElement(){return elStub('new')}, querySelectorAll(){return[]}, addEventListener(){} };
global.window={addEventListener(){},devicePixelRatio:1};
global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>0;
global.localStorage={getItem(){return null},setItem(){},removeItem(){}};

/* ---- the cases: [label, source, expected stdout] ---- */
const CASES=[
['int arithmetic','print(2+3*4, 10-3, 7*6)','14 7 42'],
['floor div and mod','print(7//2, -7//2, 7%3, -7%3)','3 -4 1 2'],
['power','print(2**10, 2**0.5)','1024 1.4142135623730951'],
['comparison chain','x=5\nprint(0 <= x < 10, 0 < x < 5)','True False'],
['chain evaluates once','print(1 < 2 < 3 < 4)','True'],
['bool is int','print(True+True, False*5)','2 0'],
['string ops','s="ab"\nprint(s*3, s+"c", len(s))','ababab abc 2'],
['string index','s="hello"\nprint(s[0], s[-1], s[1:3], s[::-1])','h o el olleh'],
['list slicing','a=[0,1,2,3,4,5]\nprint(a[2:], a[:2], a[1:5:2], a[::-1])','[2, 3, 4, 5] [0, 1] [1, 3] [5, 4, 3, 2, 1, 0]'],
['negative slice','a=[0,1,2,3,4]\nprint(a[-2:], a[:-2])','[3, 4] [0, 1, 2]'],
['tuple literal','t=(1,2,3)\nprint(t, len(t), t[1])','(1, 2, 3) 3 2'],
['one-tuple repr','print((5,))','(5,)'],
['empty tuple','print(())','()'],
['tuple unpack','a,b = 1,2\nprint(a,b)','1 2'],
['swap via tuple','a,b = 1,2\na,b = b,a\nprint(a,b)','2 1'],
['nested unpack','(a,(b,c)) = (1,(2,3))\nprint(a,b,c)','1 2 3'],
['chained assign','x = y = 7\nprint(x,y)','7 7'],
['aug assign','x=10\nx+=5\nx*=2\nx//=3\nprint(x)','10'],
/* print evaluates every argument before formatting any of them, and both
   references are the same list object, so CPython shows the popped state twice */
['list methods','a=[3,1,2]\na.append(4)\na.sort()\nprint(a, a.pop(), a)','[1, 2, 3] 4 [1, 2, 3]'],
['list remove/insert','a=[1,2,3]\na.insert(1,9)\na.remove(3)\nprint(a)','[1, 9, 2]'],
['sort with key','a=["ccc","a","bb"]\na.sort(key=len)\nprint(a)',"['a', 'bb', 'ccc']"],
['sorted reverse','print(sorted([3,1,2], reverse=True))','[3, 2, 1]'],
['sorted key lambda','print(sorted([1,-5,3], key=lambda v: abs(v)))','[1, 3, -5]'],
['list comprehension','print([x*x for x in range(5)])','[0, 1, 4, 9, 16]'],
['comprehension with if','print([x for x in range(10) if x%3==0])','[0, 3, 6, 9]'],
['nested comprehension','print([(x,y) for x in range(2) for y in range(2)])','[(0, 0), (0, 1), (1, 0), (1, 1)]'],
['dict comprehension','print({x: x*x for x in range(3)})','{0: 0, 1: 1, 2: 4}'],
['dict basics','d={"a":1}\nd["b"]=2\nprint(d, len(d), d.get("z", 0))',"{'a': 1, 'b': 2} 2 0"],
['dict items loop','d={"a":1,"b":2}\nfor k,v in d.items():\n    print(k,v)','a 1\nb 2'],
['dict keys/values','d={"a":1,"b":2}\nprint(d.keys(), d.values())',"dict_keys(['a', 'b']) dict_values([1, 2])"],
['dict view is iterable','d={"a":1,"b":2}\nprint(sorted(d.keys()), list(d.values()))',"['a', 'b'] [1, 2]"],
['in operator','print(2 in [1,2], 5 in [1,2], "a" in "cat", "z" not in "cat")','True False True True'],
['list equality','print([1,2]==[1,2], [1,2]==[2,1], (1,2)==[1,2])','True False False'],
['enumerate','for i,c in enumerate("ab"):\n    print(i,c)','0 a\n1 b'],
['enumerate start','print(list(enumerate([9,8], 1)))','[(1, 9), (2, 8)]'],
['zip','print(list(zip([1,2],["a","b"])))',"[(1, 'a'), (2, 'b')]"],
['f-string','n=3\nprint(f"n={n} sq={n*n}")','n=3 sq=9'],
['f-string precision','print(f"{3.14159:.2f}")','3.14'],
['f-string width','print(f"[{7:4}]")','[   7]'],
['f-string expr','a=[1,2]\nprint(f"{len(a)} {a[0]+1}")','2 2'],
['f-string braces','print(f"{{literal}}")','{literal}'],
['f-string zero pad','print(f"{42:05d}", f"{-5:04d}", f"{3.5:08.2f}")','00042 -005 00003.50'],
['f-string conversions','name="hi"\nprint(f"{name!r} {name!s}")',"'hi' hi"],
['mutable default arg','def f(a, b=[]):\n    b.append(a)\n    return b\nprint(f(1))\nprint(f(2))','[1]\n[1, 2]'],
['default evaluated once','n = 5\ndef f(x=n):\n    return x\nn = 99\nprint(f())','5'],
['comprehension no leak','xs=[1,2,3]\ny=99\nsq=[y*y for y in xs]\nprint(sq, y)','[1, 4, 9] 99'],
['ternary','x=5\nprint("big" if x>3 else "small")','big'],
['try no error','try:\n    print(1)\nexcept:\n    print(2)','1'],
['try catches','try:\n    print(1/0)\nexcept:\n    print("caught")','caught'],
['except by name','try:\n    a=[1]\n    print(a[9])\nexcept IndexError:\n    print("idx")','idx'],
['except wrong name falls through','try:\n    try:\n        print(1/0)\n    except IndexError:\n        print("no")\nexcept ZeroDivisionError:\n    print("yes")','yes'],
['except as binds the message','try:\n    print(zzz)\nexcept NameError as e:\n    print(e)',"name 'zzz' is not defined"],
['finally always runs','try:\n    print(1/0)\nexcept:\n    print("c")\nfinally:\n    print("f")','c\nf'],
['try else runs when clean','try:\n    x=1\nexcept:\n    print("no")\nelse:\n    print("clean")','clean'],
['raise is catchable','try:\n    raise ValueError("boom")\nexcept ValueError as e:\n    print(e)','boom'],
['loop survives with try','t=0\nfor i in range(5):\n    try:\n        t += 10 // (i - 2)\n    except ZeroDivisionError:\n        t += 100\nprint(t)','100'],
['lambda','f = lambda a,b: a+b\nprint(f(2,3))','5'],
['default args','def g(a, b=10):\n    return a+b\nprint(g(1), g(1,2))','11 3'],
['keyword args','def g(a, b=0, c=0):\n    return a*100+b*10+c\nprint(g(1, c=3))','103'],
['recursion','def f(n):\n    return 1 if n<2 else n*f(n-1)\nprint(f(6))','720'],
['closure over global','n = 0\ndef bump():\n    global n\n    n += 1\nbump()\nbump()\nprint(n)','2'],
['local shadows global','n = 5\ndef f():\n    n = 9\n    return n\nprint(f(), n)','9 5'],
['while else','i=0\nwhile i<3:\n    i+=1\nelse:\n    print("done", i)','done 3'],
['for else','for i in range(3):\n    pass\nelse:\n    print("ok")','ok'],
['break skips else','for i in range(3):\n    break\nelse:\n    print("no")\nprint("after")','after'],
['any all','print(any([0,1]), all([1,1]), all([]), any([]))','True True True False'],
['min max key','print(min([3,1,2]), max("a","bb",key=len))','1 bb'],
['sum','print(sum([1,2,3]), sum([1,2], 10))','6 13'],
['abs round','print(abs(-4), round(3.456, 2), round(2.5))','4 3.46 2'],
['str methods','s=" Ab,cD "\nprint(s.strip().lower(), "x".join(["a","b"]), "a,b".split(","))',"ab,cd axb ['a', 'b']"],
['str replace/find','print("hello".replace("l","L"), "hello".find("ll"), "ab".upper())','heLLo 2 AB'],
['startswith','print("hello".startswith("he"), "hello".endswith("lo"))','True True'],
['multiple statements','a=1; b=2; print(a+b)','3'],
['implicit str concat','print("ab" "cd")','abcd'],
['nested data','d={"xs":[1,2,3]}\nprint(d["xs"][1], len(d["xs"]))','2 3'],
['list of lists mutate','g=[[0,0],[0,0]]\ng[1][0]=5\nprint(g)','[[0, 0], [5, 0]]'],
['reversed','print(list(reversed([1,2,3])))','[3, 2, 1]'],
['map filter','print(list(map(lambda x:x*2,[1,2])), list(filter(lambda x:x>1,[1,2,3])))','[2, 4] [2, 3]'],
['None handling','x=None\nprint(x, x is None, x == None)','None True True'],
['truthiness','print(bool(0), bool(""), bool([]), bool([0]))','False False False True'],
['int str float','print(int("42"), str(42), int(3.9), float("1.5"))','42 42 3 1.5'],
['type names','print(type(1), type("a"), type([]), type((1,)), type({}))',"<class 'int'> <class 'str'> <class 'list'> <class 'tuple'> <class 'dict'>"]
];

const ERRCASES=[
['undefined name','print(zzz)',"NameError: name 'zzz' is not defined"],
['index out of range','a=[1]\nprint(a[3])','IndexError: list index out of range'],
['key error','d={}\nprint(d["k"])',"KeyError: 'k'"],
['zero division','print(1/0)','ZeroDivisionError: division by zero'],
['type error add','print(1 + "a")',"TypeError: unsupported operand type(s) for +: 'int' and 'str'"],
['tuple immutable','t=(1,2)\nt[0]=5',"TypeError: 'tuple' object does not support item assignment"],
['bad attribute',"a=[1]\na.nope()","AttributeError: 'list' object has no attribute 'nope'"],
['not callable','x=5\nx()',"TypeError: 'int' object is not callable"],
['unpack mismatch','a,b = [1,2,3]','ValueError: too many values to unpack (expected 2)'],
['unpack too few','a,b,c = [1,2]','ValueError: not enough values to unpack (expected 3, got 2)'],
['missing arg','def f(a):\n    return a\nf()',"TypeError: f() missing 1 required positional argument: 'a'"],
['missing two args','def f(a,b,c):\n    return a\nf(1)',"TypeError: f() missing 2 required positional arguments: 'b' and 'c'"],
['comprehension scope','xs=[1,2,3]\nsq=[x*x for x in xs]\nprint(x)',"NameError: name 'x' is not defined"],
['big int overflow','print(2**100)','OverflowError: whole numbers above 9007199254740991 lose precision here (real Python has unlimited integers, this game does not)'],
['generator expression','g = (x*x for x in range(3))','SyntaxError: generator expressions are not supported — use a list comprehension [ x for x in ... ] instead'],
['class statement','class Foo:\n    pass','SyntaxError: classes are not supported in this game’s Python'],
['import statement','import math','SyntaxError: imports are not supported in this game’s Python'],
['try with no handler','try:\n    pass','SyntaxError: this “try” needs an “except” or a “finally”'],
['unhandled raise propagates','raise ValueError("nope")','ValueError: nope'],
['except does not swallow other errors','try:\n    print(zzz)\nexcept IndexError:\n    print("no")',"NameError: name 'zzz' is not defined"],
['set literal','s = {1,2,3}','SyntaxError: set literals are not supported — use a list [ ] or a dict { key: value }'],
['star args','def f(*a):\n    return a','SyntaxError: *args and **kwargs are not supported'],
['starred unpack','a, *rest = [1,2,3]','SyntaxError: starred unpacking (a, *rest = ...) is not supported'],
['walrus','x = (y := 5)','SyntaxError: the walrus operator := is not supported'],
['slice assignment','a=[1,2,3]\na[0:2] = [9]','SyntaxError: assigning to a slice is not supported — assign one index at a time'],
['too many args','def f(a):\n    return a\nf(1,2)','TypeError: f() takes 1 positional argument but 2 were given'],
['bad kwarg','def f(a):\n    return a\nf(1, z=2)',"TypeError: f() got an unexpected keyword argument 'z'"],
['unterminated string','print("abc)','SyntaxError: unterminated string literal'],
['bad indent','print(1)\n    print(2)','IndentationError: unexpected indent'],
['not iterable','for x in 5:\n    pass',"TypeError: 'int' object is not iterable"],
['dict view not indexable','d={"a":1}\nd.keys()[0]',"TypeError: 'dict_keys' object is not subscriptable"]
];

if(process.argv.indexOf('--emit')>=0){
  let out='';
  for(const c of CASES) out+='print("=== '+c[0]+'")\n'+c[1]+'\n';
  console.log(out);
  process.exit(0);
}

let src=fs.readFileSync(process.argv[2],'utf8');
const tail=src.lastIndexOf('})();');

const RUNNER=`
const ALLF=['loop','vars','cond','forloop','func','lists','dicts','measure','sterile','maze','slicing','comprehensions','higher','errors'];
const CASES=${JSON.stringify(CASES)};
const ERRCASES=${JSON.stringify(ERRCASES)};
let pass=0, fail=0;
const out=[];
function exec(srcTxt){
  out.length=0;
  W.feats=new Set(ALLF);
  W.species=new Set(['CULTURE','SPORE','MYCELIUM','BIOFILM','CRYSTAL']);
  W.res={bacteria:0,spores:0,enzymes:0,biomass:0,crystals:0};
  W.tick=0; W.x=0; W.y=0; initGrid(5);
  els.code.value=srcTxt;
  const ast=compile();
  GLOBALS=buildGlobals();
  GLOBALS.set('print',{__pure:function(){
    out.push(Array.prototype.slice.call(arguments).map(fmt).join(' '));
    return null;
  }});
  const g=execBlock(ast,GLOBALS);
  let n=0;
  while(true){ const r=g.next(); if(r.done) break; if(++n>3000000) throw new Error('did not terminate'); }
  return out.join('\\n');
}
console.log('\\n  PYTHON CONFORMANCE\\n');
for(const c of CASES){
  let got;
  try{ got=exec(c[1]); }
  catch(e){ got='!! '+(e.message||e); }
  if(got===c[2]){ pass++; console.log('  ok   '+c[0]); }
  else{
    fail++;
    console.log('  FAIL '+c[0]);
    console.log('         expected: '+JSON.stringify(c[2]));
    console.log('         got:      '+JSON.stringify(got));
  }
}
console.log('\\n  PYTHON ERROR MESSAGES\\n');
for(const c of ERRCASES){
  let got='(no error)';
  try{ exec(c[1]); }
  catch(e){ got=e.message||String(e); }
  if(got===c[2]){ pass++; console.log('  ok   '+c[0]); }
  else{
    fail++;
    console.log('  FAIL '+c[0]);
    console.log('         expected: '+JSON.stringify(c[2]));
    console.log('         got:      '+JSON.stringify(got));
  }
}
console.log('\\n  '+pass+' passed, '+fail+' failed\\n');
if(fail) process.exitCode=1;
`;

src=src.slice(0,tail)+RUNNER+'\n})();';
const outf=__dirname+'/.py-run.js';
fs.writeFileSync(outf,src);
require(outf);
fs.unlinkSync(outf);

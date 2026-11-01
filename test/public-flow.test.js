import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildPages } from '../src/pages.mjs';

const script=await readFile(new URL('../static/script.js',import.meta.url),'utf8');
test('estimator static default values equal the first hydrated calculation for every output',()=>{
 const html=buildPages().find(([file])=>file==='how-it-works.html')[1];
 const nodes=new Map();
 for(const match of html.matchAll(/data-(out-[a-z-]+|est-(?:arv|months)-out)>([^<]*)</g))nodes.set(`[data-${match[1]}]`,{textContent:match[2]});
 for(const key of ['arv','months'])nodes.set(`[data-est-${key}]`,{value:html.match(new RegExp('value="([0-9]+)" data-est-'+key))[1],addEventListener(){}});
 nodes.set('[data-est-repairs]',{value:html.match(/<option value="([0-9]+)" selected>Moderate/)[1],addEventListener(){}});
 const before=new Map([...nodes].filter(([,node])=>'textContent' in node).map(([key,node])=>[key,node.textContent]));
 const code=script.slice(script.indexOf("document.querySelectorAll('[data-net-estimator]')"),script.indexOf('const formProps ='));
 vm.runInNewContext(code,{document:{querySelectorAll:()=>[{querySelector:key=>nodes.get(key)}]},say:en=>en,track(){throw new Error('Initial hydration must not track interaction');}});
 assert.ok(before.size>=13);
 for(const [key,value] of before)assert.equal(nodes.get(key).textContent,value,`Default changed on hydration: ${key}`);
});

test('stepped form Back clears unrelated errors while preserving choices and interrupted progress',()=>{
 const handlers={};let selected=false;
 const field=(value='')=>({value,tagName:'INPUT',focus(){},_classes:new Set(),classList:{add(c){this.owner._classes.add(c);},remove(c){this.owner._classes.delete(c);}}});
 const address=field();address.classList.owner=address;
 const radio={type:'radio',focus(){}};
 const group={tagName:'DIV',querySelector:()=>selected?radio:null,classList:{add(){},remove(){}}};
 const status={className:'form-status',textContent:'',classList:{add(){status.className+=' error';}}};
 const steps=[0,1,2].map((i)=>({hidden:i!==0,querySelector(selector){if(selector==='[name=address]')return i===1?address:null;if(selector==='[name=street]'||selector==='[name=city]'||selector==='[name=zip]'||selector==='select')return null;return i===0?radio:address;},querySelectorAll:selector=>i===0?[group]:[]}));
 const form={dataset:{},closest:()=>null,addEventListener:(name,fn)=>handlers[name]=fn,querySelectorAll:selector=>selector==='.fstep'?steps:selector==='.step-dots li'?[]:selector==='.invalid'&&address._classes.has('invalid')?[address]:[],querySelector:selector=>selector==='.form-status'?status:selector==='.fstep:not([hidden]) [data-next]'?{click:()=>click('next')}:null};
 const click=kind=>handlers.click({target:{closest:selector=>selector===`[data-${kind}]`?{}:null}});
 const code=script.slice(script.indexOf("document.querySelectorAll('form[data-steps]')"),script.indexOf('// ---------- Lead forms ----------'));
 vm.runInNewContext(code,{document:{querySelectorAll:()=>[form]},say:en=>en,formProps:()=>({}),track(){},setTimeout});
 selected=true;click('next');assert.equal(steps[1].hidden,false);
 for(let i=0;i<2;i++) {
  click('next');assert.match(status.textContent,/address/);assert.ok(address._classes.has('invalid'));
  click('back');assert.equal(steps[0].hidden,false);assert.equal(status.textContent,'');assert.equal(status.className,'form-status');assert.equal(address._classes.has('invalid'),false);assert.equal(selected,true);
  click('next');assert.equal(steps[1].hidden,false);
 }
 let prevented=false;handlers.keydown({key:'Enter',target:address,preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.match(status.textContent,/address/);
 click('back');assert.equal(status.textContent,'');click('next');address.value='101 Synthetic Example Ave';click('next');assert.equal(steps[2].hidden,false);
 click('back');assert.equal(address.value,'101 Synthetic Example Ave');assert.equal(status.textContent,'');click('next');assert.equal(steps[2].hidden,false);
});

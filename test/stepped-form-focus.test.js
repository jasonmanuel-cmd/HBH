import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../static/script.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('// ---------- Stepped forms ----------'),source.indexOf('// ---------- Lead forms ----------'));
function fixture(){
 const events=[], handlers={};
 const input={tagName:'INPUT',value:'',classList:{add(){}},focus:o=>events.push(['focus',o]),scrollIntoView:o=>events.push(['scroll',o])};
 const step={querySelector:s=>s==='[name=street]'||s.startsWith('input:not')?input:null,querySelectorAll:()=>[]};
 const form={dataset:{},querySelectorAll:s=>s==='.fstep'?[step,{...step}]:[],querySelector:()=>({classList:{add(){}},className:'',textContent:''}),closest:()=>null,addEventListener:(n,f)=>handlers[n]=f};
 vm.runInNewContext(code,{document:{querySelectorAll:()=>[form]},Date,setTimeout,say:en=>en,track(){},formProps:()=>({})});
 return {form,events,handlers};
}
test('step changes and Back reveal focused field',()=>{const f=fixture();f.form.show(1);f.form.show(0);assert.equal(f.events.filter(x=>x[0]==='scroll').length,2);});
test('initial nonfocused step does not steal focus or scroll',()=>{const f=fixture();f.form.show(1,false);assert.equal(f.events.length,0);});
test('invalid Continue reveals first missing field',()=>{const f=fixture();f.handlers.click({target:{closest:s=>s==='[data-next]'?{}:null}});assert.equal(f.events.filter(x=>x[0]==='scroll').length,1);assert.equal(f.events.filter(x=>x[0]==='focus').length,1);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for(const failCleanup of [false,true]) {
test(`perda do nome após ativação encerra implementação; cleanup falha=${failCleanup}`,async()=>{
 let lost;
 let active=false;
 const hash='a'.repeat(64);
 const source=readFileSync(new URL('./candidato-sem-reinicio/extension.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export default class ','class ')
  .replace('await import(file.get_uri())','await Promise.resolve({default: Payload})');
 const bytes=Buffer.from('payload fictício');
 const file={query_info:()=>({get_file_type:()=>1,get_size:()=>bytes.length}),load_contents:()=>[true,bytes],get_uri:()=>'/fake'};
 const context={TextDecoder,Promise,Payload:class{enable(){active=true;}disable(){active=false;if(failCleanup)throw Error("fictitious cleanup");}},Extension:class{},
 GLib:{ChecksumType:{SHA256:1},compute_checksum_for_data:()=>hash},
 Gio:{FileQueryInfoFlags:{NOFOLLOW_SYMLINKS:1},FileType:{REGULAR:1},BusType:{SESSION:1},BusNameOwnerFlags:{NONE:0},DBus:{session:{}},
 DBusExportedObject:{wrapJSObject:()=>({export(){},unexport(){}})},bus_own_name:(a,b,c,d,e,callback)=>{lost=callback;return 1;},bus_unown_name(){}}};
 const Loader=vm.runInNewContext(source+'\nNikoLoader;',context);
 const loader=new Loader();loader.metadata={};loader.dir={get_child:name=>name==='current.json'?{...file,load_contents:()=>[true,Buffer.from(JSON.stringify({file:`implementation-${hash}.js`}))]}:file};
 loader.enable();await new Promise(r=>setImmediate(r));
 assert.equal(active,true);
 lost();
 assert.equal(loader._state,'error');
 assert.equal(active,false,'name-lost após ativo não deixa painel/handlers ativos');
 assert.equal(loader._implementationActive,false);
 assert.equal(loader._error,failCleanup?'cleanup_failed':'bus_unavailable');
 loader.disable();
});

}

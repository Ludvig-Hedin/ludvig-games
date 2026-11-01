import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../ludvig-games/assets/https-redirect.js',import.meta.url),'utf8');

function redirect(href){
 const url=new URL(href);let replacement=null;
 vm.runInNewContext(source,{location:{protocol:url.protocol,hostname:url.hostname,href,replace:value=>{replacement=value;}}});
 return replacement;
}

test('production HTTP links move to HTTPS and retain the search, path and fragment',()=>{
 assert.equal(redirect('http://games.ludvighedin.com/?q=Chess#games'),'https://games.ludvighedin.com/?q=Chess#games');
 assert.equal(redirect('http://games.ludvighedin.com/pigeon/'),'https://games.ludvighedin.com/pigeon/');
});
test('HTTPS pages do not redirect repeatedly',()=>{
 assert.equal(redirect('https://games.ludvighedin.com/'),null);
});
test('Mac, LAN, local preview and unrelated sites keep their working addresses',()=>{
 for(const address of ['http://127.0.0.1:47800/','http://localhost:4327/','http://192.168.1.2:47800/','http://[::1]:47800/','http://ludvighedin.com/'])assert.equal(redirect(address),null,address);
});

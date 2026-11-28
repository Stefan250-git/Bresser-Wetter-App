'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
async function test(){
  const listeners={},stores=new Map(),deleted=[];let online=true,requests=0,skips=0;
  const key=request=>typeof request==='string'?request:request.url;
  const cache=()=>({entries:new Map(),async put(request,response){this.entries.set(key(request),response.clone());},async match(request){return this.entries.get(key(request))?.clone();},async addAll(files){for(const file of files){const name=file==='./'?'index.html':file.replace(/^\.\//,'').split('?')[0];assert(fs.existsSync(path.join(__dirname,'..',name)),'Cached asset exists: '+file);}}});
  stores.set('bresser-v34',cache());stores.set('bresser-data-v1',cache());stores.set('another-app',cache());
  vm.runInNewContext(source,{URL,Headers,Response,
    self:{location:{origin:'https://example.org'},addEventListener(type,fn){listeners[type]=fn;},skipWaiting(){skips++;},clients:{claim:async()=>{}}},
    caches:{async open(name){if(!stores.has(name))stores.set(name,cache());return stores.get(name);},async keys(){return [...stores.keys()];},async delete(name){deleted.push(name);stores.delete(name);}},
    fetch:async request=>{requests++;if(!online)throw Error('offline');return new Response(JSON.stringify({timestamp:'2026-11-25T17:17:15Z',rain_day:0,rain_month:2.8}),{headers:{'Content-Type':'application/json'}});}
  });
  let operation;
  listeners.install({waitUntil(promise){operation=promise;}});await operation;
  assert.equal(skips,0,'An update does not unexpectedly replace the active app');
  listeners.message({data:{type:'OTHER'}});assert.equal(skips,0);
  listeners.message({data:{type:'SKIP_WAITING'}});assert.equal(skips,1,'User-approved update activates');
  listeners.activate({waitUntil(promise){operation=promise;}});await operation;
  assert.deepEqual(deleted,['bresser-v34'],'App update preserves station snapshots and unrelated caches');
  function request(url){let response;listeners.fetch({request:{method:'GET',url},respondWith(value){response=value;}});return response;}
  const url='https://example.org/weather/data/latest.json';
  const fresh=await request(url);assert.equal(fresh.headers.get('X-Bresser-Offline'),null);
  assert.equal((await fresh.json()).rain_month,2.8);assert.equal(requests,1,'Always tries network first');
  online=false;
  const saved=await request(url);assert.equal(saved.headers.get('X-Bresser-Offline'),'true');
  assert.equal((await saved.json()).rain_month,2.8,'Offline uses actual cached counters');
  await assert.rejects(request('https://example.org/weather/data/missing.json'),/No offline station data/,'No invented zero if uncached');
  assert.equal(request('https://api.open-meteo.com/v1/forecast'),undefined,'External model requests remain independent');
  assert.equal(request('https://www.pegelonline.wsv.de/webservice/test'),undefined);
  assert.equal(request('https://www.youtube-nocookie.com/embed/gF4Cle4U9_w?playsinline=1'),undefined,'Live video stays outside the app cache');
  console.log('PASS: PWA assets, explicit updates, preserved data cache, network-first snapshots, offline provenance and missing-data handling.');
}
test().catch(error=>{console.error(error);process.exitCode=1;});

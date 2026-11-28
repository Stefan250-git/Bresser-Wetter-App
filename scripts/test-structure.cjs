'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
assert.equal(ids.length,new Set(ids).size,'No duplicate IDs');
for(const id of ['view-today','view-archive','nav-today','nav-archive','archive-hour-label','archive-rainrate','archive-compare','more-details','update-banner','apply-update'])assert(ids.includes(id),id);
assert(html.includes('id="view-archive" hidden'),'Archive is secondary by default');
assert.equal((html.match(/<iframe\b/g)||[]).length,1,'One permanent river video');
const player=html.match(/<iframe[^>]*>/)[0];
const playerURL=new URL(player.match(/src="([^"]+)"/)[1].replaceAll('&amp;','&'));
assert.equal(playerURL.origin,'https://www.youtube-nocookie.com');
assert.equal(playerURL.pathname,'/embed/gF4Cle4U9_w');
for(const [key,value] of Object.entries({autoplay:'1',mute:'1',playsinline:'1',controls:'0',disablekb:'1',fs:'0'}))assert.equal(playerURL.searchParams.get(key),value);
assert(player.includes('loading="eager"')&&player.includes('allow="autoplay;'));
assert(html.includes('<figcaption>Rees, Rheinabwärts (Livestream)</figcaption>'));
assert(!html.includes('class="river-scene"'),'Video replaces the river pictures');
for(const label of ['Niedrig','Normal','Hoch'])assert(html.includes('<span>'+label+'</span>'),'Keep water-level label '+label);
assert(html.indexOf('id="history-title"')<html.indexOf('id="forecast-title"'));
assert(html.indexOf('id="forecast-title"')<html.indexOf('id="wind-title"'));
assert(html.includes('aria-controls="view-today"')&&html.includes('aria-controls="view-archive"'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
for(const icon of manifest.icons){
  const data=fs.readFileSync(path.join(root,icon.src));assert(data.length>0);
  if(icon.type==='image/png'){const [width,height]=icon.sizes.split('x').map(Number);assert.equal(data.readUInt32BE(16),width);assert.equal(data.readUInt32BE(20),height);}
}
for(const size of ['192x192','512x512'])assert(manifest.icons.some(icon=>icon.sizes===size));
assert(html.includes('apple-touch-icon'));
const css=fs.readFileSync(path.join(root,'mobile.css'),'utf8');
assert(css.includes('env(safe-area-inset-bottom)')&&css.includes('prefers-reduced-motion'));
function luminance(hex){let value=hex.replace('#','');if(value.length===3)value=[...value].map(char=>char+char).join('');const components=value.match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return components[0]*.2126+components[1]*.7152+components[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
const palettes=[...css.matchAll(/:root\{([^}]*)\}/g)].map(match=>Object.fromEntries([...match[1].matchAll(/--([\w-]+):(#[0-9a-f]{3,6})/g)].map(value=>[value[1],value[2]])));
assert.equal(palettes.length,2);
for(const palette of palettes)for(const [foreground,background] of [['ink','card'],['muted','soft'],['accent','card']])assert(contrast(palette[foreground],palette[background])>=4.5,'Actual theme text contrast '+foreground+'/'+background);
console.log('PASS: unique structure, view separation, information hierarchy, app icons, safe areas, scalable labels and core light/dark text contrast.');

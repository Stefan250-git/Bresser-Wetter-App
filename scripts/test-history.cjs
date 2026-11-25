'use strict';
const assert=require('node:assert/strict');
const history=require('../history.js');
const fs=require('node:fs'),path=require('node:path');
const gaugeColors=[...fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').matchAll(/stroke="(#[a-f0-9]+)" stroke-width="18"/g)].slice(0,240);
assert.equal(gaugeColors.length,240);
gaugeColors.forEach((match,index)=>assert.equal(history.temperatureColor(-20+(index+.5)/4),match[1],'History color matches current Celsius gauge'));
assert.equal(history.temperatureColor(-30),'#3287e6');
assert.equal(history.temperatureColor(15),'#28a66a');
assert.equal(history.temperatureColor(45),'#ec5547');
const H=3600000,now=Date.parse('2026-11-25T12:00:00Z');
const row=(time,temperature=1,rain=0)=>({timestamp:new Date(time).toISOString(),temperature,rain_month:rain,rain_day:rain});
const complete=Array.from({length:1009},(_,i)=>row(now-168*H+i*600000,i===1?-15:i===2?31:2,i/10));
let model=history.build(complete,24,now);
assert.equal(model.raw.length,145);
assert.equal(model.points.length,145);
assert(Math.abs(model.total-14.4)<1e-8);
assert.equal(model.gap,false);
assert.equal(model.rainPartial,false);
model=history.build(complete,168,now);
assert.equal(model.end-model.start,168*H);
assert.equal(model.min,-15,'Min/max from originals, not hourly means');
assert.equal(model.max,31);
assert.equal(model.points.length,169);
assert(Math.abs(model.average-14.4)<1e-8);
assert.equal(model.bins.length,8,'Rolling 168h usually intersects eight local dates');
assert(model.bins[0].partial && model.bins.at(-1).partial);
assert.equal(history.rows([complete[0],{...complete[0],timestamp:'2026-11-18T13:00:00+01:00'},null,{timestamp:'invalid'}]).length,1);
assert.equal(history.rows([{timestamp:'2026-11-18T12:00:00',temperature:1}]).length,0);
assert.equal(history.rainDelta({...row(now-H),time:now-H},{...row(now),time:now}),null,'Long gaps remain unknown');
assert.equal(history.rainDelta({...row(now-600000,1,10),time:now-600000},{...row(now,1,2),time:now}),null,'Counter reset stays unknown');
assert.equal(history.rainDelta({...row(now-600000,1,null),time:now-600000},{...row(now,1,null),time:now}),null,'Null is not zero');
assert.equal(history.rainDelta({...row(now-600000,1,0),time:now-600000},{...row(now,1,0),time:now}),0,'Observed zero is valid');
assert.equal(history.build([],24,now).total,null);
assert.equal(history.build([row(now,null,null)],24,now).min,null);
const gap=complete.filter((_,i)=>i<900 || i>910);
assert(history.build(gap,24,now).gap);
assert(history.build(gap,24,now).rainPartial);
const nulls=complete.map((row,i)=>i===950?{...row,temperature:null,rain_month:null,rain_day:null}:row);
assert(history.build(nulls,24,now).rainPartial);
for(const [date,hours] of [['2026-03-29',23],['2026-10-25',25]]) {
  const start=history.midnight(date),next=history.midnight(date==='2026-03-29'?'2026-03-30':'2026-10-26');
  assert.equal((next-start)/H,hours);
  const dst=history.build([],168,next+3*H);
  const bin=dst.bins.find(bin=>history.day(bin.calendarStart)===date);
  assert.equal((bin.calendarEnd-bin.calendarStart)/H,hours);
  assert.equal(dst.end-dst.start,168*H);
}
const midnight=Date.parse('2026-12-01T00:00:00+01:00');
assert.equal(history.rainDelta({...row(midnight-600000,1,12),time:midnight-600000},{...row(midnight,1,0),time:midnight}),null,'Month/day reset not treated as dry');
const crosses=history.build([row(now-65*60000,1,0),row(now-55*60000,1,2)],24,now);
assert.equal(crosses.total,null,'Nonzero intervals crossing bucket boundaries are not guessed');
// An isolated renderer fixture verifies value-based fill even when the Y range
// changes, and separate gradients preserve gaps between measured segments.
const elements=new Map(),root={getElementById(id){if(!elements.has(id))elements.set(id,{setAttribute(){},getBoundingClientRect(){return {width:250};}});return elements.get(id);}};
const colored=[-10,15,35,null,5,6].map((temperature,index)=>row(now-50*60000+index*600000,temperature));
history.render(history.build(colored,24,now),colored.at(-1),root);
const chart=elements.get('history-temperature-chart').innerHTML;
assert.equal((chart.match(/<linearGradient /g)||[]).length,2,'A missing reading splits the filled area');
for(const color of ['#3287e6','#28a66a','#ec5547'])assert(chart.includes('stop-color="'+color+'"'));
assert(chart.includes('fill="url(#history-temperature-fill-0)"'));
assert.equal((chart.match(/class="history-y-label"/g)||[]).length,5);
assert.equal((elements.get('history-rain-chart').innerHTML.match(/class="history-y-label"/g)||[]).length,5);
history.render(history.build(complete,24,now),complete.at(-1),root);
assert(!elements.get('history-rain-chart').innerHTML.includes('Erfasst: 0,0 mm'),'Positive rain is never labelled dry');
history.render(history.build([row(now-600000),row(now)],24,now),row(now),root);
assert(elements.get('history-rain-chart').innerHTML.includes('Erfasst: 0,0 mm'),'Measured dry intervals have an explicit readout');
history.render(history.build([],24,now),null,root);
assert(elements.get('history-rain-chart').innerHTML.includes('Keine Intervallwerte'));
assert(!elements.get('history-rain-chart').innerHTML.includes('Erfasst: 0,0 mm'),'Missing observations never look dry');
for(const hours of [24,168]) {
  history.render(history.build(colored,hours,now+37*60000),colored.at(-1),root);
  for(const id of ['history-temperature-chart','history-rain-chart']) {
    const svg=elements.get(id).innerHTML;
    for(const edge of ['start','end']) {
      const label=svg.match(new RegExp('<text class="history-x-label history-time-'+edge+'"[^>]*>(.*?)</text>'));
      assert(label,'Exact window boundary is always labelled');
      assert(label[1].includes('13:37'),'Boundary includes exact Berlin clock time');
      if(hours===168)assert(label[1].includes('<tspan'),'Weekly endpoints retain both date and time');
    }
  }
  assert(elements.get('history-inspection').textContent.includes('Regen:'),'Shared selection readout remains visible');
}
console.log('PASS: 24h/168h, original extrema, hourly means, rainfall sums/average, deduplication, missing values, gaps, resets, 23h/25h Berlin days and month boundaries.');

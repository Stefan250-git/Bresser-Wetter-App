// Run with node scripts/test-ui.cjs. No dependencies or live network requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Unique HTML IDs');

function harness(code = source) {
  let frameId = 0;
  const frames = new Map(), stats = { formatters: 0, formats: 0, requests: [] };
  const nodes = new Map(ids.map(id => [id, {
    value: '', disabled: false, writes: 0, text: '', dataset: {}, attributes: {},
    style: { setProperty(key, value) { this[key] = value; } },
    nextElementSibling: {}, children: [],
    replaceChildren() { this.children=[]; },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    setAttribute(key, value) { this.attributes[key] = value; },
    set textContent(value) { this.writes++; this.text = value; },
    get textContent() { return this.text; }
  }]));
  const instrumentedIntl = Object.create(Intl);
  instrumentedIntl.DateTimeFormat = function (...args) {
    stats.formatters++;
    const formatter = new Intl.DateTimeFormat(...args);
    return {
      format(value) { stats.formats++; return formatter.format(value); },
      formatToParts(value) { stats.formats++; return formatter.formatToParts(value); }
    };
  };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-24T11:00:00Z'])); }
    static now() { return Date.parse('2026-11-24T11:00:00Z'); }
  }
  const context = vm.createContext({
    Intl: instrumentedIntl, Date: TestDate, Number, Math, Set, Map, WeakMap, URL,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    fetch: async url => {
      stats.requests.push(url);
      return { ok: true, json: async () => url.includes('latest') ? null : [] };
    },
    document: {
      getElementById(id) { assert(nodes.has(id), 'Missing HTML element: ' + id); return nodes.get(id); },
      createElement() { return { children: [], append(...children) { this.children.push(...children); } }; }
    }
  });
  vm.runInContext(code.slice(0, code.indexOf("if('serviceWorker'in navigator)")), context);
  return {
    context, nodes, frames, stats, run: text => vm.runInContext(text, context),
    paint() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); }
  };
}

function seed(h) {
  h.run(`chosenDay='2026-11-24';archive={'2026-11':Array.from({length:25},(_,hour)=>({
    timestamp:(hour===24?'2026-11-25':'2026-11-24')+'T'+String(hour%24).padStart(2,'0')+':00:00+01:00',
    temperature:hour,feels:hour,rain_day:hour,rain_month:hour
  }))};live={temperature:7.3,wind_speed:12,wind_direction:180,timestamp:'2026-11-24T11:00:00+01:00'};render();`);
}

async function tests() {
  const h = harness();
  seed(h);
  assert.equal(h.run('chosenHour'), 12);
  assert.equal(h.nodes.get('hour-value').textContent, '12');
  assert.equal(h.nodes.get('next').disabled, true);
  const liveWrites = h.nodes.get('current-temp').writes;
  const windWrites = h.nodes.get('wind').writes;
  const selectionWrites = h.nodes.get('temp').writes;
  const formatsBeforeDrag = h.stats.formats;
  // Multiple native input events before a paint must update the thumb immediately
  // and render only the latest selection once, without rewriting live readings.
  for (const hour of [13, 14, 15, 16, 16, 16]) {
    h.nodes.get('hour').oninput({ target: { value: String(hour) } });
    assert.equal(h.nodes.get('hour-value').textContent, String(hour));
  }
  assert.equal(h.frames.size, 1);
  assert.equal(h.stats.formats, formatsBeforeDrag, 'No date work in the drag handler');
  assert.equal(h.nodes.get('temp').writes, selectionWrites);
  h.paint();
  assert.equal(h.nodes.get('temp').textContent, '16.0');
  assert.equal(h.nodes.get('temp').writes, selectionWrites + 1);
  assert.equal(h.nodes.get('current-temp').writes, liveWrites);
  assert.equal(h.nodes.get('wind').writes, windWrites);
  for (let hour = 0; hour <= 24; hour++) {
    h.nodes.get('hour').oninput({ target: { value: String(hour) } });
    h.nodes.get('hour').onchange();
    assert.equal(h.nodes.get('hour-value').textContent, String(hour));
    assert.equal(h.nodes.get('temp').textContent, hour + '.0');
    assert.equal(h.frames.size, 0, 'Final value flushed on release');
  }
  for (const invalid of [-1, 25, 1.5, 'invalid']) {
    h.context.invalid = invalid;
    h.run('selectHour(invalid)');
    assert.equal(h.run('chosenHour'), 24);
  }
  assert.equal(h.nodes.get('hour').attributes['aria-valuetext'], '24:00 Uhr (Tagesende)');
  assert.equal(h.stats.requests.length, 0, 'Dragging never fetches data');
  const formats = h.stats.formats;
  for (let i = 0; i < 30; i++) h.run("nearest('2026-11-24','12:00');periodRain('2026-11-24','week')");
  assert.equal(h.stats.formats, formats, 'Warm archive lookup never reformats records');

  // Replacing a fetched month invalidates the index, even after it was warmed.
  h.run("archive={'2026-11':[{timestamp:'2026-11-24T12:00:00+01:00',temperature:99}]}");
  assert.equal(h.run("nearest('2026-11-24','12:00').temperature"), 99);
  h.run("archive['2026-11']=[{timestamp:'2026-11-24T12:00:00+01:00',temperature:5},{timestamp:'invalid',temperature:99}]");
  assert.equal(h.run("nearest('2026-11-24','12:00').temperature"), 5);
  h.run("archive={'2026-10':[{timestamp:'2026-10-31T23:55:00+01:00',temperature:1}],'2026-12':[{timestamp:'2026-12-01T00:05:00+01:00',temperature:2}]}");
  assert.equal(h.run("nearest('2026-11-01','00:00').temperature"), 1);
  assert.equal(h.run("nearest('2026-11-30','24:00').temperature"), 2);
  h.run("archive={'2026-11':[{timestamp:'2026-11-24T12:21:00+01:00',temperature:3}]}");
  assert.equal(h.run("nearest('2026-11-24','12:00')"), null);
  h.run(`archive={'2026-11':[
    {timestamp:'2026-11-24T18:00:00+01:00',rain_day:6,rain_month:10},
    {timestamp:'2026-11-23T23:00:00+01:00',rain_day:3,rain_month:4},
    {timestamp:'2026-11-24T12:00:00+01:00',rain_day:2,rain_month:6}
  ]}`);
  assert.equal(h.run("periodRain('2026-11-24','week','2026-11-24T12:00:00+01:00')"), 5);
  assert.equal(h.run("periodRain('2026-11-24','day','2026-11-24T12:00:00+01:00')"), 2);
  assert.equal(h.run("periodRain('2026-11-24','month','2026-11-24T12:00:00+01:00')"), 6);
  assert.equal(h.run("periodRain('2026-11-25','week')"), null, 'Incomplete week stays unknown');
  h.run('archive={};render()');
  assert.equal(h.nodes.get('temp').textContent, '\u2014');

  // Refresh is deduplicated and failed refreshes preserve the last known data.
  seed(h);
  h.context.fetch = async url => {
    h.stats.requests.push(url);
    throw new Error('Test offline');
  };
  const firstRefresh = h.nodes.get('refresh').onclick();
  const secondRefresh = h.nodes.get('refresh').onclick();
  assert.equal(h.nodes.get('refresh').disabled, true);
  await Promise.all([firstRefresh, secondRefresh]);
  assert.equal(h.stats.requests.filter(url => url.includes('latest')).length, 1);
  assert.equal(h.nodes.get('refresh').disabled, false);
  assert.equal(h.nodes.get('refresh').attributes['aria-busy'], 'false');
  assert.equal(h.nodes.get('current-temp').textContent, '7.3');
  assert(h.nodes.get('status').textContent.startsWith('Aktualisierung fehlgeschlagen'));
  assert.equal(h.run('recordsForDay("2026-11-24").length'), 24);

  const monthLoad = harness();
  let finishMonth, monthFetches=0;
  monthLoad.context.fetch = async () => { monthFetches++; return new Promise(resolve => { finishMonth=resolve; }); };
  const monthA = monthLoad.run("loadMonth('2026-11')");
  const monthB = monthLoad.run("loadMonth('2026-11',true)");
  assert.equal(monthFetches,1,'Concurrent month downloads are shared');
  finishMonth({ok:true,json:async()=>[]});
  await Promise.all([monthA,monthB]);

  // An older, slower request must not overwrite the more recent response.
  const race = harness(), responses = [];
  race.run("loaded.add('2026-11');loaded.add('2025-11')");
  race.context.fetch = url => new Promise(resolve => responses.push(resolve));
  const older = race.run('loadRelevant()');
  await new Promise(resolve => setImmediate(resolve));
  const newer = race.run('loadRelevant()');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(responses.length, 2);
  responses[1]({ ok: true, json: async () => ({ temperature: 22, timestamp: '2026-11-24T12:00:00+01:00' }) });
  await newer;
  responses[0]({ ok: true, json: async () => ({ temperature: 11, timestamp: '2026-11-24T11:00:00+01:00' }) });
  await older;
  assert.equal(race.run('live.temperature'), 22);

  // Fast date navigation uses the selected date, even when older loads finish last.
  const navigation = harness();
  const dateLoads = [];
  navigation.context.deferLoad = () => new Promise(resolve => dateLoads.push(resolve));
  navigation.run('loadRelevant=deferLoad');
  const previous = navigation.run("changeDate('2026-11-23')");
  assert.equal(navigation.nodes.get('next').disabled, false);
  const today = navigation.run("changeDate('2026-11-24')");
  dateLoads[1](); await today;
  dateLoads[0](); await previous;
  assert.equal(navigation.run('chosenDay'), '2026-11-24');
  assert.equal(navigation.nodes.get('next').disabled, true);
  assert.equal(navigation.run("changeDate('2026-11-25')"), undefined);

  for (const [speed, level] of [[0,0],[20,1],[39,2],[62,3],[89,4],[118,5]]) {
    h.context.speed = speed;h.run('renderWind({wind_speed:speed,wind_direction:180})');
    for (let i=0; i<6; i++) assert.equal(h.nodes.get('windsock-'+i).dataset.active, String(i === level));
  }
  assert.equal(h.nodes.get('wind-compass-pointer').attributes.transform, 'rotate(0 90 90)');
  for(const [value,angle] of [[-30,0],[-20,0],[10,135],[40,270],[50,270]]) {
    h.context.value=value;h.run("updateTemperatureGauge('selected',value)");
    assert.equal(h.nodes.get('selected-needle').attributes.transform,'rotate('+angle+' 160 160)');
  }
  h.run("updateTemperatureGauge('selected',null)");
  assert.equal(h.nodes.get('selected-needle').attributes.opacity,'0');

  const forecast = harness();
  const daily={time:['2026-11-24','2026-11-25','2026-11-26','2026-11-27'],temperature_2m_min:[0,1,2,3],temperature_2m_max:[5,6,7,8],precipitation_sum:[0,1,0,0],precipitation_probability_max:[0,80,0,0],wind_gusts_10m_max:[0,60,0,0]};
  forecast.context.fetch=async()=>({ok:true,json:async()=>({daily})});
  await forecast.run('forecast()');
  assert.equal(forecast.nodes.get('forecast').children.length,3);
  forecast.context.fetch=async()=>{throw Error('Test offline');};
  await forecast.run('forecast()');
  assert.equal(forecast.nodes.get('forecast').textContent,'Prognose derzeit nicht verfügbar.');

  const listeners={},deleted=[];
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const version=sw.match(/const CACHE = '([^']+)'/)[1];
  vm.runInNewContext(sw,{
    self:{addEventListener(name,callback){listeners[name]=callback;},clients:{claim:async()=>{} }},
    caches:{keys:async()=>['bresser-v1',version,'other-app-cache'],delete:async key=>deleted.push(key)}
  });
  let activation;
  listeners.activate({waitUntil(promise){activation=promise;}});await activation;
  assert.deepEqual(deleted,['bresser-v1'],'Only obsolete weather-app caches are deleted');
  for(const name of ['app.js','styles.css']) {
    const asset=html.match(new RegExp(name.replace('.','\\.')+'\\?v=\\d+'))[0];
    assert(sw.includes(asset),'Service worker and HTML asset versions match');
  }
  console.log('PASS: immediate thumb, coalesced rendering, 25 hours, date navigation, midnight, archive cache, rain totals, offline refresh, request races, month deduplication, gauges, wind, forecast and service worker.');
}

function benchmark(code) {
  const h = harness(code);
  h.context.fixture = JSON.parse(fs.readFileSync(path.join(root, 'data/2026-11.json'), 'utf8'));
  h.run("archive={'2026-11':fixture};chosenDay='2026-11-24';render()");
  const start = performance.now(), formatterStart = h.stats.formatters;
  for (const value of ['0','6','12','18','24']) {
    h.nodes.get('hour').oninput({ target: { value } });h.paint();
  }
  return { fiveSelectionsMs: +(performance.now()-start).toFixed(2), newFormatters: h.stats.formatters-formatterStart };
}

tests().then(() => {
  const after = benchmark(source);
  const before = process.argv[2] ? benchmark(fs.readFileSync(process.argv[2], 'utf8')) : undefined;
  console.log(JSON.stringify({ benchmark: { before, after } }));
}).catch(error => { console.error(error);process.exitCode=1; });

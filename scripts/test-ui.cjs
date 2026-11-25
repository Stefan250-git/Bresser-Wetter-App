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
  let timerId=0,clock=0;
  const timers=new Map(),documentListeners={};
  const frames = new Map(), stats = { formatters: 0, formats: 0, requests: [], animations: [] };
  const nodes = new Map(ids.map(id => [id, {
    value: '', disabled: false, writes: 0, text: '', dataset: {}, attributes: {}, captures:new Set(),
    style: { setProperty(key, value) { this[key] = value; } },
    nextElementSibling: {}, children: [],
    replaceChildren() { this.children=[]; },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    setAttribute(key, value) { this.attributes[key] = value; },
    getBoundingClientRect() { return {left:0,top:0,width:296,height:80}; },
    focus() {},
    setPointerCapture(id) { this.captures.add(id); },
    hasPointerCapture(id) { return this.captures.has(id); },
    releasePointerCapture(id) { this.captures.delete(id); },
    animate(keyframes,options) {
      const animation={id,keyframes,options,cancelled:false,cancel(){this.cancelled=true;}};
      stats.animations.push(animation);return animation;
    },
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
    Intl: instrumentedIntl, Date: TestDate, Number, Math, Set, Map, WeakMap, URL, AbortController,
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback,delay) { timers.set(++timerId,{at:clock+delay,callback});return timerId; },
    clearTimeout(id) { timers.delete(id); },
    matchMedia() { return {matches:false}; },
    fetch: async url => {
      stats.requests.push(url);
      return { ok: true, json: async () => String(url).includes('latest') ? null : [] };
    },
    document: {
      hidden:false,
      addEventListener(name,callback) { documentListeners[name]=callback; },
      getElementById(id) { assert(nodes.has(id), 'Missing HTML element: ' + id); return nodes.get(id); },
      createElement() { return { children: [], append(...children) { this.children.push(...children); } }; }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, "history.js"), "utf8"), context);
  vm.runInContext(code.slice(0, code.indexOf("if('serviceWorker'in navigator)")), context);
  return {
    context, nodes, frames, stats, timers,documentListeners, run: text => vm.runInContext(text, context),
    advance(ms) { clock+=ms;for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.callback();} },
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
  function pointer(x,y=40,id=1,extra={}) {
    return {clientX:x,clientY:y,pointerId:id,isPrimary:true,button:0,
      preventDefault(){this.defaultPrevented=true;},...extra};
  }
  const hold=harness();seed(hold);
  const slider=hold.nodes.get('hour');
  for(let attempt=0;attempt<2;attempt++) {
    slider.onpointerdown(pointer(208));hold.advance(1100);slider.onpointerup(pointer(208));
  }
  hold.advance(2000);
  assert.equal(hold.run('chosenHour'),12,'Short taps never change the hour or accumulate hold time');
  slider.onpointerdown(pointer(208));hold.advance(1999);
  assert.equal(hold.run('chosenHour'),12,'No change before two seconds');
  slider.value='18';slider.oninput({target:slider});
  assert.equal(slider.value,'12','Native pointer input cannot bypass the hold');
  hold.advance(1);
  assert.equal(hold.run('chosenHour'),18,'Held track tap selects at two seconds');
  assert.equal(hold.nodes.get('hour-control').dataset.pressState,'dragging');
  assert.equal(hold.nodes.get('hour-preview').textContent,'18');
  slider.onpointermove(pointer(238));
  assert.equal(hold.nodes.get('hour-preview').textContent,'21','Large readout follows dragging immediately');
  slider.onpointerup(pointer(238));
  assert.equal(hold.nodes.get('temp').textContent,'21.0');
  assert.equal(hold.nodes.get('hour-control').dataset.pressState,'idle');
  assert.equal(hold.frames.size,0);
  assert.equal(slider.captures.size,0);

  const grip=harness();seed(grip);
  grip.nodes.get('hour').onpointerdown(pointer(168));grip.advance(2000);
  assert.equal(grip.run('chosenHour'),12,'Holding the edge of the thumb does not jump');
  grip.nodes.get('hour').onpointermove(pointer(228));
  assert.equal(grip.run('chosenHour'),18,'Grip offset is preserved while dragging');
  grip.nodes.get('hour').onpointermove(pointer(-100));
  assert.equal(grip.run('chosenHour'),0);
  grip.nodes.get('hour').onpointermove(pointer(500));
  assert.equal(grip.run('chosenHour'),24);
  grip.nodes.get('hour').onpointerup(pointer(500));

  for(const action of ['scroll','early-drag','cancel','lost-capture','blur','hidden']) {
    const cancel=harness();seed(cancel);
    const input=cancel.nodes.get('hour');input.onpointerdown(pointer(208));cancel.advance(1000);
    if(action==='scroll')input.onpointermove(pointer(208,80));
    if(action==='early-drag')input.onpointermove(pointer(238));
    if(action==='cancel')input.onpointercancel(pointer(208));
    if(action==='lost-capture')input.onlostpointercapture(pointer(208));
    if(action==='blur')input.onblur();
    if(action==='hidden'){cancel.context.document.hidden=true;cancel.documentListeners.visibilitychange();}
    cancel.advance(2000);
    assert.equal(cancel.run('chosenHour'),12,action+' cancels pending changes');
    assert.equal(cancel.timers.size,0);
    assert.equal(cancel.nodes.get('hour-control').dataset.pressState,'idle');
  }
  const ruler=harness();seed(ruler);ruler.run('selectHour(11)');ruler.paint();
  ruler.nodes.get('hour-ruler').onpointerdown(pointer(148,95));ruler.advance(2000);
  assert.equal(ruler.run('chosenHour'),12,'A held scale-label tap selects its exact hour');
  ruler.nodes.get('hour').onpointerup(pointer(148,95));
  ruler.nodes.get('hour').onpointerdown(pointer(208,40,2,{isPrimary:false}));
  ruler.nodes.get('hour').onpointerdown(pointer(208,40,1,{button:2}));
  assert.equal(ruler.timers.size,0,'Secondary touch and right mouse button are ignored');

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
  assert.equal(h.stats.requests.filter(url => String(url).includes('latest')).length, 1);
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
  for(const kind of ['current','selected']) {
    const valueId=kind==='current'?'current-temp':'temp',feltId=kind==='current'?'current-feels':'feels';
    h.context.kind=kind;
    for(const [value,feels,x,feltX] of [[-1.4,-3.2,'152','156'],[12.3,10.1,'160','160'],[-0,-0,'152','156'],[null,null,'160','160']]) {
      h.context.value=value;h.context.feels=feels;
      h.run('updateTemperatureGauge(kind,value,feels)');
      assert.equal(h.nodes.get(valueId).attributes.x,x,'Optical centering including minus sign');
      assert.equal(h.nodes.get(feltId).attributes.x,feltX);
      assert.equal(h.nodes.get(valueId).textContent,Number.isFinite(value)?new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(value).replace(',','.'):'\u2014');
      assert.equal(h.nodes.get(feltId).textContent,Number.isFinite(feels)?new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(feels).replace(',','.'):'\u2014');
    }
  }
  const sway=harness(),observers=[];
  sway.context.IntersectionObserver=class {
    constructor(callback,options){this.callback=callback;this.options=options;observers.push(this);}
    observe(target){this.target=target;}
  };
  seed(sway);sway.run('setupCompassObserver()');
  const observer=observers[0];assert.equal(observer.target,sway.nodes.get('wind-compass'));
  const enter=()=>observer.callback([{isIntersecting:true,intersectionRatio:.6}]);
  const leave=()=>observer.callback([{isIntersecting:false,intersectionRatio:0}]);
  enter();assert.equal(sway.stats.animations.length,1);
  const firstSway=sway.stats.animations[0];
  assert.equal(firstSway.id,'wind-compass-sway');assert.equal(firstSway.options.duration,1800);assert.equal(firstSway.options.iterations,1);
  assert.equal(firstSway.keyframes.filter(frame=>/rotate\(-/.test(frame.transform)).length,4);
  assert.equal(firstSway.keyframes.at(-1).transform,'rotate(0deg)');
  assert.equal(sway.nodes.get('wind-compass-pointer').attributes.transform,'rotate(0 90 90)');
  enter();observer.callback([{isIntersecting:true,intersectionRatio:.2}]);enter();
  assert.equal(sway.stats.animations.length,1,'No replay or jitter while compass remains visible');
  sway.run('renderWind({wind_speed:20,wind_direction:270})');
  assert.equal(sway.nodes.get('wind-compass-pointer').attributes.transform,'rotate(90 90 90)');
  assert.equal(sway.stats.animations.length,1,'Weather updates do not restart the scroll animation');
  leave();assert(firstSway.cancelled);enter();assert.equal(sway.stats.animations.length,2);
  sway.context.matchMedia=()=>({matches:true});leave();enter();assert.equal(sway.stats.animations.length,2,'Reduced motion disables compass sway');
  sway.context.matchMedia=()=>({matches:false});leave();sway.run('renderWind(null)');enter();
  assert.equal(sway.stats.animations.length,2,'No animation without a valid wind direction');
  sway.run('renderWind({wind_speed:20,wind_direction:90})');assert.equal(sway.stats.animations.length,3);
  sway.context.document.hidden=true;sway.documentListeners.visibilitychange();assert(sway.stats.animations.at(-1).cancelled);
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

  const weather=harness();
  const now=Date.parse('2026-11-24T11:00:00Z');
  const station={timestamp:'2026-11-24T12:00:00+01:00',rain_rate:0,wind_speed:5,temperature:-7};
  const model={code:0,isDay:true,time:now,wind:5,gusts:10};
  const cases=[
    [{...station,rain_rate:1},model,'rain','Es regnet'],
    [{...station,rain_rate:1},{...model,code:75},'snow','Es schneit'],
    [station,model,'sun','Sonnig'],
    [station,{...model,isDay:false},'moon','Klarer Himmel'],
    [station,{...model,code:2},'partly','Leicht bewölkt'],
    [station,{...model,code:2,isDay:false},'partly-night','Leicht bewölkt'],
    [station,{...model,code:3},'cloudy','Bewölkt'],
    [station,{...model,code:45},'fog','Es ist neblig'],
    [station,{...model,code:61},'rain','Regen möglich'],
    [null,{...model,code:61},'rain','Es regnet'],
    [null,{...model,code:53},'drizzle','Es nieselt'],
    [null,{...model,code:66},'ice','Gefrierender Regen'],
    [null,{...model,code:86},'snow','Es schneit'],
    [null,{...model,code:97},'thunder','Gewitter'],
    [{...station,wind_speed:80},null,'storm','Es stürmt'],
    [{...station,wind_speed:120},null,'storm','Orkan'],
    [{...station,wind_speed:65},model,'storm','Stürmisch'],
    [null,{...model,gusts:90},'storm','Sturmböen'],
    [null,{...model,code:999},'unknown','Keine Wetterdaten'],
    [{...station,timestamp:'2026-11-24T08:00:00Z',rain_rate:9},{...model,time:now-2*3600000},'unknown','Keine Wetterdaten'],
    [null,{...model,time:now+3600000},'unknown','Keine Wetterdaten']
  ];
  for(const [observation,current,kind,label] of cases) {
    weather.context.observation=observation;weather.context.current=current;
    const state=weather.run('weatherState(observation,current)');
    assert.equal(state.kind,kind);assert.equal(state.label,label);
  }
  weather.context.payload={utc_offset_seconds:3600,current:{time:'2026-11-24T12:00',weather_code:0,is_day:1}};
  assert.equal(weather.run('normalizeCurrentWeather(payload).time'),now,'Provider local time uses its UTC offset');
  weather.context.payload.current.time='2026-11-24T11:00:00Z';
  assert.equal(weather.run('normalizeCurrentWeather(payload).time'),now);
  weather.context.payload.current.time=now/1000;
  assert.equal(weather.run('normalizeCurrentWeather(payload).time'),now);
  weather.context.payload.current.is_day=null;
  assert.equal(weather.run('normalizeCurrentWeather(payload)'),null);
  weather.context.observation={...station,rain_rate:2};
  weather.run("live=observation;chosenDay='2026-11-22';renderCurrent()");
  assert.equal(weather.nodes.get('current-weather').dataset.weather,'rain','Badge always uses current weather, not the selected archive date');
  assert(weather.nodes.get('current-weather').attributes.title.includes('Station'));
  assert.equal(weather.nodes.get('current-weather-label').textContent,'Es regnet');

  const currentRequest=harness();let requestCount=0,finishWeather;
  currentRequest.context.fetch=async url=>{
    requestCount++;
    assert.equal(url.searchParams.get('current'),'weather_code,is_day,wind_speed_10m,wind_gusts_10m');
    return new Promise(resolve=>{finishWeather=resolve;});
  };
  const weatherA=currentRequest.run('forecast()'),weatherB=currentRequest.run('forecast()');
  assert.equal(requestCount,1,'Current and daily weather share one request; simultaneous refreshes are combined');
  finishWeather({ok:true,json:async()=>({utc_offset_seconds:3600,current:{time:'2026-11-24T12:00',weather_code:71,is_day:1},daily})});
  await Promise.all([weatherA,weatherB]);
  assert.equal(currentRequest.nodes.get('current-weather').dataset.weather,'snow');
  assert.equal(currentRequest.nodes.get('forecast').children.length,3);

  // USNO primary phases (UTC): aa.usno.navy.mil/calculated/moon/phases
  const lunar=harness();
  for(const [date,fraction,phase] of [
    ['2026-11-09T07:02:00Z',0,0],
    ['2026-11-17T11:48:00Z',.5,.25],
    ['2026-11-24T14:53:00Z',1,.5],
    ['2026-12-01T06:08:00Z',.5,.75]
  ]) {
    lunar.context.date=date;
    const illumination=lunar.run('moonIllumination(new Date(date))');
    assert(Math.abs(illumination.fraction-fraction)<.035,'Illumination agrees with known primary phase: '+date);
    const difference=Math.abs(illumination.phase-phase);
    assert(Math.min(difference,1-difference)<.02,'Cycle direction agrees with known phase');
  }
  assert.equal(lunar.run('moonPhaseName(0,true)'),'Neumond');
  assert.equal(lunar.run('moonPhaseName(.5,true)'),'Erstes Viertel');
  assert.equal(lunar.run('moonPhaseName(1,true)'),'Vollmond');
  assert.equal(lunar.run('moonPhaseName(.5,false)'),'Letztes Viertel');
  assert.equal(lunar.run('moonPhaseName(.2,true)'),'Zunehmende Sichel');
  assert.equal(lunar.run('moonPhaseName(.2,false)'),'Abnehmende Sichel');
  assert.equal(lunar.run('moonDiscPath(0,true)'),'');
  assert(lunar.run('moonDiscPath(.5,true)').includes('A58 58 0 0 1 80 138 L80 22'));
  assert(lunar.run('moonDiscPath(.5,false)').includes('A58 58 0 0 0 80 138 L80 22'));
  lunar.run("chosenDay='2026-11-01';renderMoon()");
  assert.equal(lunar.nodes.get('moon-phase').textContent,'Vollmond','Moon is current even when an archive date is selected');
  assert(lunar.nodes.get('moon-time').textContent.includes('24.11.26'));
  assert.equal(lunar.stats.requests.length,0,'Moon works offline without a network call');
  assert.equal(lunar.nodes.get('moon-day-prev2').textContent,'22.11.');
  assert.equal(lunar.nodes.get('moon-day-prev1').textContent,'23.11.');
  assert.equal(lunar.nodes.get('moon-day-today').textContent,'Heute');
  assert.equal(lunar.nodes.get('moon-day-next1').textContent,'25.11.');
  assert.equal(lunar.nodes.get('moon-day-next2').textContent,'26.11.');
  assert.equal(lunar.nodes.get('moon-next-full').textContent,'Nächster Vollmond: Heute');
  const fullMoons=['2026-01-03T10:03:00Z','2026-02-01T22:09:00Z','2026-03-03T11:38:00Z','2026-04-02T02:12:00Z','2026-05-01T17:23:00Z','2026-05-31T08:45:00Z','2026-06-29T23:56:00Z','2026-07-29T14:36:00Z','2026-08-28T04:18:00Z','2026-09-26T16:49:00Z','2026-10-26T04:12:00Z','2026-11-24T14:53:00Z','2026-12-24T01:28:00Z','2027-01-22T12:17:00Z'];
  for(const reference of fullMoons) {
    const expected=Date.parse(reference);lunar.context.before=expected-2*86400000;
    const actual=lunar.run('nextFullMoon(new Date(before)).valueOf()');
    assert(Math.abs(actual-expected)<120000,'Full moon agrees within two minutes of USNO: '+reference);
  }
  lunar.run("renderMoon(new Date('2026-11-24T20:00:00Z'))");
  assert.equal(lunar.nodes.get('moon-next-full').textContent,'Nächster Vollmond: 24.12.2026','After the event, advance to the following full moon');
  lunar.run("renderMoon(new Date('2026-06-28T12:00:00Z'))");
  assert.equal(lunar.nodes.get('moon-next-full').textContent,'Nächster Vollmond: 30.06.2026','Full-moon date uses Berlin time, not UTC');
  lunar.run("renderMoon(new Date('2026-06-30T00:30:00+02:00'))");
  assert.equal(lunar.nodes.get('moon-next-full').textContent,'Nächster Vollmond: Heute','Today is determined in Berlin even when the UTC date differs');
  for(const [date,labels] of [
    ['2026-03-30T00:30:00+02:00',['28.03.','29.03.','Heute','31.03.','01.04.']],
    ['2026-10-26T00:30:00+01:00',['24.10.','25.10.','Heute','27.10.','28.10.']],
    ['2026-12-31T23:30:00+01:00',['29.12.','30.12.','Heute','01.01.','02.01.']]
  ]) {
    lunar.context.date=date;lunar.run('renderMoon(new Date(date))');
    for(const [index,key] of ['prev2','prev1','today','next1','next2'].entries())assert.equal(lunar.nodes.get('moon-day-'+key).textContent,labels[index],'Calendar days survive DST and year boundaries');
  }
  lunar.run("renderMoon(new Date('invalid'))");
  assert.equal(lunar.nodes.get('moon-illumination').textContent,'\u2014');
  assert.equal(lunar.nodes.get('moon-lit').attributes.d,'');
  assert.equal(lunar.nodes.get('moon-next-full').textContent,'Nächster Vollmond: nicht verfügbar');
  assert(html.indexOf('id="moon-title"')>html.indexOf('id="wind-time"'));
  assert(html.indexOf('id="moon-title"')<html.indexOf('>Ausblick'));

  const river=harness();
  const gauge={uuid:'f33c3cc9-dc4b-4b77-baa9-5a5f10704398',km:814,water:{shortname:'RHEIN'},timeseries:[{shortname:'W',unit:'cm',currentMeasurement:{value:405,timestamp:'2026-11-24T11:00:00+01:00',stateMnwMhw:'normal'}}]};
  river.context.gauge=gauge;
  for(const [state,label] of [['low','Niedrig'],['normal','Normal'],['high','Hoch']]) {
    gauge.timeseries[0].currentMeasurement.stateMnwMhw=state;
    river.run('riverReading=normalizeRiver(gauge);riverFailed=false;renderRiver()');
    assert.equal(river.nodes.get('river-value').textContent,'405');
    assert.equal(river.nodes.get('river-state').textContent,label);
    assert.equal(river.nodes.get('river-'+state).style['--river-column'],'2','The current water-level picture always occupies the center');
    assert.equal(river.nodes.get('river-'+state).dataset.position,'center');
    for(const key of ['low','normal','high'])assert.equal(river.nodes.get('river-'+key).dataset.current,String(key===state));
  }
  for(const value of [0,-10]) {
    gauge.timeseries[0].currentMeasurement.value=value;
    assert.equal(river.run('normalizeRiver(gauge).value'),value,'Zero and negative gauge readings are valid');
  }
  for(const bad of [null,NaN,'405']) {
    gauge.timeseries[0].currentMeasurement.value=bad;
    assert.throws(()=>river.run('normalizeRiver(gauge)'));
  }
  gauge.timeseries[0].currentMeasurement.value=405;
  for(const mutation of [g=>g.timeseries[0].unit='m',g=>g.uuid='other',g=>g.km=800,g=>g.timeseries[0].currentMeasurement.timestamp='invalid']) {
    const invalid=structuredClone(gauge);mutation(invalid);river.context.invalidGauge=invalid;
    assert.throws(()=>river.run('normalizeRiver(invalidGauge)'));
  }
  for(const state of ['unknown','commented','out-dated']) {
    gauge.timeseries[0].currentMeasurement.stateMnwMhw=state;
    assert.equal(river.run('riverStatus(normalizeRiver(gauge)).key'),'unknown');
  }
  gauge.timeseries[0].currentMeasurement.stateMnwMhw='normal';
  for(const timestamp of ['2026-11-22T11:00:00Z','2026-11-25T11:00:00Z']) {
    gauge.timeseries[0].currentMeasurement.timestamp=timestamp;
    assert.equal(river.run('riverStatus(normalizeRiver(gauge)).key'),'unknown','Stale or future values have no active classification');
  }
  gauge.timeseries[0].currentMeasurement.timestamp='2026-11-24T11:00:00+01:00';
  river.context.history=[{timestamp:'2026-11-24T10:00:00+01:00',value:402}];
  assert.equal(river.run('calculateRiverTrend(normalizeRiver(gauge),history)'),3);
  for(const [baseline,expected,label] of [[402,3,'Steigend'],[408,-3,'Fallend'],[405,0,'Gleichbleibend']]) {
    river.context.history[0].value=baseline;
    river.run('riverReading=normalizeRiver(gauge);riverTrend=calculateRiverTrend(riverReading,history);renderRiver()');
    assert.equal(river.run('riverTrend'),expected);
    assert(river.nodes.get('river-trend').textContent.includes(label));
  }
  for(const history of [[],null,[{value:null,timestamp:'2026-11-24T10:00:00+01:00'}],[{value:400,timestamp:'2026-11-24T09:45:00+01:00'}],[{value:400,timestamp:'invalid'}]]) {
    river.context.history=history;
    assert.equal(river.run('calculateRiverTrend(normalizeRiver(gauge),history)'),null,'Incomplete history never implies a steady trend');
  }
  let resolveRiver,riverCalls=0;
  river.context.fetch=(url)=>{
    if(url.includes('/W/measurements.json')) {
      const query=new URL(url).searchParams;
      assert.equal(query.get('start'),'2026-11-24T08:58:00.000Z');
      assert.equal(query.get('end'),'2026-11-24T09:02:00.000Z');
      return Promise.resolve({ok:true,json:async()=>[{value:402,timestamp:'2026-11-24T10:00:00+01:00'}]});
    }
    riverCalls++;return new Promise(resolve=>{resolveRiver=resolve;});
  };
  const pendingRiver=river.run('loadRiver()');
  assert.equal(river.run('loadRiver(true)'),pendingRiver,'Concurrent requests share one fetch');
  resolveRiver({ok:true,json:async()=>gauge});await pendingRiver;
  assert.equal(river.nodes.get('river-normal').dataset.current,'true');
  assert.equal(river.nodes.get('river-trend').textContent,'↗ Steigend · +3 cm in 1 Stunde');
  assert(river.nodes.get('river-time').textContent.includes('11:00'),'Measurement time uses Berlin timezone');
  await river.run('loadRiver()');assert.equal(riverCalls,1,'Resume does not refetch immediately');
  river.context.fetch=async()=>{throw Error('offline');};
  await river.run('loadRiver(true)');
  assert.equal(river.nodes.get('river-value').textContent,'405','Failed refresh preserves last known reading');
  assert.equal(river.nodes.get('river-normal').dataset.current,'false','Failed refresh cannot claim a current classification');
  assert(river.nodes.get('river-time').textContent.startsWith('Letzter bekannter'));
  assert.equal(river.nodes.get('river-trend').textContent,'Trend nicht verfügbar','A failed refresh hides a previous trend');
  river.context.fetch=async url=>{
    if(url.includes('/W/measurements.json'))throw Error('history unavailable');
    return {ok:true,json:async()=>gauge};
  };
  await river.run('loadRiver(true)');
  assert.equal(river.nodes.get('river-normal').dataset.current,'true','Unavailable history does not discard a valid water level');
  assert.equal(river.nodes.get('river-trend').textContent,'Trend nicht verfügbar');
  river.context.fetch=(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))));
  const timeoutRiver=river.run('loadRiver(true)');river.advance(10000);await timeoutRiver;
  assert.equal(river.nodes.get('river-panel').attributes['aria-busy'],'false','Timed-out requests release the loading state');
  assert(html.indexOf('id="river-title"')>html.indexOf('id="moon-title"'));
  assert(html.indexOf('id="river-title"')<html.indexOf('>Ausblick'));

  const listeners={},deleted=[];
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const version=sw.match(/const CACHE = '([^']+)'/)[1];
  vm.runInNewContext(sw,{
    URL,
    self:{addEventListener(name,callback){listeners[name]=callback;},clients:{claim:async()=>{} }},
    caches:{keys:async()=>['bresser-v1',version,'other-app-cache'],delete:async key=>deleted.push(key)}
  });
  let activation;
  listeners.activate({waitUntil(promise){activation=promise;}});await activation;
  assert.deepEqual(deleted,['bresser-v1'],'Only obsolete weather-app caches are deleted');
  let riverIntercepted=false;
  listeners.fetch({request:{method:'GET',url:'https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/WESEL.json'},respondWith(){riverIntercepted=true;}});
  assert.equal(riverIntercepted,false,'Official gauge requests bypass the service-worker cache');
  assert(sw.includes('./assets/rhine-levels.jpg'));
  assert(fs.statSync(path.join(root,'assets/rhine-levels.jpg')).size>0);
  for(const name of ['app.js','styles.css']) {
    const asset=html.match(new RegExp(name.replace('.','\\.')+'\\?v=\\d+'))[0];
    assert(sw.includes(asset),'Service worker and HTML asset versions match');
  }
  console.log('PASS: five-day moon timeline, DST/year boundaries, 14 USNO full-moon references, Berlin full-moon dates, moon orientation/offline support, gauges, compass, slider, navigation, weather and service worker.');
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

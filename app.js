'use strict';
const ID='d1073176104',TZ='Europe/Berlin',LAT=51.720833,LON=6.588056;
const $=id=>document.getElementById(id);
const numberFormatters=new Map();
const fmt=(n,d=1)=>{
  if(!Number.isFinite(n))return '\u2014';
  if(!numberFormatters.has(d))numberFormatters.set(d,new Intl.NumberFormat('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}));
  return numberFormatters.get(d).format(n);
};
const dayFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
const recordFormatter = new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const selectedDateFormatter=new Intl.DateTimeFormat('de-DE',{timeZone:TZ,day:'2-digit',month:'2-digit',year:'numeric'});
const readingFormatter=new Intl.DateTimeFormat('de-DE',{timeZone:TZ,dateStyle:'short',timeStyle:'short'});
const dateBerlin=()=>dayFormatter.format(new Date());
const isoDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const addDay=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const yearMonth=s=>s.slice(0,7),range=(a,b)=>{const out=[];for(let d=a;d<=b;d=addDay(d,1))out.push(d);return out};
let chosenDay=dateBerlin(),chosenHour=12,archive={},loaded=new Set(),live=null;
let currentWeather=null;
$('date').value=chosenDay;$('date').max=dateBerlin();$('next').disabled=true;
const hourTime = hour => String(hour).padStart(2,'0')+':00';
const hourLabel = hour => hour === 24 ? '24:00 Uhr (Tagesende)' : hourTime(hour)+' Uhr';
function updateHourControl() {
  if ($('hour').value !== String(chosenHour)) $('hour').value = String(chosenHour);
  $('hour').setAttribute('aria-valuetext', hourLabel(chosenHour));
  $('hour-value').textContent = String(chosenHour);
  $('hour-preview').textContent = String(chosenHour);
  $('hour-control').style.setProperty('--hour-position', (chosenHour / 24 * 100)+'%');
  $('hour-control').style.setProperty('--hour-offset', (28 - chosenHour / 24 * 56)+'px');
}
let hourRenderFrame = null;
function flushHourSelection() {
  if (hourRenderFrame === null) return;
  cancelAnimationFrame(hourRenderFrame);
  hourRenderFrame = null;
  renderSelection();
}
function selectHour(value) {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 24 || hour === chosenHour) return;
  chosenHour = hour;
  // Keep the thumb label immediate; combine expensive work into one paint.
  updateHourControl();
  if (hourRenderFrame === null) hourRenderFrame = requestAnimationFrame(() => {
    hourRenderFrame = null;
    renderSelection();
  });
}
// Pointer changes require a continuous two-second hold. Keyboard input stays native.
let hourPress = null;
function hourFromPointer(clientX, offset=0) {
  const rect=$('hour').getBoundingClientRect();
  return Math.max(0,Math.min(24,Math.round((clientX-rect.left-28-offset)/Math.max(1,rect.width-56)*24)));
}
function endHourPress(event) {
  const press=hourPress;
  if (!press || (event?.pointerId !== undefined && event.pointerId !== press.id)) return;
  hourPress=null;
  clearTimeout(press.timer);
  $('hour-control').dataset.pressState='idle';
  if (press.active) flushHourSelection();
  if ($('hour').hasPointerCapture(press.id)) $('hour').releasePointerCapture(press.id);
}
$('hour').onpointerdown = event => {
  if (event.isPrimary === false || event.button !== 0) return;
  event.preventDefault();
  endHourPress();
  $('hour').focus({preventScroll:true});
  const rect=$('hour').getBoundingClientRect();
  const center=rect.left+28+(rect.width-56)*chosenHour/24;
  const onThumb=Math.abs(event.clientX-center)<=28 && Math.abs(event.clientY-rect.top-rect.height/2)<=28;
  const press={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,
    offset:onThumb?event.clientX-center:0,active:false,timer:null};
  hourPress=press;
  $('hour-control').dataset.pressState='holding';
  $('hour').setPointerCapture(press.id);
  press.timer=setTimeout(() => {
    if (hourPress !== press) return;
    press.active=true;
    $('hour-control').dataset.pressState='dragging';
    selectHour(hourFromPointer(press.x,press.offset));
  },2000);
};
$('hour').onpointermove = event => {
  const press=hourPress;
  if (!press || press.id !== event.pointerId) return;
  if (!press.active && Math.hypot(event.clientX-press.startX,event.clientY-press.startY)>12) {
    endHourPress(event);return;
  }
  press.x=event.clientX;
  if (press.active) { event.preventDefault();selectHour(hourFromPointer(press.x,press.offset)); }
};
$('hour').onpointerup = event => {
  if (!hourPress || hourPress.id !== event.pointerId) return;
  event.preventDefault();
  if (hourPress.active) selectHour(hourFromPointer(event.clientX,hourPress.offset));
  endHourPress(event);
};
$('hour').onpointercancel=endHourPress;
$('hour').onlostpointercapture=endHourPress;
$('hour').onblur=()=>endHourPress();
$('hour').onkeydown=()=>endHourPress();
$('hour').onclick=event=>event.preventDefault();
$('hour').oncontextmenu=event=>event.preventDefault();
$('hour-ruler').onpointerdown=$('hour').onpointerdown;
$('hour-ruler').oncontextmenu=$('hour').oncontextmenu;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)endHourPress();
  else { renderCurrentWeather();forecast(); }
});
$('hour').oninput = event => {
  if (hourPress) { updateHourControl();return; }
  selectHour(event.target.value);
};
$('hour').onchange = flushHourSelection;
function changeDate(v) {
  if (!v || v > dateBerlin() || v === chosenDay) return;
  endHourPress();
  chosenDay=v;$('date').value=v;$('next').disabled=v>=dateBerlin();
  render();
  return loadRelevant().then(() => { if (chosenDay === v) render(); });
}
$('prev').onclick=()=>changeDate(addDay(chosenDay,-1));$('next').onclick=()=>changeDate(addDay(chosenDay,1));$('date').onchange=e=>changeDate(e.target.value);
$('refresh').onclick = async () => {
  if ($('refresh').disabled) return;
  $('refresh').disabled=true;$('refresh').setAttribute('aria-busy','true');
  try { await Promise.all([loadRelevant(true),forecast()]);render(); }
  finally { $('refresh').disabled=false;$('refresh').setAttribute('aria-busy','false'); }
};
async function fetchJson(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}
const pendingMonths = new Map();
let dataRequest = 0;
async function loadMonth(month,force=false) {
  if (loaded.has(month) && !force) return;
  if (pendingMonths.has(month)) return pendingMonths.get(month);
  const pending = (async () => {
    try { const data=await fetchJson('data/'+month+'.json');archive[month]=Array.isArray(data)?data:[]; }
    catch { archive[month] ??= []; }
    loaded.add(month);
  })();
  pendingMonths.set(month,pending);
  try { await pending; } finally { pendingMonths.delete(month); }
}
function formatUpdated(timestamp) {
  const dt=new Date(timestamp);if(Number.isNaN(dt.getTime()))return 'Zeitpunkt unbekannt';
  const p=Object.fromEntries(recordFormatter.formatToParts(dt).map(part=>[part.type,part.value]));
  return p.day+'/'+p.month+'/'+p.year.slice(-2)+' '+p.hour+':'+p.minute;
}
async function loadRelevant(force=false) {
  const request=++dataRequest,day=chosenDay;
  const weekDay=(new Date(day+'T12:00:00Z').getUTCDay()+6)%7,weekStart=addDay(day,-weekDay);
  const months=new Set([yearMonth(day),yearMonth(addDay(day,-1)),yearMonth(addDay(day,1)),yearMonth(weekStart),yearMonth(day.replace(/^\d{4}/,String(+day.slice(0,4)-1)))]);
  await Promise.all([...months].map(month=>loadMonth(month,force)));
  let nextLive=null,failed=false;
  try { nextLive=await fetchJson('data/latest.json'); } catch { failed=true; }
  if (request !== dataRequest) return;
  if (!failed) live=nextLive;
  if (failed && live?.timestamp) $('status').textContent='Aktualisierung fehlgeschlagen \u00b7 letzter Messpunkt: '+formatUpdated(live.timestamp);
  else if (!live&&!Object.values(archive).some(rows=>rows.length)) $('status').textContent='Keine Messdaten archiviert \u00b7 Messwertsammler noch nicht eingerichtet';
  else $('status').textContent=live?.timestamp?'Zuletzt aktualisiert: '+formatUpdated(live.timestamp):'Archivdaten geladen \u00b7 kein aktueller Zeitstempel';
}
const emptyRecords = Object.freeze([]),recordTimes = new WeakMap(),monthDays = new Map();
function records(month){return archive[month]||emptyRecords;}
function readingTime(record) {
  if (!record || typeof record !== 'object') return null;
  const cached=recordTimes.get(record);
  if (cached && cached.timestamp === record.timestamp) return cached.value;
  const epoch=Date.parse(record.timestamp);
  let value=null;
  if (Number.isFinite(epoch)) {
    const p=Object.fromEntries(recordFormatter.formatToParts(new Date(epoch)).map(part=>[part.type,part.value]));
    value={day:p.year+'-'+p.month+'-'+p.day,minute:Number(p.hour)*60+Number(p.minute),epoch};
  }
  recordTimes.set(record,{timestamp:record.timestamp,value});
  return value;
}
function recordsForDay(day) {
  const month=yearMonth(day),source=records(month);
  let index=monthDays.get(month);
  if (!index || index.source !== source) {
    const days=new Map();
    for (const record of source) {
      const time=readingTime(record);if(!time)continue;
      if (!days.has(time.day)) days.set(time.day,[]);
      days.get(time.day).push(record);
    }
    index={source,days};monthDays.set(month,index);
  }
  return index.days.get(day)||emptyRecords;
}
function nearest(day,time) {
  const target=time==='24:00'?1440:Number(time.slice(0,2))*60+Number(time.slice(3));
  let best=null,difference=Infinity;
  for (const offset of [-1,0,1]) for (const record of recordsForDay(addDay(day,offset))) {
    const info=readingTime(record),delta=Math.abs(info.minute+offset*1440-target);
    if (delta < difference) { best=record;difference=delta; }
  }
  return difference <= 20 ? best : null;
}
function latestForDay(day,limit) {
  const until=limit?Date.parse(limit):Infinity;
  let latest=null,last=-Infinity;
  for (const record of recordsForDay(day)) {
    const epoch=readingTime(record).epoch;
    if (epoch <= until && epoch > last) { latest=record;last=epoch; }
  }
  return latest;
}
function periodRain(day,kind,limit) {
  if(kind==='day')return latestForDay(day,limit)?.rain_day??null;
  if(kind==='month')return latestForDay(day,limit)?.rain_month??null;
  const dow=(new Date(day+'T12:00:00Z').getUTCDay()+6)%7;
  let total=0;
  for(const date of range(addDay(day,-dow),day)) {
    const record=latestForDay(date,date===day?limit:null);
    if(!Number.isFinite(record?.rain_day))return null;
    total+=record.rain_day;
  }
  return total;
}
const direction=deg=>{if(!Number.isFinite(deg))return '—';return ['N','NO','O','SO','S','SW','W','NW'][Math.round(deg/45)%8]};

// Simplified wind classes based on Beaufort km/h ranges (DWD).
// https://www.dwd.de/DE/fachnutzer/landwirtschaft/dokumentationen/isabel/windgeschwindigkeit_dokumentation.pdf
function windStrength(speed) {
  if (!Number.isFinite(speed) || speed < 0) return null;
  // Six requested Beaufort groups: 0-3, 4-5, 6-7, 8-9, 10-11, 12.
  const index = [20,39,62,89,118].findIndex(limit => speed < limit);
  const level = index < 0 ? 5 : index;
  return {level, label:['Bft 0-3','Bft 4-5','Bft 6-7','Bft 8-9','Bft 10-11','Bft 12'][level]};
}
function renderWind(wind) {
  const strength = windStrength(wind?.wind_speed);
  $('wind').textContent = strength ? fmt(wind.wind_speed) : '\u2014';
  $('wind-strength').textContent = strength ? strength.label : 'Keine Windmessung vorhanden';
  for (let i=0;i<6;i++) $('windsock-'+i).dataset.active = String(strength?.level === i);
  const calm = Number.isFinite(wind?.wind_speed) && wind.wind_speed >= 0 && wind.wind_speed < 1;
  const hasDirection = !calm && Number.isFinite(wind?.wind_direction);
  const degrees = hasDirection ? (wind.wind_direction % 360 + 360) % 360 : 0;
  // Weathercloud reports the origin; the arrow points toward the destination.
  const travelDegrees = (degrees + 180) % 360;
  const names = ['Norden','Nordosten','Osten','S\u00fcdosten','S\u00fcden','S\u00fcdwesten','Westen','Nordwesten'];
  const origin = hasDirection ? 'Wind aus '+names[Math.round(degrees/45)%8]+' ('+direction(degrees)+') \u00b7 '+Math.round(degrees)%360+'\u00b0' : calm ? 'Windstill \u00b7 keine Windrichtung' : 'Windrichtung nicht verf\u00fcgbar';
  $('direction').textContent = origin;
  $('wind-compass').setAttribute('aria-label', hasDirection ? origin+'. Wind weht nach '+names[Math.round(travelDegrees/45)%8] : origin);
  $('wind-compass-pointer').setAttribute('transform', 'rotate('+travelDegrees+' 90 90)');
  $('wind-compass-pointer').setAttribute('opacity', hasDirection ? '1' : '0');
  $('wind-time').textContent=wind?.timestamp?'Messung: '+new Date(wind.timestamp).toLocaleString('de-DE',{timeZone:TZ,timeStyle:'short'}):'Keine aktuelle Windmessung';
}

// Current WMO codes: https://open-meteo.com/en/docs#weathervariables
const snowCodes=new Set([71,73,75,77,85,86]);
const rainCodes=new Set([51,53,55,56,57,61,63,65,66,67,80,81,82]);
const iceCodes=new Set([56,57,66,67]);
function normalizeCurrentWeather(data) {
  const current=data?.current;
  if(!Number.isInteger(current?.weather_code) || ![0,1].includes(current?.is_day))return null;
  let time;
  if(typeof current.time==='number')time=current.time*1000;
  else if(typeof current.time==='string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(current.time))time=Date.parse(current.time);
  else if(typeof current.time==='string' && Number.isFinite(data.utc_offset_seconds))time=Date.parse(current.time+'Z')-data.utc_offset_seconds*1000;
  if(!Number.isFinite(time))return null;
  return {code:current.weather_code,isDay:current.is_day===1,time,wind:current.wind_speed_10m,gusts:current.wind_gusts_10m};
}
function weatherState(station=live,model=currentWeather,now=Date.now()) {
  const recent=time=>Number.isFinite(time)&&time>=now-60*60*1000&&time<=now+15*60*1000;
  const stationTime=Date.parse(station?.timestamp),hasStation=recent(stationTime),hasModel=recent(model?.time);
  const result=(kind,label,source,time)=>({kind,label,source,time});
  const modeled=(kind,label)=>result(kind,label,'Open-Meteo (modellbasiert)',model.time);
  if(hasStation && station.wind_speed>=75)return result('storm',station.wind_speed>=118?'Orkan':'Es st\u00fcrmt','Station',stationTime);
  if(hasModel && [95,96,97,99].includes(model.code))return modeled('thunder','Gewitter');
  if(hasStation && station.rain_rate>0) {
    if(hasModel && snowCodes.has(model.code))return result('snow','Es schneit','Station + Open-Meteo (Niederschlagsart modellbasiert)',model.time);
    if(hasModel && iceCodes.has(model.code))return result('ice','Gefrierender Regen','Station + Open-Meteo (Niederschlagsart modellbasiert)',model.time);
    return result('rain','Es regnet','Station',stationTime);
  }
  // A rain gauge alone cannot identify snowfall or sunshine.
  if(hasModel && snowCodes.has(model.code))return modeled('snow','Es schneit');
  if(hasStation && station.wind_speed>=62)return result('storm','St\u00fcrmisch','Station',stationTime);
  if(hasModel && (model.wind>=75 || model.gusts>=75))return modeled('storm',model.wind>=75?'Es st\u00fcrmt':'Sturmb\u00f6en');
  if(hasModel) {
    if(iceCodes.has(model.code))return modeled('ice','Gefrierender Regen');
    if(rainCodes.has(model.code)) {
      if(hasStation && station.rain_rate===0)return modeled('rain','Regen m\u00f6glich');
      return modeled([51,53,55].includes(model.code)?'drizzle':'rain',[51,53,55].includes(model.code)?'Es nieselt':'Es regnet');
    }
    if([45,48].includes(model.code))return modeled('fog','Es ist neblig');
    if([0,1].includes(model.code))return modeled(model.isDay?'sun':'moon',model.isDay?'Sonnig':'Klarer Himmel');
    if(model.code===2)return modeled(model.isDay?'partly':'partly-night','Leicht bew\u00f6lkt');
    if(model.code===3)return modeled('cloudy','Bew\u00f6lkt');
  }
  if(hasStation && station.wind_speed>=39)return result('storm','Starker Wind','Station',stationTime);
  return result('unknown','Keine Wetterdaten','Wetterzustand nicht verf\u00fcgbar',null);
}
function renderCurrentWeather() {
  const state=weatherState();
  const info=state.label+' \u00b7 '+state.source+(Number.isFinite(state.time)?' \u00b7 '+readingFormatter.format(new Date(state.time)):'');
  $('current-weather').dataset.weather=state.kind;
  $('current-weather').setAttribute('aria-label',info);
  $('current-weather').setAttribute('title',info);
  $('current-weather-label').textContent=state.label;
}

// Fixed Celsius scale shared by both speedometers; numeric values remain exact.
function updateTemperatureGauge(kind, value) {
  const gauge = $(kind+'-gauge');
  const available = Number.isFinite(value);
  const fraction = available ? Math.max(0, Math.min(1, (value + 20) / 60)) : 0;
  gauge.dataset.empty = String(!available);
  const needle = $(kind+'-needle');
  needle.setAttribute('transform', 'rotate('+fraction*270+' 160 160)');
  needle.setAttribute('opacity', available ? '1' : '0');
  gauge.nextElementSibling.textContent = available ? fmt(value)+' \u00b0C' : 'Keine Temperaturmessung vorhanden';
}

function renderSelection(){
const time=hourTime(chosenHour),r=nearest(chosenDay,time),until=r?.timestamp;
$('selected-time').textContent = selectedDateFormatter.format(new Date(chosenDay+'T12:00:00Z')) + ' · ' + hourLabel(chosenHour);
updateTemperatureGauge('selected', r?.temperature);
$('selected-hint').textContent=r?'Messwert am gewählten Zeitpunkt (±20 Minuten)':'Keine Stationsmessung zu dieser Uhrzeit (±20 Minuten).';$('temp').textContent=fmt(r?.temperature).replace(',', '.');$('feels').textContent=fmt(r?.feels);$('reading-time').textContent=r?'Gemessen: '+readingFormatter.format(new Date(r.timestamp)):'Keine Messung vorhanden';$('rainrate').textContent=fmt(r?.rain_rate);$('rainday').textContent=fmt(periodRain(chosenDay,'day',until));$('rainweek').textContent=fmt(periodRain(chosenDay,'week',until));$('rainmonth').textContent=fmt(periodRain(chosenDay,'month',until));
const priorDay=(+chosenDay.slice(0,4)-1)+chosenDay.slice(4),prev=latestForDay(priorDay,until?priorDay+'T23:59:59Z':null);const curr=periodRain(chosenDay,'month',until),old=prev?.rain_month;
$('compare').textContent=Number.isFinite(curr)&&Number.isFinite(old)?`Vorjahr bis ${priorDay.slice(5).replace('-','.')}.: ${fmt(old)} mm · ${fmt(curr-old)} mm (${old>0?fmt((curr-old)/old*100,0)+' %':'Prozentvergleich nicht möglich'})`:'Vorjahr: Keine vergleichbaren Stationsdaten';
}
function renderCurrent(){
  renderCurrentWeather();
  $('current-temp').textContent = fmt(live?.temperature).replace(',', '.');
  updateTemperatureGauge('current', live?.temperature);

  $('current-time').textContent = live?.timestamp
    ? 'Messpunkt: ' + formatUpdated(live.timestamp) + ' Uhr'
    : 'Noch keine aktuelle Messung';
const isToday=chosenDay===dateBerlin();
const wind=isToday?(readingTime(live)?.day===chosenDay?live:latestForDay(chosenDay)):null;
renderWind(wind);
}
function render(){
  if (hourRenderFrame !== null) { cancelAnimationFrame(hourRenderFrame);hourRenderFrame=null; }
  updateHourControl();renderCurrent();renderSelection();
}
let forecastPending=null;
function forecast(){
  if(forecastPending)return forecastPending;
  forecastPending=loadForecast().finally(()=>{forecastPending=null;});
  return forecastPending;
}
async function loadForecast(){try{const url=new URL('https://api.open-meteo.com/v1/forecast');Object.entries({latitude:LAT,longitude:LON,timezone:TZ,forecast_days:4,wind_speed_unit:'kmh',current:'weather_code,is_day,wind_speed_10m,wind_gusts_10m',daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max'}).forEach(([k,v])=>url.searchParams.set(k,v));const x=await fetchJson(url);currentWeather=normalizeCurrentWeather(x);renderCurrentWeather();const d=x.daily,days=[1,2,3].map(i=>({date:d.time[i],min:d.temperature_2m_min[i],max:d.temperature_2m_max[i],rain:d.precipitation_sum[i],p:d.precipitation_probability_max[i],gust:d.wind_gusts_10m_max[i]}));if(days.some(x=>!x.date))throw Error('Unvollständige Prognose');const start=(d.temperature_2m_max[0]+d.temperature_2m_min[0])/2,end=(days[2].max+days[2].min)/2,diff=end-start;const trend=Math.abs(diff)<2?'Die Temperaturen bleiben ungefähr gleich.':diff>0?'Die Temperaturen werden voraussichtlich steigen.':'Die Temperaturen werden voraussichtlich sinken.';const rain=days.filter(x=>(x.rain??0)>=0.5||(x.p??0)>=60);const windy=days.filter(x=>(x.gust??0)>=50);const entries=[['Temperatur',trend],['Niederschlag',rain.length?`Niederschlag an ${rain.map(x=>new Date(x.date+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short'})).join(', ')} erwartet.`:'Derzeit kein nennenswerter Niederschlag prognostiziert.'],['Wind / Sturm',windy.length?`Erhöhte Windböen möglich (bis ${fmt(Math.max(...windy.map(x=>x.gust)),0)} km/h).`:'Derzeit keine stärkeren Windböen prognostiziert.']];$('forecast').replaceChildren();for(const [name,description]of entries){let n=document.createElement('div');n.className='forecast-item';let b=document.createElement('strong');b.textContent=name;let p=document.createElement('p');p.textContent=description;n.append(b,p);$('forecast').append(n)}}catch(e){renderCurrentWeather();$('forecast').textContent='Prognose derzeit nicht verfügbar.'}}
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});updateHourControl();loadRelevant().then(render);forecast();

// Keep the current-weather icon fresh without polling while the app is hidden.
setInterval(()=>{if(!document.hidden)forecast();},10*60*1000);

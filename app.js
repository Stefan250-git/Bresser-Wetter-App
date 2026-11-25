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
  $('archive-hour-label').textContent=hourLabel(chosenHour);
  $('hour-back').disabled=chosenHour===0;$('hour-forward').disabled=chosenHour===24;
  if ($('hour').value !== String(chosenHour)) $('hour').value = String(chosenHour);
  $('hour').setAttribute('aria-valuetext', hourLabel(chosenHour));
  $('hour-value').textContent = String(chosenHour);
  $('hour-preview').textContent = String(chosenHour);
  $('hour-control').style.setProperty('--hour-position', (chosenHour / 24 * 100)+'%');
  $('hour-control').style.setProperty('--hour-offset', (24 - chosenHour / 24 * 48)+'px');
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
// Native range input: direct touch, mouse and keyboard; no long-press gate.
function endHourPress(){flushHourSelection();}
$('hour').oninput=event=>selectHour(event.target.value);
$('hour').onchange=flushHourSelection;
$('hour').onpointerup=flushHourSelection;
$('hour').onpointercancel=flushHourSelection;
$('hour-back').onclick=()=>{selectHour(Math.max(0,chosenHour-1));flushHourSelection();};
$('hour-forward').onclick=()=>{selectHour(Math.min(24,chosenHour+1));flushHourSelection();};
let activeView='today';
function switchView(view){
  if(!['today','archive'].includes(view))return;
  activeView=view;
  $('view-today').hidden=view!=='today';$('view-archive').hidden=view!=='archive';
  $('nav-today').setAttribute('aria-pressed',String(view==='today'));
  $('nav-archive').setAttribute('aria-pressed',String(view==='archive'));
  if(view==='today')renderHistory();else renderSelection();
  if(typeof window!=='undefined')window.scrollTo({top:0,behavior:'instant'});
}
$('nav-today').onclick=()=>switchView('today');
$('nav-archive').onclick=()=>switchView('archive');
$('archive-today').onclick=()=>{if(chosenDay!==dateBerlin())changeDate(dateBerlin());else renderSelection();};
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){endHourPress();stopCompassSway();}
  else { renderMoon();renderCurrentWeather();loadRelevant(true).then(render);forecast();loadRiver();checkForAppUpdate(); }
});
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
  try { checkForAppUpdate();await Promise.all([loadRelevant(true),forecast(),loadRiver(true)]);render(); }
  finally { $('refresh').disabled=false;$('refresh').setAttribute('aria-busy','false'); }
};
let latestOffline=false,dataFailed=false;
async function fetchJson(path){
  const r=await fetch(path,{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  if(String(path).includes('data/latest.json'))latestOffline=r.headers?.get('X-Bresser-Offline')==='true';
  return await r.json();
}
function renderStationStatus(){
  const epoch=Date.parse(live?.timestamp),minutes=Math.max(0,Math.floor((Date.now()-epoch)/60000));
  let state='fresh',label='';
  if(!Number.isFinite(epoch)){state='loading';label=dataFailed?'Stationsdaten nicht erreichbar':'Noch keine Stationsmessung';}
  else{
    const age=minutes<1?'gerade eben':minutes<60?'vor '+minutes+' Min.':minutes<1440?'vor '+Math.floor(minutes/60)+' Std.':'vor '+Math.floor(minutes/1440)+' Tagen';
    const offline=latestOffline || (typeof navigator!=='undefined' && navigator.onLine===false);
    state=offline || dataFailed?'offline':minutes>=30?'stale':'fresh';
    label=(offline?'Offline · ':dataFailed?'Abruf fehlgeschlagen · ':minutes>=30?'Ältere Messung · ':'Messung ')+age;
  }
  $('status').textContent=label;$('status').dataset.state=state;
  $('status').setAttribute('title',Number.isFinite(epoch)?'Stationsmessung: '+readingFormatter.format(new Date(epoch)):'Keine Stationsmessung vorhanden');
}

const RIVER_UUID='f33c3cc9-dc4b-4b77-baa9-5a5f10704398';
const RIVER_URL='https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/'+RIVER_UUID+'.json?includeTimeseries=true&includeCurrentMeasurement=true';
let riverReading=null,riverFailed=false,riverPending=null,riverFetchedAt=0,riverTrend=null;
function calculateRiverTrend(reading,measurements) {
  if(!reading || !Number.isFinite(reading.value) || !Array.isArray(measurements))return null;
  const target=Date.parse(reading.timestamp)-60*60*1000;
  if(!Number.isFinite(target))return null;
  // Require a reading at the one-hour mark (allowing two minutes of timestamp jitter).
  const candidates=measurements.filter(item=>Number.isFinite(item?.value) &&
    typeof item?.timestamp==='string' && Math.abs(Date.parse(item.timestamp)-target)<=2*60*1000);
  candidates.sort((a,b)=>Math.abs(Date.parse(a.timestamp)-target)-Math.abs(Date.parse(b.timestamp)-target));
  return candidates.length?Math.round((reading.value-candidates[0].value)*10)/10:null;
}
function normalizeRiver(data) {
  const series=data?.timeseries?.find(series=>series.shortname==='W');
  const reading=series?.currentMeasurement;
  if(data?.uuid!==RIVER_UUID || data?.water?.shortname!=='RHEIN' || data?.km!==814 ||
      series?.unit!=='cm' || !Number.isFinite(reading?.value) ||
      typeof reading?.timestamp!=='string' || !Number.isFinite(Date.parse(reading.timestamp))) {
    throw Error('Ungültige Pegeldaten für Wesel');
  }
  return {value:reading.value,timestamp:reading.timestamp,state:reading.stateMnwMhw};
}
function riverStatus(reading,failed=false,now=Date.now()) {
  if(failed)return {key:'unknown',label:'Abruf fehlgeschlagen'};
  if(!reading)return {key:'unknown',label:'Nicht verfügbar'};
  const age=now-Date.parse(reading.timestamp);
  if(reading.state==='commented')return {key:'unknown',label:'Messstelle gestört'};
  if(reading.state==='out-dated' || age>25*60*60*1000)return {key:'unknown',label:'Messwert veraltet'};
  if(age < -15*60*1000)return {key:'unknown',label:'Messzeitpunkt unklar'};
  const labels={low:'Niedrig',normal:'Normal',high:'Hoch'};
  return {key:labels[reading.state]?reading.state:'unknown',label:labels[reading.state]||'Einordnung unbekannt'};
}
function renderRiver() {
  const status=riverStatus(riverReading,riverFailed);
  $('river-panel').dataset.level=status.key;
  $('river-value').textContent=fmt(riverReading?.value,0);
  $('river-state').textContent=status.label;
  const trend=riverTrend!==null && status.key!=='unknown'?riverTrend:null;
  $('river-trend').textContent=trend===null?'Trend nicht verfügbar':
    (trend>0?'↗ Steigend':trend<0?'↘ Fallend':'→ Gleichbleibend')+' · '+
    (trend>0?'+':'')+fmt(trend,Number.isInteger(trend)?0:1)+' cm in 1 Stunde';
  const center=status.key==='unknown'?'normal':status.key;
  const others=['low','normal','high'].filter(key=>key!==center);
  const positions=[others[0],center,others[1]];
  for(const key of ['low','normal','high']) {
    $('river-'+key).dataset.current=String(status.key===key);
    $('river-'+key).dataset.position=key===center?'center':'side';
    $('river-'+key).style.setProperty('--river-column',String(positions.indexOf(key)+1));
    $('river-'+key).setAttribute('aria-label',({low:'Niedrig',normal:'Normal',high:'Hoch'})[key]+(status.key===key?' – aktueller Zustand':''));
  }
  $('river-time').textContent=riverReading?
    (riverFailed?'Letzter bekannter Messwert: ':'Messung: ')+readingFormatter.format(new Date(riverReading.timestamp))+' Uhr':
    'Keine aktuellen Pegeldaten verfügbar';
}
function loadRiver(force=false) {
  if(riverPending)return riverPending;
  if(!force && riverFetchedAt && Date.now()-riverFetchedAt>=0 && Date.now()-riverFetchedAt<60000) {
    renderRiver();return Promise.resolve();
  }
  $('river-panel').setAttribute('aria-busy','true');
  riverPending=(async()=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(RIVER_URL,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      riverReading=normalizeRiver(await response.json());riverFailed=false;riverFetchedAt=Date.now();
      riverTrend=null;
      // A missing history must not hide an otherwise valid current water level.
      try {
        const target=Date.parse(riverReading.timestamp)-60*60*1000;
        const historyURL=new URL('https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/'+RIVER_UUID+'/W/measurements.json');
        historyURL.searchParams.set('start',new Date(target-2*60*1000).toISOString());
        historyURL.searchParams.set('end',new Date(target+2*60*1000).toISOString());
        const history=await fetch(historyURL.href,{cache:'no-store',signal:controller.signal});
        if(history.ok)riverTrend=calculateRiverTrend(riverReading,await history.json());
      } catch { riverTrend=null; }
    } catch { riverFailed=true; }
    finally { clearTimeout(timeout);renderRiver();$('river-panel').setAttribute('aria-busy','false'); }
  })().finally(()=>{riverPending=null;});
  return riverPending;
}
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
  for(const date of range(addDay(dateBerlin(),-8),dateBerlin()))months.add(yearMonth(date));
  await Promise.all([...months].map(month=>loadMonth(month,force)));
  let nextLive=null,failed=false;
  try { nextLive=await fetchJson('data/latest.json'); } catch { failed=true; }
  if (request !== dataRequest) return;
  if (!failed) live=nextLive;
  dataFailed=failed;renderStationStatus();
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
  const currentTime=readingTime(live);
  if(currentTime?.day===day && currentTime.epoch<=until && currentTime.epoch>last)latest=live;
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
let compassVisible=false,compassAnimation=null;
function stopCompassSway() {
  if(compassAnimation)compassAnimation.cancel();
  compassAnimation=null;
}
function animateCompassNeedle() {
  if($('wind-compass').dataset.directionKnown!=='true')return;
  if(typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const needle=$('wind-compass-sway');
  if(typeof needle.animate!=='function')return;
  stopCompassSway();
  const angles=[0,-3,3,-2.4,2.4,-1.6,1.6,-.8,.8,0];
  const animation=needle.animate(angles.map(angle=>({transform:'rotate('+angle+'deg)',easing:'ease-in-out'})),{duration:1800,easing:'linear',iterations:1});
  compassAnimation=animation;
  animation.onfinish=()=>{if(compassAnimation===animation)compassAnimation=null;};
}
function setupCompassObserver() {
  if(typeof IntersectionObserver!=='function')return null;
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries) {
      if(entry.isIntersecting && entry.intersectionRatio>=.45) {
        if(!compassVisible){compassVisible=true;animateCompassNeedle();}
      } else if(!entry.isIntersecting || entry.intersectionRatio<=.1) {
        compassVisible=false;stopCompassSway();
      }
    }
  },{threshold:[0,.1,.45]});
  observer.observe($('wind-compass'));
  return observer;
}
function renderWind(wind) {
  const strength = windStrength(wind?.wind_speed);
  $('wind').textContent = strength ? fmt(wind.wind_speed) : '\u2014';
  $('wind-strength').textContent = strength ? strength.label : 'Keine Windmessung vorhanden';
  for (let i=0;i<6;i++) $('windsock-'+i).dataset.active = String(strength?.level === i);
  const calm = Number.isFinite(wind?.wind_speed) && wind.wind_speed >= 0 && wind.wind_speed < 1;
  const hasDirection = !calm && Number.isFinite(wind?.wind_direction);
  const hadDirection=$('wind-compass').dataset.directionKnown==='true';
  $('wind-compass').dataset.directionKnown=String(hasDirection);
  const degrees = hasDirection ? (wind.wind_direction % 360 + 360) % 360 : 0;
  // Weathercloud reports the origin; the arrow points toward the destination.
  const travelDegrees = (degrees + 180) % 360;
  const names = ['Norden','Nordosten','Osten','S\u00fcdosten','S\u00fcden','S\u00fcdwesten','Westen','Nordwesten'];
  const origin = hasDirection ? 'Wind aus '+names[Math.round(degrees/45)%8]+' ('+direction(degrees)+') \u00b7 '+Math.round(degrees)%360+'\u00b0' : calm ? 'Windstill \u00b7 keine Windrichtung' : 'Windrichtung nicht verf\u00fcgbar';
  $('direction').textContent = origin;
  $('wind-compass').setAttribute('aria-label', hasDirection ? origin+'. Wind weht nach '+names[Math.round(travelDegrees/45)%8] : origin);
  $('wind-compass-pointer').setAttribute('transform', 'rotate('+travelDegrees+' 90 90)');
  $('wind-compass-pointer').setAttribute('opacity', hasDirection ? '1' : '0');
  if(!hasDirection)stopCompassSway();
  else if(compassVisible && !hadDirection)animateCompassNeedle();
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

// Lunar illumination adapted from SunCalc 1.9.0, (c) Vladimir Agafonkin.
// BSD-2-Clause notice: third-party/SunCalc-LICENSE.txt. No network dependency.
function moonIllumination(date=new Date()) {
  const days=date.valueOf()/86400000-.5+2440588-2451545;
  if(!Number.isFinite(days))return null;
  const rad=Math.PI/180,tilt=23.4397*rad;
  const coordinates=(longitude,latitude)=>({
    ra:Math.atan2(Math.sin(longitude)*Math.cos(tilt)-Math.tan(latitude)*Math.sin(tilt),Math.cos(longitude)),
    dec:Math.asin(Math.sin(latitude)*Math.cos(tilt)+Math.cos(latitude)*Math.sin(tilt)*Math.sin(longitude))
  });
  const anomaly=rad*(357.5291+.98560028*days);
  const sunLongitude=anomaly+rad*(1.9148*Math.sin(anomaly)+.02*Math.sin(2*anomaly)+.0003*Math.sin(3*anomaly)+102.9372)+Math.PI;
  const moonAnomaly=rad*(134.963+13.064993*days);
  const moonLongitude=rad*(218.316+13.176396*days+6.289*Math.sin(moonAnomaly));
  const moonLatitude=rad*5.128*Math.sin(rad*(93.272+13.229350*days));
  const sun=coordinates(sunLongitude,0),moon=coordinates(moonLongitude,moonLatitude);
  const separation=Math.acos(Math.max(-1,Math.min(1,Math.sin(sun.dec)*Math.sin(moon.dec)+Math.cos(sun.dec)*Math.cos(moon.dec)*Math.cos(sun.ra-moon.ra))));
  const incidence=Math.atan2(149598000*Math.sin(separation),385001-20905*Math.cos(moonAnomaly)-149598000*Math.cos(separation));
  const angle=Math.atan2(Math.cos(sun.dec)*Math.sin(sun.ra-moon.ra),Math.sin(sun.dec)*Math.cos(moon.dec)-Math.cos(sun.dec)*Math.sin(moon.dec)*Math.cos(sun.ra-moon.ra));
  return {fraction:Math.max(0,Math.min(1,(1+Math.cos(incidence))/2)),phase:.5+.5*incidence*(angle<0?-1:1)/Math.PI};
}
function moonPhaseName(fraction,waxing) {
  if(fraction<=.005)return 'Neumond';
  if(fraction>=.995)return 'Vollmond';
  if(Math.abs(fraction-.5)<=.035)return waxing?'Erstes Viertel':'Letztes Viertel';
  if(fraction<.5)return waxing?'Zunehmende Sichel':'Abnehmende Sichel';
  return waxing?'Zunehmender Mond':'Abnehmender Mond';
}
function moonDiscPath(fraction,waxing) {
  if(!Number.isFinite(fraction) || fraction<=0)return '';
  const light=Math.min(1,fraction),radius=58,terminator=Math.abs(1-2*light)*radius;
  const outer=waxing?1:0,inner=light<.5?1-outer:outer;
  return 'M80 22 A58 58 0 0 '+outer+' 80 138 '+(terminator<.000001?'L80 22':'A'+terminator.toFixed(3)+' 58 0 0 '+inner+' 80 22')+' Z';
}
// Full-moon timing: Meeus, Astronomical Algorithms ch. 49, adapted from
// MeeusSunMoon (MIT): third-party/MeeusSunMoon-LICENSE.txt.
function fullMoonEpoch(cycle) {
  const k=cycle+.5,t=k/1236.85,e=1-.002516*t-.0000074*t*t;
  const sin=degrees=>Math.sin(degrees*Math.PI/180);
  const m=2.5534+29.10535670*k-.0000014*t*t-.00000011*t**3;
  const p=201.5643+385.81693528*k+.0107582*t*t+.00001238*t**3-.000000058*t**4;
  const f=160.7108+390.67050284*k-.0016118*t*t-.00000227*t**3+.000000011*t**4;
  const node=124.7746-1.56375588*k+.0020672*t*t+.00000215*t**3;
  const terms=[[-.40614,p],[.17302*e,m],[.01614,2*p],[.01043,2*f],[.00734*e,p-m],[-.00515*e,p+m],[.00209*e*e,2*m],[-.00111,p-2*f],[-.00057,p+2*f],[.00056*e,2*p+m],[-.00042,3*p],[.00042*e,m+2*f],[.00038*e,m-2*f],[-.00024*e,2*p-m],[-.00017,node],[-.00007,p+2*m],[.00004,2*p-2*f],[.00004,3*m],[.00003,p+m-2*f],[.00003,2*p+2*f],[-.00003,p+m+2*f],[.00003,p-m+2*f],[-.00002,p-m-2*f],[-.00002,3*p+m],[.00002,4*p]];
  const planets=[[.000325,299.77+.107408*k-.009173*t*t],[.000165,251.88+.016321*k],[.000164,251.83+26.651886*k],[.000126,349.42+36.412478*k],[.000110,84.66+18.206239*k],[.000062,141.74+53.303771*k],[.000060,207.14+2.453732*k],[.000056,154.84+7.306860*k],[.000047,34.52+27.261239*k],[.000042,207.19+.121824*k],[.000040,291.34+1.844379*k],[.000037,161.72+24.198154*k],[.000035,239.56+25.513099*k],[.000023,331.55+3.592518*k]];
  const correction=terms.concat(planets).reduce((sum,[coefficient,angle])=>sum+coefficient*sin(angle),0);
  const jde=2451550.09766+29.530588861*k+.00015437*t*t-.000000150*t**3+.00000000073*t**4+correction;
  // NASA's modern-era Delta-T approximation converts dynamical time to UT.
  const yearOffset=k/12.3685,deltaT=62.92+.32217*yearOffset+.005589*yearOffset*yearOffset;
  return (jde-2440587.5)*86400000-deltaT*1000;
}
function nextFullMoon(date=new Date()) {
  const epoch=date.valueOf();if(!Number.isFinite(epoch))return null;
  const cycle=Math.floor((epoch/86400000+2440587.5-2451550.09766)/29.530588861)-1;
  for(let index=cycle;index<cycle+5;index++) {
    const next=fullMoonEpoch(index);if(next>epoch)return new Date(next);
  }
  return null;
}
const moonDayFormatter=new Intl.DateTimeFormat('de-DE',{timeZone:TZ,day:'2-digit',month:'2-digit'});
const moonDays=[[-2,'prev2'],[-1,'prev1'],[0,'today'],[1,'next1'],[2,'next2']];
function moonDaySample(day) {
  const noon=new Date(day+'T12:00:00Z');
  const parts=Object.fromEntries(recordFormatter.formatToParts(noon).map(part=>[part.type,part.value]));
  return new Date(noon.valueOf()-((Number(parts.hour)-12)*60+Number(parts.minute))*60000);
}
function renderMoon(date=new Date()) {
  const moon=moonIllumination(date);
  if(!moon) {
    $('moon-phase').textContent='Mondphase nicht verf\u00fcgbar';$('moon-illumination').textContent='\u2014';
    $('moon-trend').textContent='';$('moon-time').textContent='Ger\u00e4tezeit nicht verf\u00fcgbar';
    $('moon-next-full').textContent='N\u00e4chster Vollmond: nicht verf\u00fcgbar';
    for(const [offset,key] of moonDays) {
      $('moon-day-'+key).textContent=offset===0?'Heute':'\u2014';
      $(offset===0?'moon-lit':'moon-lit-'+key).setAttribute('d','');
      $(offset===0?'moon-graphic':'moon-graphic-'+key).setAttribute('aria-label','Mondphase nicht verf\u00fcgbar');
    }
    return;
  }
  const day=dayFormatter.format(date);
  for(const [offset,key] of moonDays) {
    const sample=offset===0?date:moonDaySample(addDay(day,offset));
    const illumination=offset===0?moon:moonIllumination(sample),waxing=illumination.phase<.5;
    const name=moonPhaseName(illumination.fraction,waxing),percent=fmt(Math.round(illumination.fraction*100),0);
    $('moon-day-'+key).textContent=offset===0?'Heute':moonDayFormatter.format(sample);
    $(offset===0?'moon-lit':'moon-lit-'+key).setAttribute('d',moonDiscPath(illumination.fraction,waxing));
    const graphic=$(offset===0?'moon-graphic':'moon-graphic-'+key);
    graphic.setAttribute('aria-label',selectedDateFormatter.format(sample)+': '+name+', '+percent+' Prozent beleuchtet');
    graphic.setAttribute('title',readingFormatter.format(sample)+' \u00b7 berechnete Mondphase \u00b7 NASA-Bild \u00b7 Nordhalbkugel');
  }
  const name=moonPhaseName(moon.fraction,moon.phase<.5);
  $('moon-phase').textContent=name;$('moon-illumination').textContent=fmt(Math.round(moon.fraction*100),0)+' %';
  $('moon-trend').textContent=moon.fraction<=.005||moon.fraction>=.995?'':moon.phase<.5?'Zunehmend':'Abnehmend';
  const next=nextFullMoon(date);
  $('moon-next-full').textContent='N\u00e4chster Vollmond: '+(next?(dayFormatter.format(next)===dayFormatter.format(date)?'Heute':selectedDateFormatter.format(next)):'nicht verf\u00fcgbar');
  $('moon-time').textContent='Stand: '+readingFormatter.format(date);
}

// Fixed Celsius scale shared by both speedometers; numeric values remain exact.
function setGaugeReading(id,value,negativeOffset) {
  const text=fmt(value);
  $(id).textContent=text;
  $(id).setAttribute('x',String(text.startsWith('-')?160-negativeOffset:160));
}
function updateTemperatureGauge(kind, value,feels) {
  const gauge = $(kind+'-gauge');
  const available = Number.isFinite(value);
  const fraction = available ? Math.max(0, Math.min(1, (value + 20) / 60)) : 0;
  gauge.dataset.empty = String(!available);
  const needle = $(kind+'-needle');
  needle.setAttribute('transform', 'rotate('+fraction*270+' 160 160)');
  needle.setAttribute('opacity', available ? '1' : '0');
  setGaugeReading(kind==='current'?'current-temp':'temp',value,8);
  setGaugeReading(kind==='current'?'current-feels':'feels',feels,4);
  gauge.nextElementSibling.textContent = 'Gemessene Temperatur: '+(available?fmt(value)+' \u00b0C':'keine Messung')+'. Gef\u00fchlte Temperatur: '+(Number.isFinite(feels)?fmt(feels)+' \u00b0C':'nicht verf\u00fcgbar');
}

function rainComparison(day,record){
  const priorDay=(+day.slice(0,4)-1)+day.slice(4),previous=latestForDay(priorDay);
  const current=record?.rain_month,old=previous?.rain_month;
  if(!Number.isFinite(current)||!Number.isFinite(old))return 'Keine vergleichbaren Vorjahresdaten.';
  return 'Vorjahr bis '+priorDay.slice(5).replace('-','.')+'.: '+fmt(old)+' mm · Differenz '+fmt(current-old)+' mm'+(old>0?' ('+fmt((current-old)/old*100,0)+' %)':'');
}
function renderRainValues(prefix,day,record){
  const week=record?periodRain(day,'week',record.timestamp):null;
  $(prefix+'rainrate').textContent=fmt(record?.rain_rate);
  $(prefix+'rainday').textContent=fmt(record?.rain_day);
  $(prefix+'rainweek').textContent=fmt(week);
  $(prefix+'rainmonth').textContent=fmt(record?.rain_month);
}
function renderSelection(){
  const r=nearest(chosenDay,hourTime(chosenHour));
  $('selected-time').textContent=selectedDateFormatter.format(new Date(chosenDay+'T12:00:00Z'))+' · '+hourLabel(chosenHour);
  updateTemperatureGauge('selected',r?.temperature,r?.feels);
  $('selected-hint').textContent=r?'Nächste Stationsmessung zur Auswahl (±20 Minuten).':'Keine Messung zu dieser Uhrzeit (±20 Minuten).';
  $('reading-time').textContent=r?'Gemessen: '+readingFormatter.format(new Date(r.timestamp)):'Keine Messung vorhanden';
  renderRainValues('archive-',chosenDay,r);
  $('archive-compare').textContent=rainComparison(chosenDay,r);
}
function renderCurrent(){
  renderMoon();renderCurrentWeather();renderStationStatus();
  updateTemperatureGauge('current',live?.temperature,live?.feels);
  $('current-time').textContent=live?.timestamp?'Stationsmessung · '+readingFormatter.format(new Date(live.timestamp)):'Noch keine aktuelle Messung';
  const today=dateBerlin(),reading=latestForDay(today);
  $('date').max=today;$('next').disabled=chosenDay>=today;
  const wind=readingTime(live)?.day===today?live:reading;
  renderWind(wind);
  renderRainValues('',today,reading);
  $('rain-time').textContent=reading?'Stand: '+readingFormatter.format(new Date(reading.timestamp)):'Keine heutige Stationsmessung';
  $('compare').textContent=rainComparison(today,reading);
  $('now-rain').textContent=fmt(reading?.rain_day);
  $('now-wind').textContent=fmt(wind?.wind_speed);
}
let historyHours=24;
function renderHistory(){
  WeatherHistory.render(WeatherHistory.build([...Object.values(archive).flat(),...(live?[live]:[])],historyHours),live);
}
$('history-24').onclick=()=>{historyHours=24;renderHistory();};
$('history-168').onclick=()=>{historyHours=168;renderHistory();};
if(typeof ResizeObserver==='function'){
  let historyWidth=0;
  new ResizeObserver(entries=>{const width=Math.round(entries[0].contentRect.width);if(width!==historyWidth){historyWidth=width;renderHistory();}}).observe($('history-temperature-chart'));
}
function render(){
  if (hourRenderFrame !== null) { cancelAnimationFrame(hourRenderFrame);hourRenderFrame=null; }
  updateHourControl();renderCurrent();renderSelection();renderHistory();
}
let forecastPending=null;
function forecast(){
  if(forecastPending)return forecastPending;
  forecastPending=loadForecast().finally(()=>{forecastPending=null;});
  return forecastPending;
}
let forecastSnapshot=null,forecastFetchedAt=null;
const forecastDayFormatter=new Intl.DateTimeFormat('de-DE',{timeZone:TZ,weekday:'short'});
const forecastDateFormatter=new Intl.DateTimeFormat('de-DE',{timeZone:TZ,day:'2-digit',month:'2-digit'});
function forecastSymbol(code){
  if([95,96,99].includes(code))return ['ϟ','Gewitter'];
  if(snowCodes.has(code))return ['❄','Schnee'];
  if(rainCodes.has(code))return ['☂','Regen'];
  if([45,48].includes(code))return ['≋','Nebel'];
  if([0,1].includes(code))return ['☀','Sonnig'];
  if([2,3].includes(code))return ['☁','Bewölkt'];
  return ['—','Keine Wetterart verfügbar'];
}
function renderForecast(data){
  const d=data?.daily;
  if(!d?.time || d.time.length<4)throw Error('Unvollständige Prognose');
  const cards=[];
  for(let i=1;i<=3;i++){
    if(!d.time[i] || !Number.isFinite(d.temperature_2m_min?.[i]) || !Number.isFinite(d.temperature_2m_max?.[i]))throw Error('Unvollständige Prognose');
    const date=new Date(d.time[i]+'T12:00:00Z'),card=document.createElement('article');card.className='forecast-day';
    const heading=document.createElement('h3');heading.textContent=i===1?'Morgen':forecastDayFormatter.format(date);
    const day=document.createElement('span');day.className='forecast-date';day.textContent=forecastDateFormatter.format(date);
    const symbol=document.createElement('span');symbol.className='forecast-symbol';const [icon,label]=forecastSymbol(d.weather_code?.[i]);
    symbol.textContent=icon+'\uFE0E';symbol.setAttribute('role','img');symbol.setAttribute('aria-label',label);
    const temperature=document.createElement('div');temperature.className='forecast-temperature';temperature.textContent=fmt(d.temperature_2m_max[i],0)+'°';
    const minimum=document.createElement('small');minimum.textContent=' / '+fmt(d.temperature_2m_min[i],0)+'°';temperature.append(minimum);
    temperature.setAttribute('aria-label','Höchstwert '+fmt(d.temperature_2m_max[i])+' Grad, Tiefstwert '+fmt(d.temperature_2m_min[i])+' Grad');
    const rain=document.createElement('div');rain.className='forecast-rain';rain.textContent=fmt(d.precipitation_sum?.[i])+' mm';
    const chance=document.createElement('span');chance.textContent=fmt(d.precipitation_probability_max?.[i],0)+' % Regen';rain.append(chance);
    card.append(heading,day,symbol,temperature,rain);cards.push(card);
  }
  const start=(d.temperature_2m_max[0]+d.temperature_2m_min[0])/2,end=(d.temperature_2m_max[3]+d.temperature_2m_min[3])/2,diff=end-start;
  const trend=!Number.isFinite(diff)?'':Math.abs(diff)<2?'Die Temperaturen bleiben ähnlich.':diff>0?'Es wird voraussichtlich wärmer.':'Es wird voraussichtlich kühler.';
  const gusts=(d.wind_gusts_10m_max||[]).slice(1,4).filter(Number.isFinite),maxGust=gusts.length?Math.max(...gusts):null;
  $('forecast').replaceChildren();$('forecast').append(...cards);
  $('forecast-trend').textContent=trend+(maxGust>=50?' Böen bis '+fmt(maxGust,0)+' km/h möglich.':'');
}
async function loadForecast(){
  try{
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    Object.entries({latitude:LAT,longitude:LON,timezone:TZ,forecast_days:4,wind_speed_unit:'kmh',current:'weather_code,is_day,wind_speed_10m,wind_gusts_10m',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max'}).forEach(([key,value])=>url.searchParams.set(key,value));
    const data=await fetchJson(url);
    currentWeather=normalizeCurrentWeather(data);renderCurrentWeather();renderForecast(data);
    forecastSnapshot=data;forecastFetchedAt=Date.now();
    $('forecast-time').textContent='Open-Meteo · Modellwerte · Stand '+readingFormatter.format(new Date(forecastFetchedAt));
  }catch{
    renderCurrentWeather();
    if(forecastSnapshot){$('forecast-time').textContent='Letzte Prognose · '+readingFormatter.format(new Date(forecastFetchedAt))+' · Aktualisierung nicht möglich';}
    else{$('forecast').textContent='Vorhersage gerade nicht verfügbar.';$('forecast-trend').textContent='';$('forecast-time').textContent='Open-Meteo · Modellwerte';}
  }
}
let appRegistration=null,appUpdate=null,reloadingApp=false;
function showAppUpdate(worker){appUpdate=worker;$('update-banner').hidden=false;}
function checkForAppUpdate(){if(appRegistration)appRegistration.update().catch(()=>{});}
function setupAppUpdates(){
  if(typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
  let hadController=Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloadingApp && typeof window!=='undefined'){reloadingApp=false;window.location.reload();}
    else if(!hadController){hadController=true;loadRelevant(true).then(render);}
  });
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(registration=>{
    appRegistration=registration;if(registration.waiting)showAppUpdate(registration.waiting);
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showAppUpdate(worker);});
    });
  }).catch(()=>{});
}
$('apply-update').onclick=()=>{
  if(!appUpdate)return;
  reloadingApp=true;$('apply-update').disabled=true;
  appUpdate.postMessage({type:'SKIP_WAITING'});
};
setupCompassObserver();
setupAppUpdates();updateHourControl();renderMoon();loadRelevant().then(render);forecast();loadRiver();
setInterval(()=>{if(!document.hidden)renderStationStatus();},60000);

// Keep the current-weather icon fresh without polling while the app is hidden.
setInterval(()=>{if(!document.hidden){loadRelevant(true).then(render);renderMoon();forecast();loadRiver();}},10*60*1000);

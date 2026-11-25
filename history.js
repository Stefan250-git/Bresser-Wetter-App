/* Real station history. UTC instants; Berlin calendar boundaries, including DST. */
'use strict';
const WeatherHistory = (() => {
  const HOUR=3600000, GAP=20*60000, TZ='Europe/Berlin';
  const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
  const clockFormat=new Intl.DateTimeFormat('de-DE',{timeZone:TZ,hour:'2-digit',minute:'2-digit'});
  const dateFormat=new Intl.DateTimeFormat('de-DE',{timeZone:TZ,weekday:'short',day:'2-digit',month:'2-digit'});
  const detailFormat=new Intl.DateTimeFormat('de-DE',{timeZone:TZ,dateStyle:'short',timeStyle:'short'});
  const number=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1,minimumFractionDigits:1});
  const fmt=value=>Number.isFinite(value)?number.format(value):'—';
  // Same Celsius thresholds and smooth transitions as the current gauge.
  // Colors depend on the measured value, never on the selected chart bounds.
  function temperatureColor(value) {
    const blue=[50,135,230],green=[40,166,106],red=[236,85,71];
    const warm=value>22,start=warm?green:blue,end=warm?red:green;
    const fraction=Math.max(0,Math.min(1,(value-(warm?22:1))/6));
    const blend=fraction*fraction*(3-2*fraction);
    return '#'+start.map((channel,index)=>Math.round(channel+(end[index]-channel)*blend).toString(16).padStart(2,'0')).join('');
  }
  const day=time=>dayFormat.format(new Date(time));
  function midnight(key) {
    const noon=Date.parse(key+'T12:00:00Z');
    // Offset at noon and at midnight may differ on a clock-change day.
    for(let time=noon-15*HOUR;time<=noon;time+=HOUR)if(day(time)===key)return time;
    throw Error('Invalid Berlin date');
  }
  function nextDay(key) { return new Date(Date.parse(key+'T12:00:00Z')+24*HOUR).toISOString().slice(0,10); }
  function rows(input) {
    const unique=new Map();
    for(const row of input) {
      if(!row || typeof row.timestamp!=='string' || !/(Z|[+-]\d{2}:\d{2})$/.test(row.timestamp))continue;
      const time=Date.parse(row.timestamp);
      if(Number.isFinite(time))unique.set(time,{...row,time});
    }
    return [...unique.values()].sort((a,b)=>a.time-b.time);
  }
  const valid=value=>Number.isFinite(value)&&value>=0;
  function rainDelta(a,b) {
    if(!a || b.time-a.time>GAP || b.time<=a.time)return null;
    const sameDay=day(a.time)===day(b.time),sameMonth=day(a.time).slice(0,7)===day(b.time).slice(0,7);
    // A falling counter is unknown, never a negative amount or fabricated zero.
    for(const [key,usable] of [['rain_month',sameMonth],['rain_day',sameDay]]) {
      if(usable && valid(a[key]) && valid(b[key])) {
        if(b[key]<a[key])return null;
        return Math.round((b[key]-a[key])*1000)/1000;
      }
    }
    return null;
  }
  function build(input,hours=24,now=Date.now()) {
    const end=now,start=end-hours*HOUR,all=rows(input).filter(row=>row.time<=end);
    const selected=all.filter(row=>row.time>=start);
    const raw=selected.filter(row=>Number.isFinite(row.temperature));
    const bins=[];
    for(let cursor=hours===24?Math.floor(start/HOUR)*HOUR:midnight(day(start));cursor<end;) {
      const stop=hours===24?cursor+HOUR:midnight(nextDay(day(cursor)));
      bins.push({start:Math.max(start,cursor),end:Math.min(end,stop),calendarStart:cursor,
        calendarEnd:stop,amount:null,covered:0,partial:true});
      cursor=stop;
    }
    // Only observed, short, counter-backed intervals are used. Do not allocate
    // a nonzero interval across a bucket/window boundary without measurements.
    for(let index=1;index<all.length;index++) {
      const a=all[index-1],b=all[index],delta=rainDelta(a,b);
      if(delta===null || b.time<=start || a.time>=end)continue;
      for(const bin of bins) {
        const overlap=Math.min(b.time,bin.end)-Math.max(a.time,bin.start);
        if(overlap<=0)continue;
        if(delta!==0 && (a.time<bin.start || b.time>bin.end))continue;
        bin.amount=(bin.amount??0)+delta;
        bin.covered+=overlap;
      }
    }
    for(const bin of bins) {
      bin.partial=bin.start!==bin.calendarStart || bin.end!==bin.calendarEnd || bin.covered<bin.end-bin.start;
      if(bin.amount!==null)bin.amount=Math.round(bin.amount*1000)/1000;
    }
    const total=bins.some(bin=>bin.amount!==null)?bins.reduce((sum,bin)=>sum+(bin.amount??0),0):null;
    let points=selected;
    if(hours===168) {
      const groups=new Map();
      for(const row of selected) {
        const key=Math.floor(row.time/HOUR)*HOUR;
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(row);
      }
      points=[...groups].map(([time,group])=>{
        const mean=key=>{const values=group.map(row=>row[key]).filter(Number.isFinite);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
        return {time:Math.max(start,time),temperature:mean('temperature'),feels:mean('feels'),
          partial:group.filter(row=>Number.isFinite(row.temperature)).length<6,
          first:group[0].time,last:group[group.length-1].time};
      });
    }
    const gap=raw.length===0 || selected.some(row=>!Number.isFinite(row.temperature)) || raw[0].time>start+GAP || raw.at(-1).time<end-GAP ||
      raw.some((row,index)=>index>0 && row.time-raw[index-1].time>GAP);
    return {hours,start,end,raw,points,bins,total,average:total===null?null:total/(hours/24),
      min:raw.length?Math.min(...raw.map(row=>row.temperature)):null,
      max:raw.length?Math.max(...raw.map(row=>row.temperature)):null,gap,
      rainPartial:bins.some(bin=>bin.covered<bin.end-bin.start),
      availableStart:raw[0]?.time??null};
  }
  function render(model,current,root=document) {
    const get=id=>root.getElementById(id),text=(id,value)=>{get(id).textContent=value;};
    text('history-current',fmt(current?.temperature)+' °C');
    text('history-extremes','Min '+fmt(model.min)+' °C · Max '+fmt(model.max)+' °C');
    text('history-rain-total',fmt(model.total)+' mm');
    text('history-rain-label',model.rainPartial?'Teilmenge':'Gesamt');
    text('history-rain-extra',(model.hours===168?'Ø '+fmt(model.average)+' mm / 24 h · ':'')+'Aktuell '+fmt(current?.rain_rate)+' mm/h');
    text('history-note',[
      !model.raw.length?'Keine Temperaturdaten.':model.gap?'Historie unvollständig.':'',
      model.rainPartial?'Regenmenge unvollständig.':'',
      model.hours===168 && model.bins.some(bin=>bin.partial)?'* Teiltag / Messlücken.':''
    ].filter(Boolean).join(' '));
    get('history-feels-legend').hidden=!model.points.some(row=>Number.isFinite(row.feels));
    get('history-24').setAttribute('aria-pressed',String(model.hours===24));
    get('history-168').setAttribute('aria-pressed',String(model.hours===168));
    const width=Math.max(220,Math.round(get('history-temperature-chart').getBoundingClientRect().width)),height=model.hours===168?196:180;
    const values=model.points.flatMap(row=>[row.temperature,row.feels]).filter(Number.isFinite);
    const low=values.length?Math.floor(Math.min(...values)-1):0,high=values.length?Math.ceil(Math.max(...values)+1):10;
    const rainMax=Math.max(1,...model.bins.map(bin=>bin.amount??0))*1.1;
    const axisWidth=Math.max(...[low,high,rainMax].map(value=>fmt(value).length))*8.5+12;
    const left=Math.max(48,axisWidth),right=width-12,top=13,bottom=136;
    const x=time=>left+(time-model.start)/(model.end-model.start)*(right-left);
    const y=value=>bottom-(value-low)/(high-low)*(bottom-top);
    let ticks=[];
    if(model.hours===24)for(let time=Math.ceil(model.start/(6*HOUR))*6*HOUR;time<=model.end;time+=6*HOUR)ticks.push(time);
    else ticks=model.bins.map(bin=>(bin.start+bin.end)/2).filter((_,index)=>width>=440 || index%2===0);
    // Always label both exact window boundaries; leave space around them so
    // neighbouring ticks cannot collide on narrow phones.
    const tickGap=model.hours===24?52:86;
    let previousX=left;
    ticks=ticks.filter(time=>{
      const position=x(time);
      if(position-previousX<tickGap || right-position<tickGap)return false;
      previousX=position;return true;
    });
    const timeLabels=[model.start,...ticks,model.end].map((time,index)=>{
      const edge=index===0?'start':index===ticks.length+1?'end':null;
      const label=model.hours===24?clockFormat.format(new Date(time)):dateFormat.format(new Date(time));
      const clock=model.hours===168 && edge?`<tspan x="${x(time)}" dy="15">${clockFormat.format(new Date(time))}</tspan>`:'';
      return `<text class="history-x-label${edge?' history-time-'+edge:''}" x="${x(time)}" y="160" text-anchor="${edge||'middle'}">${label}${clock}</text>`;
    }).join('');
    const axes=(min,max)=>[0,.25,.5,.75,1].map(fraction=>{
      const yy=bottom-fraction*(bottom-top);
      return `<path class="history-grid" d="M${left} ${yy}H${right}"/><text class="history-y-label" x="${left-7}" y="${yy+5}" text-anchor="end">${fmt(min+fraction*(max-min))}</text>`;
    }).join('')+timeLabels;
    function line(key) {
      const segments=[];let segment=[];let previous=null;
      for(const row of model.points) {
        const missing=!Number.isFinite(row[key]);
        const gap=previous && (model.hours===24?row.time-previous.time>GAP:
          row.time-previous.time>HOUR || row.first-previous.last>GAP);
        if(missing || gap){if(segment.length)segments.push(segment);segment=[];}
        if(!missing)segment.push(row);
        previous=row;
      }
      if(segment.length)segments.push(segment);
      return segments.map((segment,index)=>{
        const path=segment.map((row,index)=>(index?'L':'M')+x(row.time)+' '+y(row[key])).join(' ');
        let area='';
        if(key==='temperature' && segment.length>1) {
          const first=segment[0],last=segment.at(-1),id='history-temperature-fill-'+index;
          const stops=[];
          const stop=(time,value)=>stops.push(`<stop offset="${(time-first.time)/(last.time-first.time)}" stop-color="${temperatureColor(value)}"/>`);
          segment.forEach((row,index)=>{
            const previous=segment[index-1];
            if(previous) {
              // Include crossed palette boundaries so large changes still pass
              // through green rather than blending directly from blue to red.
              const thresholds=[1,7,22,28].filter(value=>value>Math.min(previous.temperature,row.temperature)&&value<Math.max(previous.temperature,row.temperature));
              if(row.temperature<previous.temperature)thresholds.reverse();
              for(const value of thresholds)stop(previous.time+(row.time-previous.time)*(value-previous.temperature)/(row.temperature-previous.temperature),value);
            }
            stop(row.time,row.temperature);
          });
          area=`<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x(first.time)}" x2="${x(last.time)}" y1="0" y2="0">${stops.join('')}</linearGradient></defs><path class="history-area" fill="url(#${id})" d="${path}L${x(last.time)} ${bottom}L${x(first.time)} ${bottom}Z"/>`;
        }
        return area+
          `<path class="history-${key}" d="${path}"/>`+segment.map(row=>`<circle class="history-point-${key}" cx="${x(row.time)}" cy="${y(row[key])}" r="${segment.length===1?2.7:1.3}"><title>${detailFormat.format(new Date(row.time))}: ${fmt(row[key])} °C${row.partial?' · Teilmittel':''}</title></circle>`).join('');
      }).join('');
    }
    const svg=(content,label)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">${content}</svg>`;
    get('history-temperature-chart').innerHTML=svg(axes(low,high)+line('temperature')+line('feels'),'Temperaturverlauf in Grad Celsius');
    get('history-rain-chart').innerHTML=svg(axes(0,rainMax)+model.bins.map(bin=>{
      const xx=x(bin.start),w=Math.max(1,x(bin.end)-xx-2),h=bin.amount===null?0:bin.amount/rainMax*(bottom-top);
      return (bin.amount===null?`<text x="${xx+w/2}" y="${bottom-5}" text-anchor="middle">?</text>`:
        `<rect class="history-bar" opacity="${bin.partial ? .65 : 1}" x="${xx+1}" y="${bottom-Math.max(1,h)}" width="${w}" height="${Math.max(1,h)}"><title>${detailFormat.format(new Date(bin.start))}: ${fmt(bin.amount)} mm${bin.partial?' · unvollständig':''}</title></rect>`)+
        (model.hours===168 && bin.partial?`<text x="${xx+w/2}" y="${bottom+11}" text-anchor="middle">*</text>`:'');
    }).join(''),'Niederschlagsmengen in Millimeter; Fragezeichen bedeuten fehlende Daten');
    let selected=model.end;
    function inspect(time) {
      selected=Math.max(model.start,Math.min(model.end,time));
      const nearest=model.points.reduce((best,row)=>!best||Math.abs(row.time-selected)<Math.abs(best.time-selected)?row:best,null);
      const close=nearest && Math.abs(nearest.time-selected)<=(model.hours===24?GAP:HOUR/2);
      const bin=model.bins.find(bin=>selected>=bin.start && selected<=bin.end);
      text('history-inspection',detailFormat.format(new Date(selected))+' · Temperatur '+fmt(close?nearest.temperature:null)+' °C · gefühlt '+fmt(close?nearest.feels:null)+' °C'+
        (close&&nearest.partial?' (Teilmittel)':'')+' · Regen '+fmt(bin?.amount)+' mm'+(bin?.partial?' (unvollständig)':''));
    }
    for(const id of ['history-temperature-chart','history-rain-chart']) {
      const chart=get(id);
      chart.onpointermove=chart.onpointerdown=event=>{
        const rect=chart.getBoundingClientRect();
        inspect(model.start+Math.max(0,Math.min(1,((event.clientX-rect.left)*width/rect.width-left)/(right-left)))*(model.end-model.start));
      };
      chart.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        event.preventDefault();inspect(event.key==='Home'?model.start:event.key==='End'?model.end:selected+(event.key==='ArrowLeft'?-1:1)*(model.hours===24?600000:HOUR));
      }};
    }
    text('history-inspection','');
  }
  return {build,rows,rainDelta,midnight,day,render,temperatureColor};
})();
if(typeof module!=='undefined')module.exports=WeatherHistory;

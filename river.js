/* PEGELONLINE measurements, drawn with the same layout and controls as temperature. */
'use strict';
const RiverHistory=(()=>{
  const HOUR=3600000,GAP=30*60000;
  const clock=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});
  const date=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit'});
  const detail=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'});
  const number=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});
  function build(measurements,reading,hours=24,now=Date.now()){
    const start=now-hours*HOUR,unique=new Map();
    for(const row of [...measurements,...(reading?[reading]:[])]){
      const time=Date.parse(row?.timestamp);
      if(Number.isFinite(time)&&Number.isFinite(row?.value)&&time>=start&&time<=now)unique.set(time,{time,value:row.value});
    }
    const points=[...unique.values()].sort((a,b)=>a.time-b.time);
    const values=points.map(row=>row.value);
    return {start,end:now,hours,points,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,
      gap:!points.length||points[0].time-start>GAP||now-points.at(-1).time>GAP||points.some((row,i)=>i&&row.time-points[i-1].time>GAP)};
  }
  function render(model,root=document){
    const get=id=>root.getElementById(id),chart=get('river-chart');
    const width=Math.max(220,Math.round(chart.getBoundingClientRect().width));
    const scale=typeof getComputedStyle==='function'&&root.documentElement?Math.max(1,parseFloat(getComputedStyle(root.documentElement).fontSize)/16):1;
    const low=model.min===null?0:Math.floor(model.min-2),high=model.max===null?10:Math.ceil(model.max+2);
    const left=Math.max(48,number.format(high).length*8.5+12)*scale,right=width-12,top=13*scale,bottom=top+123,tickY=bottom+24*scale,height=tickY+(model.hours>24?38:20)*scale;
    const x=time=>left+(time-model.start)/(model.end-model.start)*(right-left),y=value=>bottom-(value-low)/(high-low)*(bottom-top);
    let content=[0,.25,.5,.75,1].map(f=>{
      const yy=bottom-f*(bottom-top);
      return `<path class="history-grid" d="M${left} ${yy}H${right}"/><text class="history-y-label" x="${left-8}" y="${yy+4}" text-anchor="end">${number.format(low+f*(high-low))}</text>`;
    }).join('');
    const interval=(model.hours===24?6:model.hours===720?120:24)*HOUR,ticks=[model.start];
    for(let t=Math.ceil(model.start/interval)*interval;t<model.end;t+=interval)if(x(t)-x(ticks.at(-1))>65*scale&&right-x(t)>65*scale)ticks.push(t);
    ticks.push(model.end);
    content+=ticks.map((t,i)=>`<text x="${x(t)}" y="${tickY}" text-anchor="${i===0?'start':i===ticks.length-1?'end':'middle'}">${model.hours===24?clock.format(t):date.format(t)}${model.hours>24?`<tspan x="${x(t)}" dy="${16*scale}">${clock.format(t)}</tspan>`:''}</text>`).join('');
    const segments=[];let segment=[];
    for(const row of model.points){
      if(segment.length&&row.time-segment.at(-1).time>GAP){segments.push(segment);segment=[];}
      segment.push(row);
    }
    if(segment.length)segments.push(segment);
    for(const group of segments){
      const path=group.map((row,i)=>(i?'L':'M')+x(row.time)+' '+y(row.value)).join(' ');
      if(group.length>1)content+=`<path class="river-history-area" d="${path}L${x(group.at(-1).time)} ${bottom}L${x(group[0].time)} ${bottom}Z"/>`;
      content+=`<path class="river-history-line" d="${path}"/>`+group.map(row=>`<circle class="river-history-point" cx="${x(row.time)}" cy="${y(row.value)}" r="${group.length===1?2.7:1.3}"><title>${detail.format(row.time)}: ${number.format(row.value)} cm</title></circle>`).join('');
    }
    if(!model.points.length)content+=`<text x="${(left+right)/2}" y="${(top+bottom)/2}" text-anchor="middle">Keine Verlaufsmessungen</text>`;
    content+='<g id="river-cursor" visibility="hidden"><path class="history-cursor" d="M0 '+top+'V'+bottom+'"/><circle id="river-selected-point" class="river-history-selected" r="4"/></g>';
    chart.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pegelverlauf Wesel in Zentimetern über Pegelnull">${content}</svg>`;
    get('river-extremes').textContent=model.min===null?'Min — · Max —':'Min '+number.format(model.min)+' cm · Max '+number.format(model.max)+' cm';
    get('river-history-note').textContent=model.gap?'Historie unvollständig. Messlücken werden nicht verbunden.':'';
    for(const hours of [24,168,720])get('river-'+hours).setAttribute('aria-pressed',String(model.hours===hours));
    let selected=model.points.at(-1)?.time??model.end,touch=null;
    function inspect(time){
      selected=Math.max(model.start,Math.min(model.end,time));
      const nearest=model.points.reduce((best,row)=>!best||Math.abs(row.time-selected)<Math.abs(best.time-selected)?row:best,null);
      const known=nearest&&Math.abs(nearest.time-selected)<=GAP/2;
      if(known)selected=nearest.time;
      get('river-cursor').setAttribute('transform','translate('+x(selected)+' 0)');
      get('river-cursor').setAttribute('visibility','visible');
      get('river-selected-point').setAttribute('visibility',known?'visible':'hidden');
      if(known)get('river-selected-point').setAttribute('cy',String(y(nearest.value)));
      get('river-inspection').textContent=detail.format(selected)+' · '+(known?number.format(nearest.value)+' cm über Pegelnull':'Keine Messung');
    }
    const timeAt=event=>{const rect=chart.getBoundingClientRect();return model.start+((event.clientX-rect.left)*width/rect.width-left)/(right-left)*(model.end-model.start);};
    chart.onpointerdown=event=>{if(event.isPrimary===false||(event.button!==undefined&&event.button!==0))return;touch={id:event.pointerId,x:event.clientX,y:event.clientY,cancelled:false};inspect(timeAt(event));};
    chart.onpointermove=event=>{
      if(event.pointerType==='touch'){
        if(!touch||touch.id!==event.pointerId||touch.cancelled)return;
        const dx=Math.abs(event.clientX-touch.x),dy=Math.abs(event.clientY-touch.y);
        if(dy>8&&dy>dx){touch.cancelled=true;return;}if(dx<8)return;
      }
      inspect(timeAt(event));
    };
    chart.onpointerup=chart.onpointercancel=()=>{touch=null;};
    chart.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();const forward=event.key==='ArrowRight';
      const next=forward?model.points.find(row=>row.time>selected):[...model.points].reverse().find(row=>row.time<selected);
      inspect(event.key==='Home'?model.start:event.key==='End'?model.end:next?.time??selected+(forward?1:-1)*900000);
    }};
    inspect(selected);
  }
  return {build,render};
})();
if(typeof module!=='undefined')module.exports=RiverHistory;

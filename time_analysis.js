/* UTC is used as a neutral calendar: CSV timestamps remain China local wall-clock times. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  function csv(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i=0; i<text.length; i++) {
      const c=text[i];
      if(c==='"') { if(quoted && text[i+1]==='"') {cell+='"';i++;} else if(quoted || !cell) quoted=!quoted; else throw Error('CSV 引号格式错误'); }
      else if(c===',' && !quoted) {row.push(cell);cell='';}
      else if((c==='\n'||c==='\r') && !quoted) {if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(quoted)throw Error('CSV 引号未闭合');
    row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
    return rows;
  }
  function parse(text) {
    const rows=csv(text), header=(rows.shift()||[]).map(s=>s.trim());
    const indexes=['出发站','到达站','时间'].map(s=>header.indexOf(s));
    if(indexes.some(i=>i<0))throw Error('缺少表头：出发站、到达站、时间');
    const trips=[], errors=[], seen=new Set(); let duplicates=0;
    rows.forEach((r,i)=>{
      const [from,to,time]=indexes.map(j=>(r[j]||'').trim());
      const m=/^(\d{4})[.\/-](\d{2})[.\/-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
      let d;
      if(m) {d=new Date(0);d.setUTCFullYear(+m[1],+m[2]-1,+m[3]);d.setUTCHours(+m[4],+m[5],+(m[6]||0),0);}
      if(!m||!from||!to||!d||d.getUTCFullYear()!==+m[1]||d.getUTCMonth()!==+m[2]-1||d.getUTCDate()!==+m[3]||d.getUTCHours()!==+m[4]||d.getUTCMinutes()!==+m[5]||d.getUTCSeconds()!==+(m[6]||0)) {errors.push(`数据行 ${i+1}：站名缺失或时间不合法 (${time})`);return;}
      const key=JSON.stringify([from,to,d.getTime()]);if(seen.has(key))duplicates++;seen.add(key);
      trips.push({from,to,time,date:d,day:dayKey(d),hour:d.getUTCHours(),weekday:(d.getUTCDay()+6)%7,key});
    });
    trips.sort((a,b)=>a.date-b.date);
    return {trips,errors,duplicates,total:rows.length};
  }
  function weekKey(d) {
    const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
    x.setUTCDate(x.getUTCDate()+3-(x.getUTCDay()+6)%7);
    const y=x.getUTCFullYear(), start=new Date(Date.UTC(y,0,4));
    start.setUTCDate(start.getUTCDate()+3-(start.getUTCDay()+6)%7);
    return `${y}-W${pad(1+Math.round((x-start)/(7*DAY)))}`;
  }
  function bucket(d,grain) {
    const key=dayKey(d);
    return grain==='year'?key.slice(0,4):grain==='quarter'?`${key.slice(0,4)}-Q${Math.floor(d.getUTCMonth()/3)+1}`:grain==='month'?key.slice(0,7):grain==='week'?weekKey(d):key;
  }
  function aggregate(trips,options={}) {
    const unique=new Set();
    const filtered=trips.filter(t=>{
      if(options.dedup){if(unique.has(t.key))return false;unique.add(t.key);}
      return (!options.start||t.day>=options.start)&&(!options.end||t.day<=options.end)&&(!options.station||t.from.includes(options.station)||t.to.includes(options.station))&&(!options.kind||options.kind==='all'||(options.kind==='weekday'?t.weekday<5:t.weekday>=5));
    });
    const counts={}, hours=Array(24).fill(0), weekdays=Array(7).fill(0), heat=Array.from({length:7},()=>Array(24).fill(0)), origins={}, destinations={}, routes={};
    const inc=(o,k)=>o[k]=(o[k]||0)+1;
    filtered.forEach(t=>{inc(counts,t.day);hours[t.hour]++;weekdays[t.weekday]++;heat[t.weekday][t.hour]++;inc(origins,t.from);inc(destinations,t.to);inc(routes,`${t.from} → ${t.to}`);});
    const start=options.start||(filtered[0]?.day),end=options.end||(filtered.at(-1)?.day), days=[];
    if(start&&end)for(let d=new Date(`${start}T00:00:00Z`);dayKey(d)<=end;d=new Date(+d+DAY))days.push({day:dayKey(d),count:counts[dayKey(d)]||0,date:d});
    let streak=0,best=0,gap=0,maxGap=0,cumulative=0;
    days.forEach((d,i)=>{streak=d.count?streak+1:0;best=Math.max(best,streak);gap=d.count?0:gap+1;maxGap=Math.max(maxGap,gap);cumulative+=d.count;d.cumulative=cumulative;d.average=days.slice(Math.max(0,i-6),i+1).reduce((s,x)=>s+x.count,0)/Math.min(7,i+1);});
    const periods={};days.forEach(d=>incBy(periods,bucket(d.date,options.grain||'month'),d.count));
    function incBy(o,k,n){o[k]=(o[k]||0)+n;}
    const peakStart=options.peakStart??7,peakEnd=options.peakEnd??9,eveningStart=options.eveningStart??17,eveningEnd=options.eveningEnd??19;
    const within=(h,a,b)=>a<b?h>=a&&h<b:a>b?(h>=a||h<b):false;
    const morning=filtered.filter(t=>within(t.hour,peakStart,peakEnd)).length,evening=filtered.filter(t=>within(t.hour,eveningStart,eveningEnd)).length;
    const peak=filtered.filter(t=>within(t.hour,peakStart,peakEnd)||within(t.hour,eveningStart,eveningEnd)).length;
    const active=Object.keys(counts).length, weekdayTrips=weekdays.slice(0,5).reduce((a,b)=>a+b,0);
    const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    const times=filtered.map(t=>t.hour*60+t.date.getUTCMinutes()).sort((a,b)=>a-b),median=times.length?(times[Math.floor((times.length-1)/2)]+times[Math.ceil((times.length-1)/2)])/2:null;
    return {filtered,counts,hours,weekdays,heat,origins,destinations,routes,days,periods,start,end,active,best,maxGap,morning,evening,peak,weekdayTrips,busiest:sorted[0],median};
  }
  const api={csv,parse,aggregate,bucket,weekKey,dayKey};root.TripTime=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

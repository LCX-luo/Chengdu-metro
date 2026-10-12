(function(root){
  'use strict';
  function compute(trips){
    const stations=new Set(),firstSeen=new Map(),pairs=new Map(),routes=new Map(),months=new Map(),daily=new Map(),gaps=[];
    const sorted=[...trips].sort((a,b)=>a.date-b.date);
    for(let i=0;i<sorted.length;i++){
      const t=sorted[i],month=t.day.slice(0,7);
      if(!months.has(month))months.set(month,{trips:0,days:new Set(),stations:new Set(),newStations:0,weekend:0,tram:0});
      const m=months.get(month);m.trips++;m.days.add(t.day);m.weekend+=Number(t.weekday>=5);m.tram+=Number(t.from==='有轨电车');
      for(const s of [t.from,t.to]){m.stations.add(s);if(!stations.has(s)){stations.add(s);firstSeen.set(s,t.day);m.newStations++;}}
      const route=JSON.stringify([t.from,t.to]);routes.set(route,(routes.get(route)||0)+1);
      const [a,b]=[t.from,t.to].sort(),key=JSON.stringify([a,b]);
      if(!pairs.has(key))pairs.set(key,{a,b,ab:0,ba:0});const pair=pairs.get(key);if(t.from===a)pair.ab++;else pair.ba++;
      daily.set(t.day,(daily.get(t.day)||0)+1);
      if(i)gaps.push((t.date-sorted[i-1].date)/3600000);
    }
    const rank=[...routes].map(([key,count])=>({stations:JSON.parse(key),count})).sort((a,b)=>b.count-a.count);
    let sum=0,coverage80=0;for(const r of rank){sum+=r.count;coverage80++;if(sum>=trips.length*.8)break;}if(!trips.length)coverage80=0;
    const quantile=(values,q)=>{if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),pos=(s.length-1)*q,lo=Math.floor(pos);return s[lo]+(s[Math.ceil(pos)]-s[lo])*(pos-lo)};
    const counts=[...daily.values()],q1=quantile(counts,.25),q3=quantile(counts,.75),threshold=q3===null?0:q3+1.5*(q3-q1);
    return {stations,firstSeen,pairs:[...pairs.values()].sort((a,b)=>(b.ab+b.ba)-(a.ab+a.ba)),rank,months:[...months],gaps,medianGap:quantile(gaps,.5),coverage80,threshold,bursts:[...daily].filter(([,n])=>n>threshold).sort((a,b)=>b[1]-a[1]),tram:sorted.filter(t=>t.from==='有轨电车').length};
  }
  root.TripInsights={compute};if(typeof module!=='undefined')module.exports={compute};
  if(typeof document==='undefined')return;
  const grid=document.querySelector('.grid');
  const section=(title,id,wide=false,note='')=>{const el=document.createElement('section');el.className='card explore-card'+(wide?' wide':'');const heading=document.createElement('h2');heading.textContent=title;el.append(heading);if(note){const p=document.createElement('p');p.className='note';p.textContent=note;el.append(p)}const content=document.createElement('div');content.id=id;el.append(content);grid.append(el);return content};
  section('你的乘车画像','insightText',true);
  section('站点探索进度','discoveryChart',false,'在当前筛选记录中首次出现的站点，出发和到达均计入；并不代表真实首次到访。').className='chart';
  section('常用路线集中度','paretoChart',false,'Top 15 有向路线次数与累计占比；累计占比的分母为全部筛选行程。').className='chart';
  section('相邻交易时间间隔','gapChart',false,'按交易时间排序后，相邻两笔的时间差；不是乘车时长，也不等于换乘时间。').className='chart';
  section('全年各月份对比','seasonChart',false,'各年的 1–12 月记录数对比。筛选范围外和无记录月份显示 0；首末月份可能不完整。').className='chart';
  section('月度乘车画像','monthInsights',true,'新站点以当前筛选范围内首次出现计算；活跃日均只除以当月有记录天数。').className='scroll';
  section('双向路线对比','pairInsights',true,'按字典序确定 A / B；分别统计 A→B 与 B→A。双向都有记录不代表同日往返。').className='scroll';
  section('站点常见交易小时','stationHours',true,'Top 12 站点的端点频次；同站进出计两次，有轨电车也遵循此口径。').className='chart';
  section('高频日期提示','burstInsights',true,'只对活跃日次数计算四分位数，超过 Q3 + 1.5 × IQR 的日期列出供回顾；这是描述性提示，不代表错误或异常行为。').className='scroll';
  root.renderInsights=function(report){
    const trips=report.filtered,x=compute(trips),n=trips.length,pct=v=>n?(100*v/n).toFixed(1)+'%':'0%';
    const lines=[`在当前范围内，你留下了 ${n} 笔行程，涉及 ${x.stations.size} 个站点名称与 ${x.rank.length} 条有向路线。`,
      `最常用的 3 条路线占 ${pct(x.rank.slice(0,3).reduce((s,r)=>s+r.count,0))}；${x.coverage80} 条路线覆盖约 80% 的行程。`,
      `有轨电车 ${x.tram} 笔（${pct(x.tram)}），地图端点频次对应 ${x.tram*2} 次。`,
      x.medianGap===null?'记录不足两笔，暂不能统计交易间隔。':`相邻交易时间差的中位数为 ${x.medianGap.toFixed(1)} 小时。筛选后不相邻的原始记录可能被拼接，间隔仅针对当前筛选。`];
    const text=document.getElementById('insightText');text.replaceChildren();lines.forEach(line=>{const p=document.createElement('p');p.textContent=line;text.append(p)});
    const discovery=new Map();for(const day of x.firstSeen.values())discovery.set(day,(discovery.get(day)||0)+1);let acc=0;
    const discoveryRows=report.days.map(d=>[d.day,discovery.get(d.day)||0,acc+=discovery.get(d.day)||0]);
    chart('discoveryChart',{legend:{data:['新增站点','累计站点']},xAxis:{type:'category',data:discoveryRows.map(r=>r[0])},yAxis:{type:'value',minInterval:1},dataZoom:[{type:'inside'},{type:'slider',height:15,bottom:0}],series:[{name:'新增站点',type:'bar',data:discoveryRows.map(r=>r[1])},{name:'累计站点',type:'line',showSymbol:false,data:discoveryRows.map(r=>r[2])}]});
    let cumulative=0;const top=x.rank.slice(0,15);chart('paretoChart',{legend:{data:['路线次数','累计占比']},xAxis:{type:'category',data:top.map(r=>r.stations.join(' → ')),axisLabel:{rotate:40,formatter:v=>v.length>12?v.slice(0,12)+'…':v}},yAxis:[{type:'value',minInterval:1},{type:'value',min:0,max:100,axisLabel:{formatter:'{value}%'}}],grid:{left:45,right:50,bottom:95,top:40},series:[{name:'路线次数',type:'bar',data:top.map(r=>r.count)},{name:'累计占比',type:'line',yAxisIndex:1,data:top.map(r=>+(100*(cumulative+=r.count)/(n||1)).toFixed(1))}]});
    const bounds=[1,3,6,12,24,48,168,Infinity],gapCounts=Array(8).fill(0);x.gaps.forEach(h=>gapCounts[bounds.findIndex(b=>h<b)]++);bars('gapChart',['<1h','1–3h','3–6h','6–12h','12–24h','1–2天','2–7天','≥7天'],gapCounts);
    const years=[...new Set(x.months.map(([m])=>m.slice(0,4)))];chart('seasonChart',{legend:{data:years},xAxis:{type:'category',data:Array.from({length:12},(_,i)=>`${i+1}月`)},yAxis:{type:'value',minInterval:1},series:years.map(year=>({name:year,type:'bar',data:Array.from({length:12},(_,i)=>x.months.find(([key])=>key===`${year}-${String(i+1).padStart(2,'0')}`)?.[1].trips||0)}))});
    const monthRows=x.months.map(([m,v])=>[m,v.trips,v.days.size,(v.trips/v.days.size).toFixed(2),v.stations.size,v.newStations,v.weekend,v.tram]);table('monthInsights',['月份','行程','活跃天数','活跃日均','涉及站点','新站点','周末行程','电车行程'],monthRows);
    const pairRows=x.pairs.map(p=>[p.a,p.b,p.ab,p.a===p.b?'同站记录':p.ba,p.ab+p.ba,p.a!==p.b&&p.ab&&p.ba?'双向':'单向 / 同站']);table('pairInsights',['A 站','B 站','A→B','B→A','合计','方向'],pairRows);
    const endpointCounts=new Map();trips.forEach(t=>[t.from,t.to].forEach(s=>endpointCounts.set(s,(endpointCounts.get(s)||0)+1)));const stationTop=[...endpointCounts].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([s])=>s),matrix=stationTop.map(()=>Array(24).fill(0));trips.forEach(t=>[t.from,t.to].forEach(s=>{const i=stationTop.indexOf(s);if(i>=0)matrix[i][t.hour]++}));
    chart('stationHours',{grid:{left:105,right:25,top:10,bottom:60},tooltip:{formatter:p=>`${stationTop[p.value[1]]} ${p.value[0]}时：${p.value[2]} 次端点`},xAxis:{type:'category',data:Array.from({length:24},(_,i)=>i)},yAxis:{type:'category',data:stationTop},visualMap:{min:0,max:Math.max(1,...matrix.flat()),inRange:{color:['#edf5ee','#83bfa7','#087f70']},orient:'horizontal',bottom:0,left:'center'},series:[{type:'heatmap',data:matrix.flatMap((row,i)=>row.map((v,h)=>[h,i,v]))}]});
    table('burstInsights',['日期','行程次数','阈值'],x.bursts.length?x.bursts.map(([d,c])=>[d,c,x.threshold.toFixed(2)]):[['当前范围没有超过阈值的日期','—',x.threshold.toFixed(2)]]);
    const monthlyFields=['行程','活跃天数','活跃日均','涉及站点','新站点','周末行程','电车行程'];
    const gapLabels=['<1小时','1–3小时','3–6小时','6–12小时','12–24小时','24–48小时','48–168小时','≥168小时'];
    exportRows.push(...[['涉及站点',x.stations.size],['有向路线',x.rank.length],['覆盖80%的路线数',x.coverage80],['有轨电车行程',x.tram],['交易间隔中位数(小时)',x.medianGap??'—']].map(([k,v])=>['探索概览',k,v]),...discoveryRows.map(([d,newCount,total])=>['站点探索',d,newCount,'','',total]),...monthRows.flatMap(row=>monthlyFields.map((field,i)=>['月度画像·'+field,row[0],row[i+1]])),...x.pairs.flatMap(p=>[['双向路线·A→B',`${p.a} → ${p.b}`,p.ab],['双向路线·B→A',`${p.b} → ${p.a}`,p.ba]]),...gapCounts.map((c,i)=>['交易间隔',gapLabels[i],c]));
  };
})(typeof globalThis!=='undefined'?globalThis:this);

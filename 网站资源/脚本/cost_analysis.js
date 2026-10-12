(function(root){
  'use strict';
  function compute(trips,options={}){
    const known=trips.filter(t=>Number.isSafeInteger(t.amountCents)&&t.amountCents>=0);
    const daily=new Map(),periods=new Map(),routes=new Map(),origins=new Map(),destinations=new Map(),fares=new Map(),weekdays=Array.from({length:7},()=>({cents:0,count:0}));
    const add=(map,key,t)=>{if(!map.has(key))map.set(key,{cents:0,count:0,max:0});const row=map.get(key);row.cents+=t.amountCents;row.count++;row.max=Math.max(row.max,t.amountCents);};
    const inside=(h,a,b)=>a<b?h>=a&&h<b:a>b?h>=a||h<b:false;
    let total=0,peak=0,peakCount=0,weekend=0,weekendCount=0,tram=0,tramCount=0;
    for(const t of known){total+=t.amountCents;add(daily,t.day,t);add(periods,root.TripTime.bucket(t.date,options.grain||'month'),t);add(routes,JSON.stringify([t.from,t.to]),t);add(origins,t.from,t);add(destinations,t.to,t);fares.set(t.amountCents,(fares.get(t.amountCents)||0)+1);weekdays[t.weekday].cents+=t.amountCents;weekdays[t.weekday].count++;
      if(inside(t.hour,options.peakStart??7,options.peakEnd??9)||inside(t.hour,options.eveningStart??17,options.eveningEnd??19)){peak+=t.amountCents;peakCount++;}
      if(t.weekday>=5){weekend+=t.amountCents;weekendCount++;}if(t.from==='有轨电车'){tram+=t.amountCents;tramCount++;}
    }
    const sorted=known.map(t=>t.amountCents).sort((a,b)=>a-b),median=sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2:null;
    const rank=map=>[...map].sort((a,b)=>b[1].cents-a[1].cents||b[1].count-a[1].count);
    return {known,total,missing:trips.length-known.length,daily,periods,routes:rank(routes),origins:rank(origins),destinations:rank(destinations),fares:[...fares].sort((a,b)=>a[0]-b[0]),weekdays,median,min:sorted[0]??null,max:sorted.at(-1)??null,peak,peakCount,weekend,weekendCount,tram,tramCount,busiest:rank(daily)[0]};
  }
  root.TripCosts={compute};if(typeof module!=='undefined')module.exports={compute};
  if(typeof document==='undefined')return;
  const grid=document.querySelector('.grid'),nodes=[];
  function section(title,id,wide=false,note=''){const el=document.createElement('section');el.className='card cost-card'+(wide?' wide':'');const h=document.createElement('h2');h.textContent=title;el.append(h);if(note){const p=document.createElement('p');p.className='note';p.textContent=note;el.append(p)}const body=document.createElement('div');body.id=id;el.append(body);grid.append(el);if(id!=='costStatus')nodes.push(el);return body;}
  section('花费分析 · 数据说明','costStatus',true);
  section('花费概览','costMetrics',true).className='metrics';
  section('分期花费与单次均价','costTrend',true,'依据已确认的时间粒度；部分时期可能不完整，缺失金额不按 0 元计算。').className='chart';
  section('单次费用分布','fareChart',false,'只统计有合法金额的行程，包括真实 0 元记录。').className='chart';
  section('星期花费','weekdayCost',false,'按交易日期的星期分组，不调整节假日与调休。').className='chart';
  section('每日与累计已知花费','dailyCost',true,'没有行程的日期补 0；有行程但金额全部缺失的日期断开显示。部分金额缺失的日期只显示已知部分。').className='chart';
  section('高峰花费占比','peakCost',false,'按已确认的早晚高峰并集划分，重叠部分只计一次。').className='chart';
  section('周末与周一至周五花费','weekendCost',false).className='chart';
  section('出发站花费 Top 15','originCost',false,'每笔费用归到出发站；这是起点分组，不代表该站的收费。').className='chart';
  section('到达站花费 Top 15','destinationCost',false,'每笔费用归到到达站；与出发站视图分别统计，两者不可相加。').className='chart';
  section('路线花费排行','routeCosts',true).className='scroll';
  section('分期费用明细','periodCosts',true,'环比对比前一个显示期的已知总花费；当覆盖范围或金额完整度不一致时，不宜直接解读为消费变化。').className='scroll';
  // Keep the common export controls after whichever analysis view is active.
  grid.querySelectorAll('.shared-card').forEach(el=>grid.append(el));
  const money=c=>c===null?'—':(c/100).toFixed(2),pct=(n,d)=>d?(100*n/d).toFixed(1)+'%':'0%';
  root.renderCosts=function(report,options,source){
    const x=compute(report.filtered,options),allKnown=source.some(t=>t.amountCents!==null),status=document.getElementById('costStatus');
    status.replaceChildren();const message=document.createElement('p');status.append(message);
    if(!x.known.length){nodes.forEach(el=>el.style.display='none');message.textContent=!source.length?'请先导入 PDF 或 CSV。':!allKnown?'此文件没有可用金额数据。旧版 CSV 不含金额列，仍可使用地图与行程分析；请导入 PDF 行程单，或在 CSV 中添加“金额”列（单位：元）。':!report.filtered.length?'当前筛选没有行程，请调整条件并确认。':'当前筛选行程没有有效金额，不估算费用。';return;}
    nodes.forEach(el=>el.style.display='');message.textContent=`当前筛选 ${report.filtered.length} 笔，其中 ${x.known.length} 笔有金额，${x.missing} 笔缺失或不合法；金额覆盖率 ${pct(x.known.length,report.filtered.length)}。以下费用仅汇总已知金额。去重设置和所有已确认筛选同步生效。`;
    const metrics=[['已知总花费',`¥${money(x.total)}`],['单次平均',`¥${money(x.total/x.known.length)}`],['单次中位数',`¥${money(x.median)}`],['最小 / 最大单次',`¥${money(x.min)} / ¥${money(x.max)}`],['有金额行程',x.known.length],['活跃日均花费',`¥${money(x.total/x.daily.size)}`],['有轨电车花费',`¥${money(x.tram)} · ${x.tramCount} 笔`],['花费最高日期',`${x.busiest?.[0]||'—'} · ¥${money(x.busiest?.[1].cents??0)}`]];
    const metricsEl=document.getElementById('costMetrics');metricsEl.replaceChildren();metrics.forEach(([label,value])=>{const el=document.createElement('div');el.className='metric';const name=document.createElement('span'),number=document.createElement('strong');name.textContent=label;number.textContent=value;el.append(name,number);metricsEl.append(el)});
    const periodRows=Object.keys(report.periods).map((key,i,keys)=>{const value=x.periods.get(key),previous=x.periods.get(keys[i-1]);return [key,value?.count||0,value?money(value.cents):'—',value?money(value.cents/value.count):'—',previous?.cents&&value?pct(value.cents-previous.cents,previous.cents):'—'];});
    chart('costTrend',{legend:{data:['已知花费(元)','单次均价(元)']},xAxis:{type:'category',data:periodRows.map(r=>r[0])},yAxis:[{type:'value',name:'花费(元)'},{type:'value',name:'单次(元)'}],dataZoom:[{type:'inside'},{type:'slider',height:15,bottom:0}],series:[{name:'已知花费(元)',type:'bar',data:periodRows.map(r=>r[2]==='—'?null:+r[2])},{name:'单次均价(元)',type:'line',yAxisIndex:1,data:periodRows.map(r=>r[3]==='—'?null:+r[3])}]});
    bars('fareChart',x.fares.map(([c])=>`¥${money(c)}`),x.fares.map(([,count])=>count));bars('weekdayCost',weekdays,x.weekdays.map(v=>v.cents/100));
    let cumulative=0;chart('dailyCost',{legend:{data:['每日已知花费(元)','累计已知花费(元)']},xAxis:{type:'category',data:report.days.map(d=>d.day)},yAxis:[{type:'value'},{type:'value'}],dataZoom:[{type:'inside'},{type:'slider',height:15,bottom:0}],series:[{name:'每日已知花费(元)',type:'bar',data:report.days.map(d=>x.daily.has(d.day)?x.daily.get(d.day).cents/100:d.count?null:0)},{name:'累计已知花费(元)',type:'line',yAxisIndex:1,showSymbol:false,data:report.days.map(d=>(cumulative+=x.daily.get(d.day)?.cents||0)/100)}]});
    const pie=(id,values)=>chart(id,{tooltip:{trigger:'item',valueFormatter:v=>`¥${v.toFixed(2)}`},legend:{bottom:0},series:[{type:'pie',radius:['40%','68%'],data:values.map(([name,cents])=>({name,value:cents/100}))}]});pie('peakCost',[['高峰',x.peak],['非高峰',x.total-x.peak]]);pie('weekendCost',[['周末',x.weekend],['周一至周五',x.total-x.weekend]]);
    for(const [id,entries] of [['originCost',x.origins],['destinationCost',x.destinations]]){const top=entries.slice(0,15).reverse();chart(id,{grid:{left:110,right:30,top:10,bottom:35},xAxis:{type:'value',name:'元'},yAxis:{type:'category',data:top.map(([s])=>s)},series:[{type:'bar',data:top.map(([,v])=>v.cents/100)}]});}
    table('routeCosts',['路线','有金额笔数','已知花费(元)','单次平均(元)','最大单次(元)','花费占比'],x.routes.map(([key,v])=>[JSON.parse(key).join(' → '),v.count,money(v.cents),money(v.cents/v.count),money(v.max),pct(v.cents,x.total)]));table('periodCosts',['时期','有金额笔数','已知花费(元)','单次平均(元)','环比'],periodRows);
    exportRows.push(...[['已知总花费(元)',money(x.total)],['有金额笔数',x.known.length],['缺失金额笔数',x.missing],['金额覆盖率',pct(x.known.length,report.filtered.length)],['单次平均(元)',money(x.total/x.known.length)],['单次中位数(元)',money(x.median)],['有轨电车花费(元)',money(x.tram)],['高峰花费(元)',money(x.peak)],['周末花费(元)',money(x.weekend)]].map(([k,v])=>['花费概览',k,v]),...periodRows.map(([key,count,total,mean,growth])=>['分期花费',key,total,growth,mean,count]),...x.routes.map(([key,v])=>['路线花费',JSON.parse(key).join(' → '),money(v.cents),'',money(v.cents/v.count),v.count]),...x.weekdays.map((v,i)=>['星期花费',weekdays[i],money(v.cents),'',v.count?money(v.cents/v.count):'—',v.count]),...x.fares.map(([c,count])=>['单次费用分布',money(c),count]));
  };
})(typeof globalThis!=='undefined'?globalThis:this);

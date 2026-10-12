import './time_analysis.js';

const normalise = globalThis.TripTime.normalise;
const timestampPattern = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g;
const fullRow = /^(\d+)\s+(\S+)\s+(\S+)\s+(\d+\.\d{1,2})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})$/;
const partialRow = /^(\d+)\s+(\S+)\s+(\S+)\s+(\d+\.\d{1,2})$/;

export class TripPDFError extends Error {
  constructor(message, details = {}) { super(message); this.name = 'TripPDFError'; this.details = details; }
}

// Bold text in these bills is painted twice, shifted by 0.5 pt.
// Remove overlapping copies before rebuilding rows from their coordinates.
export function reconstructLines(items) {
  const groups = [];
  const fragments = items.filter(item => item.str?.trim()).map(item => ({
    text: normalise(item.str), x: item.transform[4], y: item.transform[5], width: item.width || 0,
  })).sort((a,b) => b.y-a.y || a.x-b.x);
  for (const fragment of fragments) {
    let row = groups.at(-1);
    if (!row || Math.abs(row.y-fragment.y)>2) { row={y:fragment.y,items:[]};groups.push(row); }
    if (!row.items.some(old => old.text===fragment.text && Math.abs(old.x-fragment.x)<=1 && Math.abs(old.y-fragment.y)<=1)) row.items.push(fragment);
  }
  return groups.map(row => {
    const pieces=row.items.sort((a,b)=>a.x-b.x);let text='',end=null;
    for(const p of pieces){if(end!==null && p.x-end>2 && !/\s$/.test(text) && !/^\s/.test(p.text))text+=' ';text+=p.text;end=Math.max(end??0,p.x+p.width);}
    return text.trim();
  }).filter(Boolean);
}

export function parsePages(pages, name='行程单') {
  const rows=[],sections=[],diagnostics={file:name,pages:pages.length,pageDetails:[],sections:[],unparsedRows:[]};
  let current=null,pending=null,timestamps=0;
  function fail(message,extra={}){throw new TripPDFError(message,{...diagnostics,...extra});}
  function append(match,page,line){
    if(!current)fail('未找到行程单数量与金额信息。',{page,line});
    const [ ,seq,from,to,fare,time]=match;
    const row=[from,to,time.replace(/\s+/g,' ')];
    const check=globalThis.TripTime.parse(toCSV([['出发站','到达站','时间'],row]));
    if(check.errors.length)fail('行程时间或站名不合法。',{page,line,errors:check.errors});
    if(+seq!==current.rows.length+1)fail('行程序号不连续，可能有漏行。',{page,line,expected:current.rows.length+1,actual:+seq});
    const trip=check.trips[0];
    const record={seq:+seq,from:trip.from,to:trip.to,time:time.replace(/-/g,'.').replace(/\s+/g,' '),cents:Math.round(Number(fare)*100),page};
    current.rows.push(record);rows.push(record);
  }
  for(const {page,lines} of pages){
    const pageAudit={page,lines:lines.length,records:0,timestamps:0};diagnostics.pageDetails.push(pageAudit);
    for(const raw of lines){
      const line=normalise(raw).trim(),compact=line.replace(/\s/g,'');
      const stampCount=(line.match(timestampPattern)||[]).length;timestamps+=stampCount;pageAudit.timestamps+=stampCount;
      const summary=/共(\d+)笔行程[:：]?合计([\d.]+)元/.exec(compact);
      if(summary){
        if(pending)fail('分页续接行程缺少交易时间。',{pending,page});
        current={page,expectedCount:+summary[1],expectedCents:Math.round(Number(summary[2])*100),rows:[]};sections.push(current);continue;
      }
      let match=fullRow.exec(line);
      if(match){if(pending)fail('上一条行程缺少交易时间。',{pending,page,line});append(match,page,line);pageAudit.records++;continue;}
      const timeOnly=/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})$/.exec(line);
      if(pending && timeOnly){append([...pending.match,timeOnly[1]],pending.page,pending.line+' '+line);pageAudit.records++;pending=null;continue;}
      const part=partialRow.exec(line);
      if(part){if(pending)fail('有多条行程缺少交易时间。',{pending,page,line});pending={match:part,page,line};continue;}
      if(stampCount || /^\d+\s+\S+\s+\S+\s+\d+\./.test(line))diagnostics.unparsedRows.push({page,line});
    }
  }
  if(pending)fail('最后一条行程缺少交易时间。',{pending});
  if(!rows.length)fail(pages.every(p=>!p.lines.length)?'PDF 没有可提取文字，暂不支持扫描件。':'未识别到成都地铁行程，格式可能不受支持。');
  diagnostics.sections=sections.map(s=>({page:s.page,expectedCount:s.expectedCount,actualCount:s.rows.length,expectedAmount:s.expectedCents/100,actualAmount:s.rows.reduce((sum,r)=>sum+r.cents,0)/100}));
  if(diagnostics.unparsedRows.length || timestamps!==rows.length)fail('部分行程未识别完整，请查看控制台。',{timestamps,parsedCount:rows.length});
  const mismatch=diagnostics.sections.filter(s=>s.expectedCount!==s.actualCount||Math.round(s.expectedAmount*100)!==Math.round(s.actualAmount*100));
  if(mismatch.length)fail('行程数量或金额核对不一致，请查看控制台。',{mismatch});
  return {rows,diagnostics};
}

export function toCSV(rows){return '\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');}

let engine;
async function getEngine(){
  if(!engine)engine=import('../../第三方组件/PDF解析组件/pdf.min.js').then(lib=>{
    lib.GlobalWorkerOptions.workerSrc=new URL('../../第三方组件/PDF解析组件/pdf.worker.min.js',import.meta.url).href;
    return lib;
  }).catch(error=>{engine=null;throw new TripPDFError('PDF 解析组件加载失败，请刷新页面重试。',{cause:String(error),stack:error.stack});});
  return engine;
}

export async function readTripPDF(file,progress=()=>{}){
  let loading,document;
  try{
    const lib=await getEngine();
    loading=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,stopAtErrors:true});
    document=await loading.promise;
    const pages=[];
    for(let page=1;page<=document.numPages;page++){
      progress({file:file.name,page,total:document.numPages});
      const content=await(await document.getPage(page)).getTextContent();
      pages.push({page,lines:reconstructLines(content.items)});
    }
    return parsePages(pages,file.name);
  }catch(error){
    if(error instanceof TripPDFError)throw error;
    const message=error.name==='PasswordException'?'PDF 有密码，请先解锁。':error.name==='InvalidPDFException'?'PDF 文件损坏或不是有效 PDF。':'PDF 读取失败，请检查文件或浏览器支持。';
    throw new TripPDFError(message,{file:file.name,cause:String(error),stack:error.stack});
  }finally{if(document)await document.destroy();else if(loading)await loading.destroy();}
}

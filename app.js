'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>new Intl.NumberFormat('es-PE').format(value);
const percent=(n,d)=>d?Math.round(n/d*100):0;
const duration=value=>value===null||value===undefined?'—':`${String(Math.floor(Math.round(value)/60)).padStart(2,'0')}:${String(Math.round(value)%60).padStart(2,'0')}`;
const prettyMonth=value=>new Date(value+'-01T12:00:00').toLocaleDateString('es-PE',{month:'long',year:'numeric'});
let data=null,summary=null,page=0,visibleAdvisors=[];
const snapshotMode=Boolean(document.body.dataset.source);
const currentLimaDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const pageSize=12;
function options(id,values,first){
  const select=$(id),old=select.value;
  select.innerHTML=(first?`<option value="">${first}</option>`:'')+values.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');
  if([...select.options].some(o=>o.value===old))select.value=old;
}
async function load(){
  $('refresh').disabled=true;
  $('message').className='message';$('message').textContent=snapshotMode?'Recargando la última copia publicada…':'Leyendo datos actuales de smarts.db…';
  try{
    const response=await fetch(document.body.dataset.source||'./api/data',{cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Error al cargar datos');
    data={...result,today:snapshotMode?currentLimaDate():result.today};
    const months=[...new Set(data.rows.flatMap(r=>[r.call?.slice(0,7),r.evaluation?.slice(0,7)]).filter(Boolean))].sort().reverse();
    options('month',months.map(m=>[m,prettyMonth(m)]));
    if(!$('cutoff').value)$('cutoff').value=data.today;
    $('cutoff').max=data.today;
    options('coverageAuditor',[...new Map(data.rows.map(r=>[r.auditor,r.auditorName]))].sort((a,b)=>a[1].localeCompare(b[1])),'Todos los auditores');
    options('serviceAuditor',[...new Map(data.rows.map(r=>[r.auditor,r.auditorName]))].sort((a,b)=>a[1].localeCompare(b[1])),'Todos los auditores');
    render();
    const issues=Object.entries(data.issues).filter(([,v])=>v).map(([k,v])=>`${v} ${ {invalidDates:'registros con fechas inválidas',invalidTmo:'TMO inválidos',missingAdvisor:'registros sin identificador de origen'}[k]}`);
    $('message').textContent=`${snapshotMode?'Copia publicada':'Fuente conectada'} · ${number(data.rows.length)} registros · ${new Set(data.rows.map(r=>r.auditor)).size} auditores únicos${issues.length?' · Atención: '+issues.join('; '):''}`;
    $('sourceInfo').textContent=snapshotMode?`Copia generada: ${new Date(data.updated).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Lima) · Base actualizada: ${new Date(data.sourceModified).toLocaleString('es-PE',{timeZone:'America/Lima'})}`:`Base actualizada: ${new Date(data.sourceModified).toLocaleString('es-PE')} · Leída: ${new Date(data.updated).toLocaleTimeString('es-PE')}`;
    if(snapshotMode)$('message').textContent+=` · Actualización publicada: ${new Date(data.updated).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Lima). No es información en tiempo real.`;
  }catch(error){$('message').className='message error';$('message').textContent=`No fue posible actualizar. ${error.message}. Los datos anteriores, si existen, no están actualizados.`;}
  finally{$('refresh').disabled=false;}
}
function render(){
  if(!data)return;
  const filters=Object.fromEntries(['month','basis','cutoff'].map(k=>[k,$(k).value]));
  if(!filters.cutoff){$('cutoff').value=data.today;filters.cutoff=data.today;}
  if(filters.cutoff>data.today){$('cutoff').value=data.today;filters.cutoff=data.today;}
  summary=Analytics.summarize(data.rows,filters);page=0;
  const comparison=Analytics.compareAuditors(data.rows,filters);
  const s=summary,coverage=percent(s.covered,s.advisors.length*4);
  $('periodCaption').textContent=`${prettyMonth(filters.month)} · Corte: ${filters.cutoff.split('-').reverse().join('/')} · ${filters.basis==='call'?'Por llamada':'Por evaluación'}`;
  const cards=[['Monitoreos realizados',number(s.total),'Registros disponibles al corte','◫'],['Cobertura mensual',`${coverage}<small>%</small>`,`${s.covered} de ${s.advisors.length*4} semanas-asesor cubiertas`,'▦'],['Cobertura semanal completa',`${s.complete}<small> / ${s.advisors.length}</small>`,'Asesores con las 4 semanas cubiertas','✓'],['Asesores con pendientes',number(s.missing),'Incluye semana actual en curso','◷']];
  $('kpis').innerHTML=cards.map(([label,value,desc,icon])=>`<article class="kpi"><span class="kpi-icon">${icon}</span><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-desc">${esc(desc)}</div></article>`).join('');
  $('auditorCards').innerHTML=comparison.map(({id,name,summary:part})=>{const a={id,name,total:part.total,days:part.auditors.find(a=>a.id===id)?.days||new Set()};return `<article class="auditor-card"><div class="auditor-top"><span class="initial">${esc(a.name.split(' ').slice(0,2).map(w=>w[0]).join(''))}</span><div><div class="auditor-name">${esc(a.name)}</div><div class="auditor-role">AUDITOR DE CALIDAD</div></div></div><div class="auditor-number">${a.total}<small>monitoreos</small></div><div class="meter"><span style="width:${percent(a.total,s.total)}%"></span></div><div class="auditor-meta"><span>${percent(a.total,s.total)}% de participación</span><span>${a.days.size} días con evaluaciones</span></div></article>`;}).join('')||'<p>Sin auditores disponibles al corte.</p>';
  const shortName=a=>a.name.split(' ').slice(0,2).join(' ');
  const auditorHeaders=comparison.map((a,i)=>`<th class="auditor-col auditor-${i}">${esc(shortName(a))}</th>`).join('');
  $('weekly').innerHTML=['call','evaluation'].map(b=>`<div class="weekly-block"><h3>Por fecha de ${b==='call'?'llamada':'evaluación'}</h3><div class="table-scroll"><table class="compact-table"><thead><tr><th>AUDITOR</th><th>S1</th><th>S2</th><th>S3</th><th>S4</th><th>TOTAL</th></tr></thead><tbody>${comparison.map((a,i)=>`<tr><td class="auditor-${i}">${esc(shortName(a))}</td>${a.summary.weeks[b].map(n=>`<td>${n}</td>`).join('')}<td><strong>${a.summary.weeks[b].reduce((n,v)=>n+v,0)}</strong></td></tr>`).join('')}</tbody></table></div></div>`).join('');
  $('tmo').innerHTML=`<div class="table-scroll"><table class="compact-table"><thead><tr><th>GESTIÓN</th>${auditorHeaders}<th>EQUIPO</th></tr></thead><tbody>${['Venta','No venta','Marcador'].map(type=>`<tr><td>${type}</td>${comparison.map(a=>`<td>${duration(a.summary.tmo[type])}<span class="secondary">n = ${a.summary.tmoCounts[type]||0}</span></td>`).join('')}<td><strong>${duration(s.tmo[type])}</strong><span class="secondary">n = ${s.tmoCounts[type]||0}</span></td></tr>`).join('')}</tbody></table></div>`;
  const days=new Date(Number(filters.month.slice(0,4)),Number(filters.month.slice(5,7)),0).getDate();
  $('daily').innerHTML=`<table class="compact-table"><thead><tr><th>DÍA</th>${auditorHeaders}<th>TOTAL EQUIPO</th></tr></thead><tbody>${Array.from({length:days},(_,i)=>{const d=filters.month+'-'+String(i+1).padStart(2,'0');return `<tr class="${d>filters.cutoff?'future-day':''}"><td>${String(i+1).padStart(2,'0')}/${filters.month.slice(5,7)}</td>${comparison.map(a=>`<td>${a.summary.daily[d]||0}</td>`).join('')}<td><strong>${s.daily[d]||0}</strong></td></tr>`;}).join('')}<tr class="total-row"><td>TOTAL</td>${comparison.map(a=>`<td><strong>${a.summary.total}</strong></td>`).join('')}<td><strong>${s.total}</strong></td></tr></tbody></table>`;
  $('dailyCaption').textContent=`Comparativo por fecha de ${filters.basis==='call'?'llamada':'evaluación'} · Valores diarios por auditor`;
  $('dailyTotal').innerHTML=`${s.total} <small>monitoreos en el periodo</small>`;
  updateCoverageCampaigns();
  renderAdvisors();
  renderServices();
}
function updateCoverageCampaigns(){
  const auditor=$('coverageAuditor').value;
  const values=Analytics.advisorCampaigns(data.rows,{month:$('month').value,cutoff:$('cutoff').value},auditor);
  options('coverageCampaign',values.map(v=>[v,v]),'Todas las campañas');
  $('coverageCampaign').disabled=!auditor;
  if(!auditor)$('coverageCampaign').value='';
}
function renderServices(){
  if(!data)return;
  const groups=Analytics.serviceResults(data.rows,{month:$('month').value,cutoff:$('cutoff').value,basis:$('basis').value},$('serviceAuditor').value);
  const cells=g=>`<td>${g.sale.count}</td><td>${duration(g.sale.tmo)}</td><td>${g.noSale.count}</td><td>${duration(g.noSale.tmo)}</td><td title="${g.other} de otras gestiones"><strong>${g.total}</strong></td>`;
  $('campaignHead').innerHTML='<tr><th>SERVICIO / CAMPAÑA</th><th>VENTAS</th><th>TMO VENTA</th><th>NO VENTAS</th><th>TMO NO VENTA</th><th>TOTAL EVAS.</th></tr>';
  $('campaignRows').innerHTML=groups.map(g=>`<tr class="service-summary"><td><strong>${esc(g.service)}</strong></td>${cells(g)}</tr>${g.campaigns.map(c=>`<tr class="campaign-detail"><td>${esc(c.campaign)}</td>${cells(c)}</tr>`).join('')}`).join('');
  const total=groups.reduce((n,g)=>n+g.total,0),other=groups.reduce((n,g)=>n+g.other,0);
  $('serviceTotals').textContent=`${total} evaluaciones · ${other} de otras gestiones (incluidas en el total, no en venta/no venta)`;
}
function advisorStatus(a){return a.status;}
function renderAdvisors(){
  if(!summary)return;
  const s=Analytics.advisorCoverage(data.rows,{month:$('month').value,cutoff:$('cutoff').value},$('coverageAuditor').value,$('coverageCampaign').value);
  $('coverageSummary').innerHTML=`<span><b>${s.complete}</b> meta mensual cumplida</span><span><b>${s.missing}</b> con pendientes al corte</span><span><b>${s.advisors.length-s.complete-s.missing}</b> al día, mes en curso</span><span><b>${s.completedWeeks}</b> evaluaciones requeridas hasta el cierre previo</span>`;
  const q=$('search').value.trim().toLocaleLowerCase(),status=$('status').value;
  visibleAdvisors=s.advisors.filter(a=>(!q||a.name.toLocaleLowerCase().includes(q))&&(!status||advisorStatus(a)===status));
  const pages=Math.max(1,Math.ceil(visibleAdvisors.length/pageSize));page=Math.min(page,pages-1);
  $('advisorRows').innerHTML=visibleAdvisors.slice(page*pageSize,(page+1)*pageSize).map(a=>{
    const state=advisorStatus(a),labels={complete:'Meta cumplida',pending:`Faltan ${a.pendingEvaluations} eval.`,ontrack:'Al día'};
    return `<tr><td><strong>${esc(a.name)}</strong></td>${a.counts.map((n,i)=>`<td><span class="week-cell ${n?'done':i<s.due?'pending':'future'}" title="${n?n+' evaluaciones':i<s.due?(i===s.due-1&&$('cutoff').value.slice(0,7)===$('month').value?'Pendiente · semana en curso':'Semana sin cobertura'):'Semana no iniciada'}">${n?'✓ '+n:i<s.due?'0':'—'}</span></td>`).join('')}<td>${a.total}</td><td><div class="coverage-meter"><div class="meter"><span style="width:${a.covered/4*100}%"></span></div>${a.covered}/4</div></td><td><span class="badge ${state}">${labels[state]}</span></td></tr>`;
  }).join('')||'<tr><td colspan="8" class="empty">No hay asesores para esta selección.</td></tr>';
  $('advisorCount').textContent=`${visibleAdvisors.length} asesores`;
  $('pageCaption').textContent=`Página ${page+1} de ${pages} · ${visibleAdvisors.length} asesores`;
  $('prev').disabled=page===0;$('next').disabled=page>=pages-1;
}
function exportCsv(){
  if(!summary)return;
  const clean=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const rows=[['Asesor','Semana 1','Semana 2','Semana 3','Semana 4','Evaluaciones','Semanas cubiertas','Evaluaciones pendientes al cierre previo','Base','Mes','Corte','Auditor','Campaña','Estado'],...visibleAdvisors.map(a=>[a.name,...a.counts,a.total,a.covered,a.pendingEvaluations,'Fecha de llamada',$('month').value,$('cutoff').value,$('coverageAuditor').selectedOptions[0].text,$('coverageCampaign').selectedOptions[0].text,{complete:'Meta mensual cumplida',ontrack:'Al día, mes en curso',pending:'Con pendientes al corte'}[a.status]])];
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(clean).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`control-asesores-${$('month').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
['month','basis','cutoff'].forEach(id=>$(id).addEventListener('change',render));
['search','status','coverageCampaign'].forEach(id=>$(id).addEventListener('input',()=>{page=0;renderAdvisors();}));
$('prev').addEventListener('click',()=>{page--;renderAdvisors();});$('next').addEventListener('click',()=>{page++;renderAdvisors();});
$('coverageAuditor').addEventListener('change',()=>{page=0;updateCoverageCampaigns();renderAdvisors();});
$('serviceAuditor').addEventListener('change',renderServices);
$('refresh').addEventListener('click',load);$('export').addEventListener('click',exportCsv);

document.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active');}));
load();

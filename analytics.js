(function(root){
  'use strict';
  const week = date => Math.min(4,Math.ceil(Number(date.slice(8,10))/7));
  const management = value => {
    const key=String(value||'').toLowerCase().replace(/[\s_-]/g,'');
    return key==='noventa'?'No venta':key==='venta'?'Venta':String(value||'Sin clasificar');
  };
  function summarize(rows, f){
    const dimension=r=>(!f.service||r.service===f.service)&&(!f.campaign||r.campaign===f.campaign);
    const eligible=r=>r.evaluation&&r.evaluation<=f.cutoff;
    const inMonth=(r,b)=>r[b]&&r[b].startsWith(f.month)&&r[b]<=f.cutoff;
    const roster=rows.filter(r=>dimension(r)&&eligible(r)&&inMonth(r,f.basis));
    const filtered=roster.filter(r=>!f.auditor||r.auditor===f.auditor);
    const advisors=new Map(),auditors=new Map();
    roster.forEach(r=>{if(!advisors.has(r.advisor))advisors.set(r.advisor,{id:r.advisor,name:r.advisorName,counts:[0,0,0,0],total:0});});
    rows.filter(eligible).forEach(r=>{if(!auditors.has(r.auditor))auditors.set(r.auditor,{id:r.auditor,name:r.auditorName,total:0,days:new Set()});});
    const weeks={call:[0,0,0,0],evaluation:[0,0,0,0]},daily={},groups=new Map(),times={};
    filtered.forEach(r=>{
      const a=advisors.get(r.advisor);a.counts[week(r[f.basis])-1]++;a.total++;
      const au=auditors.get(r.auditor);au.total++;au.days.add(r.evaluation);
      ['call','evaluation'].forEach(b=>{if(inMonth(r,b))weeks[b][week(r[b])-1]++;});
      const d=r[f.basis];daily[d]=(daily[d]||0)+1;
      const key=JSON.stringify([r.service,r.campaign]);
      if(!groups.has(key))groups.set(key,{service:r.service,campaign:r.campaign,total:0,times:[]});
      const g=groups.get(key);g.total++;
      const type=management(r.type);
      if(Number.isFinite(r.tmo)&&r.tmo>=0){(times[type]||=([])).push(r.tmo);g.times.push(r.tmo);}
    });
    const mean=arr=>arr?.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
    const due=f.cutoff.slice(0,7)<f.month?0:f.cutoff.slice(0,7)>f.month?4:week(f.cutoff);
    const list=[...advisors.values()].map(a=>({...a,covered:a.counts.filter(Boolean).length,complete:a.counts.every(Boolean),missing:a.counts.reduce((n,c,i)=>n+(i<due&&!c?1:0),0)})).sort((a,b)=>b.missing-a.missing||a.name.localeCompare(b.name));
    return {total:filtered.length,rows:filtered,advisors:list,auditors:[...auditors.values()].sort((a,b)=>b.total-a.total),weeks,daily,groups:[...groups.values()].map(g=>({...g,tmo:mean(g.times)})).sort((a,b)=>b.total-a.total),tmo:Object.fromEntries(['Venta','No venta','Marcador'].map(t=>[t,mean(times[t])])),tmoCounts:Object.fromEntries(Object.entries(times).map(([t,v])=>[t,v.length])),due,complete:list.filter(a=>a.complete).length,missing:list.filter(a=>a.missing>0).length,covered:list.reduce((n,a)=>n+a.covered,0)};
  }
  function compareAuditors(rows, filters){
    const names=new Map(rows.map(r=>[r.auditor,r.auditorName]));
    return [...names].sort(([a],[b])=>a.localeCompare(b)).map(([id,name])=>({id,name,summary:summarize(rows,{...filters,auditor:id})}));
  }
  function advisorCoverage(rows, filters, auditor='', campaign=''){
    const cohort=rows.filter(r=>(!auditor||r.auditor===auditor)&&(!campaign||r.campaign===campaign));
    const result=summarize(cohort,{month:filters.month,cutoff:filters.cutoff,basis:'call'});
    const completedWeeks=filters.cutoff.slice(0,7)>filters.month?4:filters.cutoff.slice(0,7)<filters.month?0:week(filters.cutoff)-1;
    const advisors=result.advisors.map(a=>{
      const completedEvaluations=a.counts.slice(0,completedWeeks).reduce((n,c)=>n+c,0);
      const complete=a.total>=4;
      const status=complete?'complete':completedEvaluations>=completedWeeks?'ontrack':'pending';
      return {...a,complete,status,completedEvaluations,pendingEvaluations:Math.max(0,completedWeeks-completedEvaluations)};
    }).sort((a,b)=>b.pendingEvaluations-a.pendingEvaluations||a.name.localeCompare(b.name));
    return {...result,advisors,completedWeeks,complete:advisors.filter(a=>a.complete).length,missing:advisors.filter(a=>a.status==='pending').length};
  }
  function advisorCampaigns(rows, filters, auditor=''){
    return [...new Set(advisorCoverage(rows,filters,auditor).rows.map(r=>r.campaign))].sort((a,b)=>a.localeCompare(b));
  }
  const serviceOrder=['Falabella','Oncosalud Tlmk','Oncosalud Elite','Oncosalud Digitales','Cencosud','Banbif'];
  function serviceName(value){
    const aliases={'falabella':'Falabella','oncosalud telemarketing':'Oncosalud Tlmk','oncosalud tlmk':'Oncosalud Tlmk','smart_onco_elite_salud':'Oncosalud Elite','oncosalud elite':'Oncosalud Elite','oncosalud banca':'Oncosalud Digitales','oncosalud digitales':'Oncosalud Digitales','cencosud ventas':'Cencosud','cencosud':'Cencosud','banbif':'Banbif'};
    return aliases[String(value).trim().toLowerCase()]||value;
  }
  function serviceResults(rows, filters, auditor=''){
    const selected=summarize(rows,{...filters,auditor}).rows;
    const empty=(service,campaign)=>({service,campaign,total:0,other:0,sale:{count:0,sum:0,valid:0},noSale:{count:0,sum:0,valid:0},campaigns:new Map()});
    const groups=new Map(serviceOrder.map(name=>[name,empty(name)]));
    const add=(g,r)=>{
      g.total++;
      const type=management(r.type),bucket=type==='Venta'?g.sale:type==='No venta'?g.noSale:null;
      if(!bucket){g.other++;return;}
      bucket.count++;
      if(Number.isFinite(r.tmo)&&r.tmo>=0){bucket.sum+=r.tmo;bucket.valid++;}
    };
    selected.forEach(r=>{
      const name=serviceName(r.service);
      if(!groups.has(name))groups.set(name,empty(name));
      const g=groups.get(name);add(g,r);
      if(!g.campaigns.has(r.campaign))g.campaigns.set(r.campaign,empty(name,r.campaign));
      add(g.campaigns.get(r.campaign),r);
    });
    const finish=g=>({...g,sale:{count:g.sale.count,tmo:g.sale.valid?g.sale.sum/g.sale.valid:null},noSale:{count:g.noSale.count,tmo:g.noSale.valid?g.noSale.sum/g.noSale.valid:null},campaigns:[...g.campaigns.values()].sort((a,b)=>a.campaign.localeCompare(b.campaign)).map(finish)});
    return [...groups.values()].map(finish);
  }
  const api={week,management,summarize,compareAuditors,advisorCoverage,advisorCampaigns,serviceResults};
  if(typeof module!=='undefined')module.exports=api;else root.Analytics=api;
})(globalThis);

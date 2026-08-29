
/* ==========================================================================
   1. MOTORE — logica pura, identica a engine.js
   ========================================================================== */
const SEMI=['D','S','C','B'];
const NOME_SEME={D:'Denari',S:'Spade',C:'Coppe',B:'Bastoni'};
const NOME_GIU={8:'La Staffetta',9:'Il Guastafeste',10:'Il Capocomico'};
const NOME_RUOLO={cavaliere:'Cavaliere',scudiero:'Scudiero',equipaggiamento:'Equipaggiamento',giullare:'Giullare'};
const PF_SCU=4, PF_CAV=6, BERSAGLIO=8;
const carta=(s,v)=>({s,v,id:s+v});
const isGiullare=c=>c.v>=8;
const nomeCarta=c=>(c.v>=8?NOME_GIU[c.v]:c.v)+' di '+NOME_SEME[c.s];

function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;
  let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;};}
function mischia(a,r){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));
  [a[i],a[j]]=[a[j],a[i]];}return a;}
function mazzoCompleto(){const m=[];for(const s of SEMI)for(let v=2;v<=10;v++)m.push(carta(s,v));return m;}
function nuovoCampo(){return{cav:null,scu:null,equ:null,giullari:[]};}
function nuovoViandante(n){return{nome:n,carovana:[],mano:[],campo:nuovoCampo(),scarti:[],pf:0,passato:false};}

function nuovaPartita({seed=Date.now()&0xffff,primo=0,nomi=['Tu','Bot']}={}){
  const r=rng(seed), assi=mischia(SEMI.map(s=>carta(s,1)),r);
  return{rnd:r,mappa:assi.slice(0,3),assoScartato:assi[3],giostra:0,
    assoCorrente:null,assoNemico:null,v:[nuovoViandante(nomi[0]),nuovoViandante(nomi[1])],
    primoDraft:primo,turno:primo,fase:'draft',attesa:null,log:[]};
}
function creaDraft(g){
  const m=mischia(mazzoCompleto(),g.rnd);g.gruppi=[];
  for(let i=0;i<6;i++){
    const c=m.slice(i*6,i*6+6), nCop=i<5?2:0;
    const sc=mischia(c.map((_,k)=>k),g.rnd).slice(0,nCop);
    g.gruppi.push(c.map((x,k)=>({c:x,coperta:sc.includes(k),presa:null})));
  }
  g.gruppoIdx=0;g.turno=g.primoDraft;return g;
}
function prendiInDraft(g,p,i){
  if(g.fase!=='draft')throw new Error('il draft è già concluso');
  const gr=g.gruppi[g.gruppoIdx];
  if(!gr)throw new Error('gruppo di draft non valido');
  const sl=gr[i];
  if(!sl||sl.presa!==null)throw new Error('carta non disponibile');
  sl.presa=p;g.v[p].carovana.push(sl.c);   // se era coperta resta coperta
  if(gr.every(s=>s.presa!==null)){
    g.gruppoIdx++;
    if(g.gruppoIdx>=6){for(const v of g.v)v.carovana=mischia(v.carovana,g.rnd);g.fase='pronti';}
    else g.turno=g.gruppoIdx%2===0?g.primoDraft:1-g.primoDraft;
  } else g.turno=1-g.turno;
  return g;
}
function iniziaGiostra(g){
  g.giostra++;const i=g.giostra-1;
  g.iC=i; g.iN=(i+1)%3;
  g.assoCorrente=g.mappa[g.iC];g.assoNemico=g.mappa[g.iN];
  for(const v of g.v){v.campo=nuovoCampo();v.passato=false;}
  g.attesa=null;
  for(const v of g.v)for(let k=0;k<5&&v.carovana.length;k++)v.mano.push(v.carovana.shift());
  g.turno=g.giostra%2===1?g.primoDraft:1-g.primoDraft;
  g.fase='conta';return g;
}
function conta(g,p,ids=[]){
  const v=g.v[p];
  for(const id of ids){const k=v.mano.findIndex(c=>c.id===id);
    if(k<0)throw new Error('carta non in mano');v.scarti.push(v.mano.splice(k,1)[0]);}
  if(v.mano.length>6)throw new Error('devi scendere a 6 carte');
  v.contaFatta=true;
  if(g.v.every(x=>x.contaFatta)){g.v.forEach(x=>x.contaFatta=false);g.fase='giostra';}
  return g;
}
function ruoliPossibili(campo,c){
  if(isGiullare(c))return['giullare'];
  const r=[];
  if(!campo.cav)r.push('cavaliere');
  if(!campo.scu)r.push('scudiero');
  if(!campo.equ&&campo.scu&&campo.cav)r.push('equipaggiamento');
  return r;
}
function mosseLegali(g,p){
  const v=g.v[p];if(v.passato)return[];
  const m=[];
  for(const c of v.mano)for(const r of ruoliPossibili(v.campo,c))m.push({tipo:'gioca',id:c.id,ruolo:r});
  m.push({tipo:'passa'});return m;
}
function bloccato(g,p){const v=g.v[p];
  return v.passato||v.mano.every(c=>ruoliPossibili(v.campo,c).length===0);}
function passaTurno(g,p){
  const a=1-p;
  if(bloccato(g,a)&&bloccato(g,p)){g.fase='applausi';return;}
  g.turno=bloccato(g,a)?p:a;
}
function gioca(g,p,id,ruolo,scelta){
  const v=g.v[p],av=g.v[1-p];
  if(g.fase!=='giostra')throw new Error('fase errata');
  if(g.turno!==p)throw new Error('non è il tuo turno');
  if(v.passato)throw new Error('hai già passato');
  const k=v.mano.findIndex(c=>c.id===id);if(k<0)throw new Error('carta non in mano');
  const c=v.mano[k];
  if(!ruoliPossibili(v.campo,c).includes(ruolo))throw new Error('ruolo non valido');
  v.mano.splice(k,1);
  const ev={carta:c,ruolo,pescata:null,eliminato:null};
  if(ruolo==='cavaliere')v.campo.cav=c;
  else if(ruolo==='scudiero')v.campo.scu=c;
  else if(ruolo==='equipaggiamento')v.campo.equ=c;
  else{
    v.campo.giullari.push(c);
    if(c.v===9&&av.campo.scu){ev.eliminato=av.campo.scu;av.scarti.push(av.campo.scu);av.campo.scu=null;}
    if(c.v===8){
      // LA STAFFETTA: pescare dalla Carovana oppure scartare una carta dalla mano
      if(scelta){ applicaStaffetta(g,p,scelta,ev); }
      else if(v.mano.length){ g.attesa={p,ev}; return ev; }   // c'è una scelta da fare
      else if(v.carovana.length){ applicaStaffetta(g,p,{tipo:'pesca'},ev); }
    }
  }
  passaTurno(g,p);return ev;
}
/** Risolve la scelta della Staffetta: 'pesca', 'scarta' (con id) o 'niente'. */
function applicaStaffetta(g,p,scelta,ev){
  const v=g.v[p];
  if(scelta.tipo==='scarta'){
    const k=v.mano.findIndex(c=>c.id===scelta.id);
    if(k>=0){ev.scartata=v.mano.splice(k,1)[0];v.scarti.push(ev.scartata);}
  } else if(scelta.tipo==='pesca'&&v.carovana.length){
    ev.pescata=v.carovana.shift();v.mano.push(ev.pescata);
  }
  return ev;
}
function risolviStaffetta(g,scelta){
  if(!g.attesa)return null;
  const {p,ev}=g.attesa; g.attesa=null;
  applicaStaffetta(g,p,scelta,ev);
  passaTurno(g,p);
  return ev;
}

function passa(g,p){
  if(g.turno!==p)throw new Error('non è il tuo turno');
  g.v[p].passato=true;passaTurno(g,p);return g;
}
function valoreScudiero(k){if(!k.scu)return null;
  const b=k.cav&&k.cav.s===k.scu.s?2:0;return{tot:k.scu.v+b,base:k.scu.v,bonus:b};}
function valoreCavaliere(k,ac){if(!k.cav)return null;
  const ba=k.cav.s===ac.s?1:0,eq=k.equ?k.equ.v:0,tot=k.cav.v+ba+eq;
  return{tot,base:k.cav.v,bonusAsso:ba,equip:eq,dist:Math.abs(BERSAGLIO-tot)};}
function carteDelSeme(k,s){let n=0;
  for(const c of[k.cav,k.scu,k.equ])if(c&&c.s===s)n++;
  for(const c of k.giullari)if(c.s===s)n++;return n;}
function istrione(k,an){
  const G=k.giullari.length,d=k.giullari.filter(c=>c.v===10).length;
  const capo=G>0?d*(G-1):0, nem=k.giullari.filter(c=>c.s===an.s).length;
  return{tot:capo+nem,capocomico:capo,nemici:nem,dieci:d,giullari:G};
}
function applausi(g){
  const[A,B]=g.v,ac=g.assoCorrente,an=g.assoNemico;
  const R={pf:[0,0],mano:[0,0]};
  const sA=valoreScudiero(A.campo),sB=valoreScudiero(B.campo);
  let vS=null;
  if(sA&&sB)vS=sA.tot>sB.tot?0:sB.tot>sA.tot?1:null;else if(sA)vS=0;else if(sB)vS=1;
  if(vS!==null)R.pf[vS]+=PF_SCU;
  R.scudieri={a:sA,b:sB,vincitore:vS};
  const cA=valoreCavaliere(A.campo,ac),cB=valoreCavaliere(B.campo,ac);
  let vC=null,sp=null;
  if(cA&&cB){
    if(cA.dist<cB.dist)vC=0;else if(cB.dist<cA.dist)vC=1;
    else{const nA=carteDelSeme(A.campo,ac.s),nB=carteDelSeme(B.campo,ac.s);
      sp={a:nA,b:nB};vC=nA>nB?0:nB>nA?1:null;}
  }else if(cA)vC=0;else if(cB)vC=1;
  if(vC!==null)R.pf[vC]+=PF_CAV;
  R.cavalieri={a:cA,b:cB,vincitore:vC,spareggio:sp};
  const iA=istrione(A.campo,an),iB=istrione(B.campo,an);
  R.istrione={a:iA,b:iB};R.pf[0]+=iA.tot;R.pf[1]+=iB.tot;
  if(g.giostra===3){R.mano=[A.mano.length,B.mano.length];
    R.pf[0]-=R.mano[0];R.pf[1]-=R.mano[1];}
  A.pf+=R.pf[0];B.pf+=R.pf[1];
  g.ultimoCalcolo=R;g.fase=g.giostra===3?'fine':'intergiostra';
  return R;
}
function chiudiGiostra(g){
  for(const v of g.v){
    for(const c of[v.campo.cav,v.campo.scu,v.campo.equ])if(c)v.scarti.push(c);
    v.scarti.push(...v.campo.giullari);v.campo=nuovoCampo();
  }return g;
}

/* ==========================================================================
   2. IL BOT — draft e gioco, senza guardare le carte coperte
   ========================================================================== */
const BOT=1, ME=0;

/* --- Valutazione di draft ------------------------------------------------
   Tarata sui dati: servono 9 carte dal 2 al 7 (Cavaliere, Scudiero ed
   Equipaggiamento per tre giostre) e non una di più. Tutto il resto della
   Carovana rende di più se è fatto di figure, che però sono solo 12 in tutto:
   il draft è una rissa per una risorsa che non basta per due.
------------------------------------------------------------------------- */
const BASSE_NECESSARIE = 9;

function valoreDraft(c,carovana,livello){
  const W=PROFILI[livello]||PROFILI.normale;
  if(!c) return 3.6;                       // coperta: conviene prenderne circa metà
  const basse=carovana.filter(x=>!isGiullare(x)).length;
  const giu=carovana.filter(isGiullare).length;
  const nove=carovana.filter(x=>x.v===9).length;
  // il principiante vede le figure come carte mediocri e insegue i numeri alti
  const fig=base=>base*W.draft + 3.4*(1-W.draft);

  if(c.v===10) return fig(10.5+Math.min(giu,5)*1.9);
  if(c.v===8)  return fig(8.0);
  if(c.v===9)  return fig(6.6-nove*1.6);

  let v = 2.4 + (c.v===7?0.6:0) + c.v*0.22*(1-W.draft);
  v += Math.min(carovana.filter(x=>x.s===c.s&&!isGiullare(x)).length,3)*0.5;   // blocchi di seme
  v += Math.min(carovana.filter(x=>!isGiullare(x)&&x.v+c.v===8).length,2)*0.7; // coppie che fanno 8
  if(basse>=BASSE_NECESSARIE) v *= 1-0.55*W.draft;   // oltre le nove necessarie rendono poco
  return v;
}
function botDraft(g,livello){
  const gr=g.gruppi[g.gruppoIdx], car=g.v[BOT].carovana;
  const rum=(PROFILI[livello]||PROFILI.normale).rumore*0.4;
  let best=-1,bs=-Infinity;
  gr.forEach((sl,i)=>{
    if(sl.presa!==null)return;
    const s=valoreDraft(sl.coperta?null:sl.c,car,livello)+g.rnd()*rum;
    if(s>bs){bs=s;best=i;}
  });
  return best;
}

/* --- Valutazione di gioco ------------------------------------------------
   Ogni livello ha un profilo strategico diverso, non solo più rumore.
   attesa : quanto capisce che lo Scudiero va calato tardi
   combo  : quanto capisce che il 10 da solo vale zero
   tempi  : quanto aspetta col Guastafeste che ci sia uno Scudiero da colpire
   mira   : quanto ottimizza il Cavaliere verso l'8
------------------------------------------------------------------------- */
const PROFILI={
  facile:   {attesa:0,   combo:0,   tempi:0,   mira:0.45, draft:0.28, rumore:2.6},
  normale:  {attesa:0.45,combo:0.45,tempi:0.45,mira:0.75, draft:0.42, rumore:1.4},
  difficile:{attesa:1,   combo:1,   tempi:1,   mira:1,    draft:1,    rumore:0}
};
function potenzialeGiullari(v){
  return v.campo.giullari.length + v.mano.filter(isGiullare).length;
}
/** Il miglior Cavaliere (con eventuale equipaggiamento) ottenibile dalla mano. */
function miglioreCavaliere(mano,ac){
  const basse=mano.filter(c=>!isGiullare(c));
  let best=null;
  for(const cav of basse){
    const b=cav.s===ac.s?1:0;
    let d=Math.abs(BERSAGLIO-(cav.v+b));
    if(!best||d<best.dist)best={cav,equ:null,dist:d,tot:cav.v+b};
    for(const eq of basse){
      if(eq.id===cav.id)continue;
      const t=cav.v+b+eq.v,dd=Math.abs(BERSAGLIO-t);
      if(dd<best.dist)best={cav,equ:eq,dist:dd,tot:t};
    }
  }
  return best;
}

function botMossa(g,livello){
  const W=PROFILI[livello]||PROFILI.normale;
  const v=g.v[BOT],av=g.v[ME],ac=g.assoCorrente,an=g.assoNemico;
  const legali=mosseLegali(g,BOT);
  if(legali.length<=1)return{tipo:'passa'};
  const mano=v.mano, ultimo=g.giostra===3;
  const avvFinito = av.passato || av.mano.length===0;
  const piano = miglioreCavaliere(mano,ac);

  const punteggio=m=>{
    if(m.tipo==='passa'){
      let s=0.5;
      if(ultimo) s-=mano.length*2.2;
      if(!v.campo.cav && piano) s-=7;
      if(!v.campo.scu && mano.some(c=>!isGiullare(c))) s-=3.2;
      if(mano.some(c=>c.v===10) && potenzialeGiullari(v)>1) s-=5;
      if(mano.some(c=>c.v===8)) s-=2.5;
      if(mano.some(c=>c.v===9) && av.campo.scu) s-=6;
      return s;
    }
    const c=mano.find(x=>x.id===m.id);

    if(m.ruolo==='giullare'){
      if(c.v===10){
        const altri=potenzialeGiullari(v)-1;
        // senza "combo" il bot crede che un 10 valga sempre: lo cala e basta
        const consapevole = altri>=1 ? 5.5+altri*1.5 : (c.s===an.s?2.2:-2.5);
        const ingenuo = 6.5;
        let s = ingenuo + (consapevole-ingenuo)*W.combo;
        if(c.s===an.s)s+=1.6;
        if(ultimo&&altri===0&&c.s!==an.s)s=Math.min(s,0.4+2*(1-W.combo));
        return s;
      }
      if(c.v===8){
        let s=4.4;
        if(v.carovana.length===0)s-=2.2;
        if(c.s===an.s)s+=1.5;
        if(mano.some(x=>x.v===10)||v.campo.giullari.some(x=>x.v===10))s+=1.4*W.combo;
        // la Staffetta è anche una valvola: se c'è da ripulire si usa subito,
        // altrimenti conviene tenerne una di riserva
        const morte=mano.filter(x=>!isGiullare(x)&&!ruoliPossibili(v.campo,x).length).length;
        if(morte)s+=3.2*W.combo;
        else if(!ultimo)s-=2.0*W.combo;
        return s;
      }
      // il 9
      let s;
      if(av.campo.scu) s=9.5;
      else{
        const consapevole = avvFinito ? (c.s===an.s?2.6:0.9) : -1.5;
        const ingenuo = 5.5;                       // il bot facile lo spara subito
        s = ingenuo + (consapevole-ingenuo)*W.tempi;
        if(c.s===an.s)s+=1.4;
        if(ultimo)s+=2.2;
      }
      if(v.campo.giullari.some(x=>x.v===10)||mano.some(x=>x.v===10))s+=1.2*W.combo;
      return s;
    }

    if(m.ruolo==='cavaliere'){
      if(!piano)return 0;
      const b=c.s===ac.s?1:0, d=Math.abs(BERSAGLIO-(c.v+b));
      // senza "mira" il bot guarda il valore nudo invece della distanza dall'8
      let s = 7 - d*1.25*W.mira + c.v*0.5*(1-W.mira);
      if(piano.cav.id===c.id) s+=2.2*W.mira;
      if(piano.equ&&piano.cav.id===c.id) s+=1.1*W.mira;
      if(b) s+=1.3;
      return s;
    }

    if(m.ruolo==='scudiero'){
      // il cuore del gioco: aspettare che l'avversario non possa più giocare il 9
      const rischio = avvFinito ? 0 : (1+av.mano.length*0.85)*W.attesa;
      const val = c.v + (v.campo.cav&&v.campo.cav.s===c.s?2:0);
      let s = 3 + val*0.55 - rischio*1.35;
      if(v.campo.cav&&v.campo.cav.s===c.s) s+=1.8;
      if(!v.campo.cav&&piano&&piano.cav.id===c.id) s-=4*W.mira;
      if(avvFinito) s+=3.5*W.attesa;
      if(ultimo) s+=1.2;
      return s;
    }

    if(m.ruolo==='equipaggiamento'){
      const cav=v.campo.cav,b=cav.s===ac.s?1:0;
      const prima=Math.abs(BERSAGLIO-(cav.v+b)), dopo=Math.abs(BERSAGLIO-(cav.v+b+c.v));
      let s = 3 + (prima-dopo)*2.6*W.mira;
      if(dopo===0)s+=3*W.mira;
      if(dopo>prima)s-=6*W.mira;
      return s;
    }
    return 0;
  };

  let best=null,bs=-Infinity;
  for(const m of legali){
    const s=punteggio(m)+g.rnd()*W.rumore;
    if(s>bs){bs=s;best=m;}
  }
  return best;
}

/** La scelta della Staffetta per il bot: pescare o scartare, mai nessuna delle due. */
function sceltaStaffettaBot(g,p,livello){
  const W=PROFILI[livello]||PROFILI.normale;
  const v=g.v[p], ultimo=g.giostra===3, ac=g.assoCorrente, an=g.assoNemico;
  if(!v.mano.length) return {tipo:'pesca'};
  const peso=c=>{
    if(c.v===10)return 30; if(c.v===8)return 26; if(c.v===9)return 22;
    if(!ruoliPossibili(v.campo,c).length)return -99;     // non ha più uno slot dove andare
    let x=5-Math.abs(BERSAGLIO-(c.v+(c.s===ac.s?1:0)))*0.5;
    if(c.s===ac.s)x+=2; if(c.s===an.s)x+=0.4; return x;
  };
  const peggiore=v.mano.slice().sort((x,y)=>peso(x)-peso(y))[0];
  if(!v.carovana.length) return {tipo:'scarta',id:peggiore.id};   // obbligato
  if(W.combo<0.3) return {tipo:'pesca'};                          // il principiante pesca e basta
  if(peso(peggiore)===-99) return {tipo:'scarta',id:peggiore.id};
  const basse=v.mano.filter(c=>!isGiullare(c));
  const residui=(!v.campo.cav?1:0)+(!v.campo.scu?1:0)+(!v.campo.equ?1:0);
  const soglia=ultimo?residui:residui+1;                          // una la posso riportare
  if(basse.length>soglia){
    const pb=basse.slice().sort((x,y)=>peso(x)-peso(y))[0];
    if(pb)return {tipo:'scarta',id:pb.id};
  }
  return {tipo:'pesca'};
}

/** LA CONTA del bot: scarta le carte meno utili. */
function botConta(g,livello){
  const W=PROFILI[livello]||PROFILI.normale;
  const v=g.v[BOT],ac=g.assoCorrente,an=g.assoNemico;
  const extra=v.mano.length-6;
  if(extra<=0)return[];
  const peso=c=>{
    if(c.v===10)return 20+v.mano.filter(isGiullare).length*W.combo;
    if(c.v===8)return 15;
    if(c.v===9)return 12;
    let p=5-Math.abs(BERSAGLIO-(c.v+(c.s===ac.s?1:0)))*0.5*W.mira+c.v*0.3*(1-W.mira);
    if(c.s===ac.s)p+=2;
    if(c.s===an.s)p+=0.4;
    return p;
  };
  return v.mano.slice().sort((a,b)=>peso(a)-peso(b)).slice(0,extra).map(c=>c.id);
}


/* ==========================================================================
   4. L'ARBITRO — vista filtrata e Durable Object
   Il motore qui sopra è lo stesso identico che gira nel browser.
   La differenza è che qui è autorevole: i client non ricevono mai
   informazione che non dovrebbero vedere.
   ========================================================================== */

const NASCOSTA = {s:'?', v:0, id:'??'};
const finePartita = f => f==='applausi'||f==='intergiostra'||f==='fine';

function vistaCampo(k, scoperto){
  const c = x => x ? (scoperto ? x : NASCOSTA) : null;
  return {cav:c(k.cav), scu:c(k.scu), equ:c(k.equ), giullari:k.giullari.slice()};
}

/** Lo stato della partita come lo può vedere il viandante p.
    Chi riceve si trova sempre in posizione 0: così il client non cambia una riga. */
function vista(g, p, ultima){
  const av=1-p, mio=g.v[p], suo=g.v[av];
  const fine = finePartita(g.fase);
  const riempi = n => Array(n).fill(NASCOSTA);
  const V = {
    fase:g.fase, giostra:g.giostra,
    turno: g.turno===p?0:1,
    iC:g.iC, iN:g.iN,
    assoCorrente:g.assoCorrente, assoNemico:g.assoNemico,
    // gli Assi che non influenzano questa giostra restano coperti anche nei dati
    mappa:(g.mappa||[]).map((a,i)=> (i===g.iC||i===g.iN) ? a : NASCOSTA),
    attesa: g.attesa ? {p: g.attesa.p===p?0:1} : null,
    v:[
      {nome:'Tu', pf:mio.pf, passato:mio.passato, contaFatta:!!mio.contaFatta,
       mano:mio.mano.slice(), carovana:riempi(mio.carovana.length),
       campo:vistaCampo(mio.campo, true)},
      {nome:'Avversario', pf:suo.pf, passato:suo.passato, contaFatta:!!suo.contaFatta,
       mano:riempi(suo.mano.length), carovana:riempi(suo.carovana.length),
       campo:vistaCampo(suo.campo, fine)}
    ]
  };
  if(g.fase==='draft'){
    V.gruppoIdx=g.gruppoIdx;
    V.v[0].carovana=mio.carovana.slice();      // durante il draft vedo le mie
    V.gruppi=g.gruppi.map(gr=>gr.map(sl=>({
      coperta:sl.coperta,
      presa: sl.presa===null?null:(sl.presa===p?0:1),
      // una coperta presa dall'avversario non lascia mai il server
      c: (!sl.coperta || sl.presa===p) ? sl.c : NASCOSTA
    })));
    V.ultima = ultima || null;
  }
  return V;
}

/** Anche il conteggio dei Punti Favore va girato dalla parte di chi legge. */
function vistaR(R,p){
  if(!R) return null;
  if(p===0) return R;
  const gira = o => ({...o, a:o.b, b:o.a,
    vincitore: o.vincitore===null||o.vincitore===undefined ? o.vincitore : 1-o.vincitore,
    spareggio: o.spareggio ? {a:o.spareggio.b, b:o.spareggio.a} : o.spareggio});
  return {...R, pf:[R.pf[1],R.pf[0]], mano:[R.mano[1],R.mano[0]],
    scudieri:gira(R.scudieri), cavalieri:gira(R.cavalieri),
    istrione:{a:R.istrione.b, b:R.istrione.a}};
}

/* ---------------------------------------------------------------------- */

export class Partita {
  constructor(state, env){
    this.state=state; this.env=env;
    this.g=null; this.R=null; this.ultima=null;
    this.sedi=[null,null];      // token dei due posti
    this.ws=[null,null];
    this.pronti=[false,false];
  }

  async fetch(req){
    if(req.headers.get('Upgrade')!=='websocket')
      return new Response('Serve una connessione websocket.',{status:426});
    const token=new URL(req.url).searchParams.get('token')||null;
    const coppia=new WebSocketPair();
    this.accogli(coppia[1], token);
    return new Response(null,{status:101, webSocket:coppia[0]});
  }

  accogli(ws, token){
    ws.accept();
    let p = token ? this.sedi.indexOf(token) : -1;     // riconnessione
    if(p<0){
      p = this.sedi.indexOf(null);
      if(p<0){ this.manda(ws,{t:'pieno'}); ws.close(1000,'partita al completo'); return; }
      this.sedi[p] = crypto.randomUUID().slice(0,8);
    }
    if(this.ws[p]){ try{ this.ws[p].close(1000,'sostituito'); }catch(e){} }
    this.ws[p]=ws;
    this.manda(ws,{t:'posto', p, token:this.sedi[p]});

    if(this.sedi[0] && this.sedi[1] && !this.g){
      this.g = nuovaPartita({primo: Math.random()<0.5?0:1, nomi:['A','B']});
      creaDraft(this.g);
    }
    this.trasmetti();

    ws.addEventListener('message', ev=>{
      let m; try{ m=JSON.parse(ev.data); }catch(e){ return; }
      if(m && m.t==='azione') this.azione(p, m.a||{});
    });
    ws.addEventListener('close', ()=>{ if(this.ws[p]===ws) this.ws[p]=null; this.trasmetti(); });
    ws.addEventListener('error', ()=>{ if(this.ws[p]===ws) this.ws[p]=null; });
  }

  azione(p,a){
    const g=this.g;
    if(!g){ return; }
    try{
      switch(a.t){
        case 'draft':
          if(g.fase!=='draft'||g.turno!==p) return;
          this.ultima={gruppo:g.gruppoIdx, i:a.i, chi:p};
          prendiInDraft(g,p,a.i);
          if(g.fase==='pronti') this.apriGiostra();
          break;
        case 'conta':
          if(g.fase!=='conta'||g.v[p].contaFatta) return;
          conta(g,p,Array.isArray(a.ids)?a.ids:[]);
          break;
        case 'gioca':
          if(g.fase!=='giostra'||g.turno!==p||g.attesa) return;
          gioca(g,p,a.id,a.ruolo);
          this.dopoMossa();
          break;
        case 'staffetta':
          if(!g.attesa||g.attesa.p!==p) return;
          risolviStaffetta(g,a.scelta||{tipo:'pesca'});
          this.dopoMossa();
          break;
        case 'passa':
          if(g.fase!=='giostra'||g.turno!==p||g.attesa) return;
          passa(g,p);
          this.dopoMossa();
          break;
        case 'avanti':
          if(!finePartita(g.fase)) return;
          this.pronti[p]=true;
          if(this.pronti[0]&&this.pronti[1]&&g.giostra<3){
            this.pronti=[false,false];
            chiudiGiostra(g);
            this.apriGiostra();
          }
          break;
      }
    }catch(e){
      this.manda(this.ws[p], {t:'errore', m:String(e.message||e)});
    }
    this.trasmetti();
  }

  apriGiostra(){ iniziaGiostra(this.g); this.R=null; this.ultima=null; }
  dopoMossa(){ if(this.g.fase==='applausi') this.R=applausi(this.g); }

  manda(ws,o){ if(!ws) return; try{ ws.send(JSON.stringify(o)); }catch(e){} }

  trasmetti(){
    const collegati = this.ws.filter(Boolean).length;
    for(let p=0;p<2;p++){
      if(!this.ws[p]) continue;
      this.manda(this.ws[p], this.g
        ? {t:'stato', collegati, v:vista(this.g,p,this.ultima), R:vistaR(this.R,p)}
        : {t:'attesa', collegati});
    }
  }
}

/* ---------------------------------------------------------------------- */

export default {
  async fetch(req, env){
    const u=new URL(req.url);
    const intestazioni={'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,OPTIONS'};
    if(req.method==='OPTIONS') return new Response(null,{headers:intestazioni});
    if(u.pathname==='/ws'){
      const codice=(u.searchParams.get('codice')||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
      if(codice.length<4) return new Response('codice non valido',{status:400,headers:intestazioni});
      const id=env.PARTITA.idFromName(codice);
      return env.PARTITA.get(id).fetch(req);
    }
    return new Response('Carovana — server delle partite. Il gioco sta altrove.',
      {headers:{...intestazioni,'content-type':'text/plain; charset=utf-8'}});
  }
};

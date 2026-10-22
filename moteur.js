/* ============================================================
   MOTEUR DE LA LISIÈRE
   Temps réel, météo, zones, pousse, rosée, visiteurs, matières, atelier, vœux, secrets, carnet, son, ciel.
   Ne contient aucun contenu : tout vient de contenu.js (objet CONTENU).
   ============================================================ */
(function(){
"use strict";
const {PLANTES, VISITEURS, HABITANTS, VOEUX, SECRETS, TEXTES, ART, REGLES, MOMENTS, TEMPS, ZONES, MATIERES, OBJETS, BATIMENTS, DENREES, RECETTES, AMELIORATIONS, VILLE, CHAPITRES, EVENEMENTS, ETALS} = CONTENU;
const $ = id => document.getElementById(id);
const zoneDef = id => ZONES.find(z=>z.id===id);
/* Illustrations : si le pack img/ est présent (sondé au démarrage), on l'utilise partout ; sinon les dessins en code restent. */
let IMG = false;
const im = (nom, cls="dessin") => `<img class="${cls}" src="img/${nom}.webp" alt="" draggable="false">`;
const image = d => IMG && !d.sansImage ? im(`visiteur-${d.id}`) : d.svg ? `<svg viewBox="0 0 100 100" class="dessin" aria-hidden="true">${d.svg}</svg>` : d.emoji;

/* ---------- sauvegarde versionnée ---------- */
const KEY = "jardin", VERSION = 6;
function potsNeufs(z){ return Array.from({length:z.nbPots},(_,i)=>({ouvert:z.prixPot[i]===0, plante:null, age:0, eau:0, sec:0})); }
function etatNeuf(){
  const zones = {}; ZONES.forEach(z=>{ zones[z.id] = {pots:potsNeufs(z), visiteur:null}; });
  return {v:VERSION, or:10, orTotal:0, lunes:0, lunesTotal:0, recoltes:0, panier:{}, herbier:{}, recettes:{botte:1}, amelio:{}, rares:0, cuisines:0, cuissons:[], decouvertes:{}, etals:{}, postes:{},
    ville:{lettres:[], facteurJour:"", livrees:0, chapitres:{}, lus:{}, visiteJour:"", nid:0, journal:[]}, feteVue:{}, rosee:3, regen:0, averse:0, graines:0,
    matieres:{}, objets:{}, habitants:{}, village:{batis:{}, chantier:null}, visites:{}, secrets:{}, voeuxFaits:{}, lunesFleuries:0, tapsLune:0, tapsSoleil:0, pleineLune:false, aubeJour:"",
    son:{}, zones, t:Date.now()};
}
function migrer(s){
  if(!s.v){ s.v=4; s.lunesTotal = s.lunesTotal||0; }
  if(s.v<5){ // v4 : un seul parterre `pots` et un `visiteur` -> zones
    s.zones = {potager:{pots:s.pots, visiteur:s.visiteur||null}}; delete s.pots; delete s.visiteur; s.v=5;
  }
  if(s.v<6){ // v5 : les lunes servaient à tout ; elles deviennent l'or, et on repart avec quelques lunes
    s.or = s.lunes||0; s.orTotal = s.lunesTotal||0; s.lunes = 12; s.v=6;
  }
  const n = etatNeuf(), e = Object.assign(n, s, {v:VERSION});
  e.son = Object.assign(n.son, s.son||{}); e.matieres = s.matieres||{}; e.objets = s.objets||{}; e.habitants = s.habitants||{}; e.village = Object.assign({batis:{}, chantier:null}, s.village||{});
  e.ville = Object.assign(n.ville, s.ville||{}); e.panier = s.panier||{}; e.herbier = s.herbier||{}; e.recettes = Object.assign({botte:1}, s.recettes||{}); e.amelio = s.amelio||{}; e.cuissons = s.cuissons||[]; e.decouvertes = s.decouvertes||{}; e.etals = s.etals||{}; e.postes = s.postes||{}; delete e.abos; delete e.attentes;
  ZONES.forEach(z=>{ if(!e.zones[z.id]) e.zones[z.id]={pots:potsNeufs(z), visiteur:null};
    const pots=e.zones[z.id].pots; while(pots.length<z.nbPots) pots.push({ouvert:false, plante:null, age:0, eau:0, sec:0}); });
  return e;
}
function charger(){
  try{
    let s = JSON.parse(localStorage.getItem(KEY));
    if(!s){ const ancien = localStorage.getItem("jardin-de-nuit-v3"); if(ancien) s = JSON.parse(ancien); }
    if(s && (s.pots || s.zones)) return migrer(s);
  }catch(e){}
  return etatNeuf();
}
let etat = charger();
let dernierTick = etat.t || Date.now();
function sauver(){ etat.t = Date.now(); try{ localStorage.setItem(KEY, JSON.stringify(etat)); }catch(e){} }

/* ---------- temps, météo, phase ---------- */
let TEMPSID = REGLES.temps(new Date());
const tempsDef = () => TEMPS.find(t=>t.id===TEMPSID) || TEMPS[0];
let PLUIE = tempsDef().pluie;
/* lever et coucher du soleil (algorithme NOAA simplifié), en minutes locales depuis minuit */
function soleil(d){
  const {lat, lon} = REGLES.lieu, rad=Math.PI/180;
  const debut = new Date(d.getFullYear(),0,0), jour = Math.floor((d-debut)/86400000);
  const g = 2*Math.PI/365*(jour-1+(12-12)/24);
  const eqt = 229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  const decl = 0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  const cosH = (Math.cos(90.833*rad)/(Math.cos(lat*rad)*Math.cos(decl))) - Math.tan(lat*rad)*Math.tan(decl);
  if(cosH<-1 || cosH>1) return null;
  const H = Math.acos(cosH)/rad;
  const tz = -d.getTimezoneOffset();
  const lever = 720 - 4*(lon + H) - eqt + tz, coucher = 720 - 4*(lon - H) - eqt + tz;
  return {lever, coucher};
}
function phaseDe(d){
  const sol = soleil(d), m = d.getHours()*60 + d.getMinutes() + d.getSeconds()/60;
  const par = id => MOMENTS.find(p=>p.id===id);
  const lever = sol ? sol.lever : 7*60, coucher = sol ? sol.coucher : 19*60;
  if(m >= lever-REGLES.aubeAvant && m < lever+REGLES.aubeApres) return par("aube");
  if(m >= lever+REGLES.aubeApres && m < Math.min(11.5*60, coucher-90)) return par("matin");
  if(m >= 11.5*60 && m < 14.5*60 && m < coucher-90) return par("midi");
  if(m >= lever+REGLES.aubeApres && m < coucher-90) return par("apresmidi");
  if(m >= coucher-90 && m < coucher+REGLES.crepApres) return par("soir");
  return par("nuit");
}
let PHASE = phaseDe(new Date());
// la carte et le sentier passent au jour au lever exact du soleil, et à la nuit à son coucher
function estSoleilLeve(){ const d=new Date(), sl=soleil(d), m=d.getHours()*60+d.getMinutes(); return sl ? (m>=sl.lever && m<sl.coucher) : PHASE.carte==="jour"; }
const nuit = () => PHASE.ciel==="lune";
let ZONE = "village";   // zone affichée ("village" = carte d'accueil, "atelier" = atelier)
const zoneJeu = () => zoneDef(ZONE) ? ZONE : "potager";

/* ---------- effets des objets ---------- */
const bati = id => !!etat.village.batis[id];
function fx(){
  const e = {dureeVisite:1, bonusLunes:0, periode:{}, roseeMax:0, regenRosee:1, pluieToujours:false, seuil:false, aubeLunes:0, aubeMatiere:[], aubeDenree:[], potsGratuits:{}, vitesse:{}, rare:0, lettres:0, feux:0, dureeLettres:0};
  const ams = AMELIORATIONS.filter(a=>etat.amelio[a.id]>0).map(a=>({effets:a.effet(etat.amelio[a.id])}));
  const actifs = [...OBJETS.filter(o=>etat.objets[o.id]), ...BATIMENTS.filter(b=>bati(b.id)), ...ams];
  for(const o of actifs){ const f=o.effets||{};
    if(f.dureeVisite) e.dureeVisite*=f.dureeVisite; if(f.bonusLunes) e.bonusLunes+=f.bonusLunes; if(f.roseeMax) e.roseeMax+=f.roseeMax;
    if(f.regenRosee) e.regenRosee*=f.regenRosee; if(f.pluieToujours) e.pluieToujours=true; if(f.seuil) e.seuil=true; if(f.aubeLunes) e.aubeLunes+=f.aubeLunes;
    if(f.aubeMatiere) e.aubeMatiere.push(f.aubeMatiere); if(f.aubeDenree) e.aubeDenree.push(f.aubeDenree);
    if(f.rare) e.rare+=f.rare; if(f.lettres) e.lettres+=f.lettres; if(f.feux) e.feux+=f.feux; if(f.dureeLettres) e.dureeLettres+=f.dureeLettres;
    for(const z in (f.vitesse||{})) e.vitesse[z]=(e.vitesse[z]||1)*f.vitesse[z];
    for(const k in (f.periode||{})) e.periode[k]=(e.periode[k]||1)*f.periode[k];
    for(const z in (f.potsGratuits||{})) e.potsGratuits[z]=[...(e.potsGratuits[z]||[]), ...f.potsGratuits[z]]; }
  return e;
}

/* ---------- contexte passé aux conditions du contenu ---------- */
function ctx(evt=null, zone=null){
  const z0 = zone || zoneJeu();
  const pots = z => z==="*" ? ZONES.flatMap(zz=>etat.zones[zz.id].pots) : (etat.zones[z]||{pots:[]}).pots;
  return {
    etat, pluie:PLUIE, temps:TEMPSID, fete:feteActive(), chapitre:chapitreAtteint(), heure:new Date().getHours(), phase:PHASE.phase, moment:PHASE.id, zone:z0, evt,
    minute:(()=>{ const d=new Date(); return d.getHours()*60+d.getMinutes(); })(), soleil:soleil(new Date()),
    aPlante:(k,av,z)=>pots(z||PLANTES[k]&&PLANTES[k].zone||z0).some(p=>p.plante===k && p.age/PLANTES[k].duree>=av),
    nb:(f,z)=>pots(z||z0).filter(f).length,
    objet:id=>!!etat.objets[id],
    bati,
    vu:k=>(etat.herbier[k]||{}).n||0,
    amitie:h=>(etat.habitants[h]||{}).amitie||0,
    chap:id=>!!(etat.ville && etat.ville.chapitres[id]),
  };
}
/* ---------- événements datés ---------- */
function feteDef(d=new Date()){
  const v = (d.getMonth()+1)*100 + d.getDate();
  return EVENEMENTS.find(e=>{ const a=e.du[0]*100+e.du[1], b=e.au[0]*100+e.au[1]; return a<=b ? (v>=a && v<=b) : (v>=a || v<=b); }) || null;
}
const feteActive = () => { const e=feteDef(); return e ? e.id : null; };
function chapitreAtteint(){ let n=-1; CHAPITRES.forEach((ch,i)=>{ if(etat.ville && etat.ville.chapitres[ch.id]) n=i; }); return n; }

/* ---------- panier : plantes récoltées (id, ou id* pour la variante rare), denrées, et matières pour les recettes ---------- */
const estRare = id => id.endsWith("*");
const base = id => estRare(id) ? id.slice(0,-1) : id;
function defObjet(id){ const b=base(id), p=PLANTES[b], d=DENREES[b], m=MATIERES[b];
  if(p) return {nom: estRare(id) ? p.rare : p.nom, emoji:p.emoji, valeur:(p.valeur||0)*(estRare(id)?3:1), g:p.g, plante:true, rare:estRare(id), art:p};
  if(d) return {nom:d.nom, emoji:d.emoji, valeur:d.valeur, g:d.g};
  if(m) return {nom:m.nom, emoji:m.emoji, valeur:0, g:"m", matiere:true};
  return {nom:id, emoji:"·", valeur:0, g:"m"}; }
function qte(id){ if(MATIERES[id]) return etat.matieres[id]||0; return (etat.panier[id]||0) + (PLANTES[id] ? (etat.panier[id+"*"]||0) : 0); }
function ajouter(id, n=1){ if(MATIERES[id]){ etat.matieres[id]=(etat.matieres[id]||0)+n; return; } etat.panier[id]=(etat.panier[id]||0)+n; if(etat.panier[id]<=0) delete etat.panier[id]; }
function retirer(id, n=1){ // les variantes rares ne partent qu'en dernier
  if(MATIERES[id]){ etat.matieres[id]=Math.max(0,(etat.matieres[id]||0)-n); return; }
  const a=Math.min(n, etat.panier[id]||0); ajouter(id,-a); if(n-a>0 && PLANTES[id]) ajouter(id+"*",-(n-a)); }
// icône d'un objet du panier : illustration si elle existe, sinon emoji
function ico(id, cls="ico"){ const b=base(id), p=PLANTES[b], d=DENREES[b];
  if(IMG && p && estRare(id)) return `<span class="${cls} rareIco"><img src="img/rare-${b}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='img/plante-${b}-4.webp';this.parentNode.classList.add('halo')"></span>`;
  if(IMG && p) return `<span class="${cls}">${im(`plante-${b}-4`,"")}</span>`;
  if(IMG && d && d.img) return `<span class="${cls}">${im(`denree-${b}`,"")}</span>`;
  if(IMG && MATIERES[b]) return `<span class="${cls}">${im(`matiere-${b}`,"")}</span>`;
  return `<span class="${cls} emo">${defObjet(id).emoji}</span>`; }
// portrait d'un habitant de Saint-Aubin : buste pour les lettres, en pied pour les visites
const portrait = (p, tete) => IMG ? `<span class="portrait${tete?" tete":""}"><img src="img/pnj-${p.id}${tete?"-tete":""}.webp" alt="" draggable="false" onerror="this.outerHTML='<span class=&quot;emo&quot;>${p.emoji}</span>'"></span>` : `<span class="big">${p.emoji}</span>`;
const aTout = ingr => Object.keys(ingr).every(k=>qte(k)>=ingr[k]);
// pluriel : on accorde le premier mot (« bottes de radis », « fleurs de lune ») ; s, x et z restent
const plur = (nom, n) => { nom = nom.toLowerCase(); if(n<2) return nom; const i = nom.search(/[ ']/), m = i<0 ? nom : nom.slice(0,i), r = i<0 ? "" : nom.slice(i); return (/[sxz]$/.test(m) ? m : m.endsWith("au") ? m+"x" : m+"s") + r; };
const listeObjets = ingr => { const t = Object.keys(ingr).map(k=>`${ingr[k]} ${plur(defObjet(k).nom, ingr[k])}`); return t.length>1 ? t.slice(0,-1).join(", ")+" et "+t[t.length-1] : t[0]; };
const listeEmoji = ingr => Object.keys(ingr).map(k=>`<span class="besoin ${qte(k)>=ingr[k]?"ok":""}">${ico(k)} ${qte(k)}/${ingr[k]}</span>`).join(" ");
function gagnerOr(n){ etat.or+=n; etat.orTotal=(etat.orTotal||0)+n; }
function gagnerLunes(n){ etat.lunes+=n; etat.lunesTotal+=n; }
// un objet peut-il s'obtenir maintenant ? (sa zone est ouverte, sa recette connue ou ouverte par la fête)
function obtenable(id){
  // une plante n'est demandée que si elle est bon marché ou déjà récoltée : pas de citrouille à qui n'a jamais pu en semer
  const p=PLANTES[id]; if(p) return !p.graine && zoneOuverte(p.zone) && (p.prix<=5 || !!etat.herbier[id]);
  if(id==="poire") return bati("poirier");
  const r=RECETTES.find(x=>x.id===id);
  if(r) return !!(etat.recettes[id] || (r.fete && r.fete===feteActive())) && Object.keys(r.ingr).every(k=>MATIERES[k] ? true : obtenable(k));
  return false;
}

const roseeMax = () => REGLES.roseeMax(ctx()) + fx().roseeMax;
const accord = (p,m,f) => p.g==="f" ? f : m;
// le message du bas s'affiche le temps de le lire (selon sa longueur), puis s'efface ; la bande disparaît avec lui
let minuteurMsg = 0;
function dire(t){ const m=$("msg"); clearTimeout(minuteurMsg); if(!t){ effacerMsg(); return; }
  m.textContent = t; m.hidden = false; m.classList.remove("part");
  minuteurMsg = setTimeout(effacerMsg, Math.min(14000, 5000 + t.length*45)); }
function effacerMsg(){ const m=$("msg"); clearTimeout(minuteurMsg); if(m.hidden) return; m.classList.add("part"); minuteurMsg = setTimeout(()=>{ m.hidden=true; m.classList.remove("part"); }, 450); }
const besoin = p => p.besoin || "rosee";
function duree(sec){ sec=Math.round(sec); if(sec<90) return `${sec} s`; const m=Math.round(sec/60); if(m<60) return `${m} min`; const h=Math.floor(m/60), r=m%60; return r ? `${h} h ${String(r).padStart(2,"0")}` : `${h} h`; }

/* ---------- habitants : présence, demandes, histoires ---------- */
function habitantPresent(h, c){ try{ return !!h.cond(c||ctx(null,h.zone)); }catch(e){ return false; } }
function demandeActive(h){ const hs=etat.habitants[h.id]; return hs && hs.demande ? h.demandes.find(d=>d.id===hs.demande) : null; }
function terminerDemande(h, d){
  const hs = etat.habitants[h.id];
  hs.faites.push(d.id); hs.demande=null; hs.prochaine = Date.now() + h.delai*1000;
  gagnerLunes(d.don); hs.amitie = Math.min(10, (hs.amitie||0) + 2);
  const elle = h.nom.startsWith("La ");
  // une demande accomplie se voit : la page de son histoire s'ouvre (ou attend dans le résumé d'absence)
  const titre = `${h.nom} ${elle?"est contente":"est content"}`;
  if(collecte) annoncer(`${titre} : ${d.but.charAt(0).toLowerCase()+d.but.slice(1)}. +${d.don} 🌙. ${d.histoire}`);
  else if($("panneau").hidden) ouvrirPanneau(`<h2>${h.emoji} ${titre}</h2><div class="corps"><p class="intro">« ${d.texte} » C'est fait : ${d.but.charAt(0).toLowerCase()+d.but.slice(1)}.</p><div class="livreTexte"><p>${d.histoire}</p></div><div class="regle"><b>+${d.don} 🌙 et de l'amitié</b><small>Cette page rejoint son histoire, dans le carnet.</small></div></div>`);
  else dire(`${titre}. +${d.don} lunes. Son histoire s'écrit dans le carnet.`);
  tinter(587); tinter(740,.12); tinter(880,.24); rendreBarre();
}
function majHabitants(evt){
  const now = Date.now();
  for(const h of HABITANTS){
    const c = ctx(evt, h.zone);
    if(!habitantPresent(h, c)) continue;
    let hs = etat.habitants[h.id];
    if(!hs){ hs = etat.habitants[h.id] = {depuis:now, faites:[], demande:null, prochaine:now+h.premiere*1000, amitie:0}; dire(`${h.nom} reste. ${h.sentier}`); tinter(523); tinter(659,.12); rendreBarre(); }
    const d = demandeActive(h);
    if(d){
      if(d.offrir) continue;   // se satisfait en offrant depuis le panier
      let ok=false; try{ ok = !!d.cond(c); }catch(e){}
      if(ok) terminerDemande(h, d);
    } else if(now >= hs.prochaine){
      const suivante = h.demandes.find(x=>!hs.faites.includes(x.id));
      if(suivante){ hs.demande = suivante.id; dire(`${h.nom} a une demande : ${suivante.but}. Touche-${h.nom.startsWith("La")?"la":"le"} pour les détails.`); tinter(494); tinter(392,.15); }
    }
  }
}
// offrir quelque chose du panier à un habitant : des lunes et de l'amitié ; satisfait sa demande si c'est ce qu'il voulait
function offrir(h, id){
  const hs = etat.habitants[h.id]; if(!hs || qte(id)<=0) return;
  const d = demandeActive(h), def = defObjet(id), aime = h.aime.includes(base(id));
  if(d && d.offrir && d.offrir[base(id)]){
    const n = d.offrir[base(id)]; if(qte(base(id))<n) return;
    retirer(base(id), n); terminerDemande(h, d);
  } else {
    retirer(id,1);
    const l = Math.max(1, Math.round(def.valeur/8)) * (aime?2:1) + (def.rare?3:0);
    gagnerLunes(l); const avant = hs.amitie||0; hs.amitie = Math.min(10, avant + (aime?2:1));
    const s = [3,6,10].findIndex(x=>avant<x && hs.amitie>=x);
    dire(`${h.nom} ${aime?"adore":"accepte"} : ${def.nom.toLowerCase()}. +${l} lune${l>1?"s":""}.${s>=0?" Un souvenir s'ajoute dans le carnet.":""}`);
    tinter(587); tinter(784,.12);
  }
  evenement({type:"cadeau", habitant:h.id, objet:id}); sauver(); rendre();
}
function ouvrirHabitant(h){
  const hs = etat.habitants[h.id]; if(!hs) return;
  if(h.id==="chat" && !ouvrirHabitant.deja){ audio.effet("ronron"); ouvrirHabitant.deja=true; setTimeout(()=>ouvrirHabitant.deja=false, 8000); }
  const d = demandeActive(h), c = ctx(null, h.zone), am = hs.amitie||0;
  let dem;
  if(d){
    let prog = ""; if(d.prog){ try{ const [a,b]=d.prog(c); prog = `<div class="barreProg"><i style="width:${Math.round(100*Math.min(a,b)/b)}%"></i></div><small>${b===100?a+" %":Math.min(a,b)+" / "+b}</small>`; }catch(e){} }
    if(d.offrir){ const ok = aTout(d.offrir); prog = `<small>Dans ton panier : ${listeEmoji(d.offrir)}</small>`;
      dem = `<div class="carte-demande"><small class="dit">« ${d.texte} »</small><b>${d.but}</b>${prog}<small>Récompense : ${d.don} 🌙 et une page de son histoire.</small><button class="fermer" id="offrirDem" ${ok?"":"disabled"}>Offrir</button></div>`;
    } else dem = `<div class="carte-demande"><small class="dit">« ${d.texte} »</small><b>${d.but}</b>${prog}<small>Se valide toute seule dès que c'est le cas. Récompense : ${d.don} 🌙 et une page de son histoire.</small></div>`;
  } else {
    const reste = h.demandes.find(x=>!hs.faites.includes(x.id));
    const der = h.demandes.find(x=>x.id===hs.faites[hs.faites.length-1]);
    dem = (der ? `<div class="carte-demande calme"><small><b>Accomplie :</b> ${der.but}. ${der.histoire}</small></div>` : "") + `<div class="carte-demande calme"><small>${reste ? `Pas de demande pour l'instant. La prochaine dans ${duree(Math.max(60,(hs.prochaine-Date.now())/1000))}.` : "Il ne demande plus rien. Il est là, c'est tout."}</small></div>`;
  }
  const coeurs = `<div class="amitie" aria-label="Amitié ${am} sur 10">${Array.from({length:10},(_,i)=>`<i class="${i<am?"plein":""}"></i>`).join("")}</div>`;
  const dans = Object.keys(etat.panier).filter(k=>etat.panier[k]>0);
  dans.sort((x,y)=>(h.aime.includes(base(y))?1:0)-(h.aime.includes(base(x))?1:0));
  const dons = dans.length ? dans.map(k=>{ const df=defObjet(k), ai=h.aime.includes(base(k)); return `<button class="don ${ai?"aime":""}" data-don="${k}">${ico(k)} ${df.nom} <small>×${etat.panier[k]}${ai?" · adore":""}</small></button>`; }).join("") : `<small>Le panier est vide. Récolte d'abord.</small>`;
  const p = ouvrirPanneau(`<h2>${h.emoji} ${h.nom}</h2><div class="corps"><p class="intro">${h.titre} ${h.nom.startsWith("La ")?"Elle":"Il"} aime : ${h.aime.map(k=>defObjet(k).nom.toLowerCase()).join(", ")}.</p>${coeurs}
    <h3>Sa demande</h3>${dem}<h3>Lui offrir quelque chose</h3><p class="intro">Chaque cadeau rapporte des lunes et de l'amitié ; ce qu'il aime compte double.</p><div class="dons">${dons}</div></div>`);
  const b = $("offrirDem"); if(b) b.addEventListener("click", ()=>{ offrir(h, Object.keys(d.offrir)[0]); ouvrirHabitant(h); });
  p.querySelectorAll("[data-don]").forEach(x=>x.addEventListener("click", ()=>{ offrir(h, x.dataset.don); ouvrirHabitant(h); }));
}

/* ---------- secrets et vœux : évalués sur chaque événement ---------- */
function evenement(evt){
  majHabitants(evt); if(evt) majDecouvertes();
  const c = ctx(evt);
  for(const s of SECRETS){
    if(etat.secrets[s.id]) continue;
    let ok=false; try{ ok = !!s.test(c); }catch(e){}
    if(ok){
      etat.secrets[s.id]=Date.now(); gagnerLunes(s.don);
      dire(`Secret : « ${s.nom} ». +${s.don} lunes. Le carnet en garde la trace.`);
      tinter(587,0); tinter(784,.12); tinter(988,.24); tinter(1175,.36); audio.effet("bol");
      if(s.id==="pleinelune"){ etat.pleineLune=true; rendreTitre(); rendreMeteo(); }
      rendreBarre();
    }
  }
  for(const v of VOEUX){
    if(etat.voeuxFaits[v.id]) continue;
    let a=0,b=1; try{ [a,b]=v.prog(c); }catch(e){}
    if(a>=b){ etat.voeuxFaits[v.id]=true; dire(`Vœu accompli : ${v.nom}.`); tinter(659,0); tinter(880,.15); rendreBarre(); }
  }
}

/* ---------- navigation entre zones ---------- */
function rendreNav(){
  document.querySelectorAll("#bas [data-aller]").forEach(b=>{ if(b.dataset.aller===ZONE) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
}
function allerA(id){
  if(ZONE===id) return;
  effacerMsg();
  ZONE = id; document.body.dataset.zone = id;
  const z = zoneDef(id);
  $("ecran-village").hidden = id!=="village"; $("ecran-zone").hidden = !z; $("ecran-atelier").hidden = id!=="atelier" && id!=="cuisine"; $("ecran-courrier").hidden = id!=="courrier"; $("ecran-carnet").hidden = id!=="carnet";
  $("retour").hidden = id==="village";
  $("titre").textContent = z ? `${z.emoji} ${z.nom}` : id==="atelier" ? "🔨 L'atelier" : id==="cuisine" ? "🍳 La cuisine" : id==="courrier" ? "🧺 Le comptoir" : id==="carnet" ? "📖 Le carnet" : (etat.pleineLune ? TEXTES.titrePleine : TEXTES.titre);
  cleAtelier = ""; cleCourrier = "";
  if(id==="village") construireCarte();
  if(z){ construirePots(z); const p=PLANTES[outil]; if(outil!=="eau" && (!p || p.zone!==z.id)) outil=z.graines[0]; if(outil==="eau" && !z.rosee) outil=z.graines[0]; }
  $("contenu").scrollTop = 0; $("contenu").classList.toggle("plein", id==="village" || !!z);
  rendreNav(); rendreBarre(); rendre(); evenement(null);
  if(z) audio.effet("pas"); else if(id==="courrier"||id==="carnet") audio.effet("papier");
  if(id==="carnet") ouvrirCarnet();
  audio.rafraichir();
}
$("retour").addEventListener("click", ()=>allerA("village"));
window.lisiereRetour = () => { const p = $("panneau"); if(p && !p.hidden){ p.hidden = true; return true; } if(ZONE!=="village"){ allerA("village"); return true; } return false; };
document.querySelectorAll("#bas [data-aller]").forEach(b=>b.addEventListener("click", ()=>allerA(b.dataset.aller)));


/* ---------- rendu des pots (DOM reconstruit au changement de zone, mis à jour en place ensuite) ---------- */
let potsEl = [];
function construirePots(z){
  const par = $("parterre"); par.innerHTML = ""; potsEl = [];
  par.className = "parterre " + z.type;
  const cols = z.colonnes || 3; par.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`; par.style.gridTemplateRows = `repeat(${Math.ceil(z.nbPots/cols)},minmax(0,1fr))`;
  for(let i=0;i<z.nbPots;i++){
    const b = document.createElement("button"); b.className="pot"; b.addEventListener("click",()=>agir(i));
    par.appendChild(b); potsEl.push({b, cle:""});
  }
}
const svgPlante = (p, av) => { const st = Math.min(3, Math.floor(av*4)); return IMG ? im(`plante-${p.id}-${st+1}`, "plante") : `<svg viewBox="0 0 100 100" aria-hidden="true">${ART[p.art][st]}</svg>`; };
for(const k in PLANTES) PLANTES[k].id = k;
function majPot(i){
  const z = zoneDef(zoneJeu()), pot = etat.zones[z.id].pots[i], el = potsEl[i]; if(!el||!pot) return;
  let cle, html, cls="pot", label;
  if(!pot.ouvert){ cls+=" verrou"; cle="v"; html=`<span class="etiq">${z.verrou} ${z.prixPot[i]} 🪙</span>`; label=`Fermé, ${z.prixPot[i]} pièces d'or pour ouvrir`; }
  else if(!pot.plante){ cls+=" vide"; cle="e"; html=`<span class="etiq">${z.vide}</span>`; label="Libre"; }
  else {
    const p = PLANTES[pot.plante], av = Math.min(1,pot.age/p.duree), pct = av>=1 ? 100 : Math.min(99,Math.floor(av*100));
    const soif = besoin(p)==="rosee" && pot.eau<=0 && av<1;
    const attend = besoin(p)==="lumiere" && nuit() && av<1;
    const stade = Math.min(3,Math.floor(av*4));
    if(soif) cls+=" soif"; if(attend) cls+=" attend";
    cle = `${pot.plante}${stade}${soif?"s":""}${attend?"a":""}${av>=1?"p":""}${pct}`;
    if(pot.mystere && av<1){ cle = `m${stade}${soif?"s":""}${attend?"a":""}`;
      html = (IMG ? `<img class="plante" src="img/plante-mystere-${stade+1}.webp" alt="" draggable="false" onerror="this.outerHTML='<span class=&quot;mystere&quot;>${["🌰","🌱","🌿","🪴"][stade]}</span>'">` : `<span class="mystere">${["🌰","🌱","🌿","🪴"][stade]}</span>`) + (soif?`<span class="badge soif">💧 soif</span>`:attend?`<span class="badge attend">🌙 attend</span>`:"") + `<span class="etiq">Graine mystère · ?</span>`;
      label = `Graine mystère${soif?", a soif":""}`; }
    else html = svgPlante(p,av) + (av>=1?`<span class="badge pret">prêt</span>`:soif?`<span class="badge soif">💧 soif</span>`:attend?`<span class="badge attend">🌙 attend</span>`:"") + `<span class="etiq">${p.nom} · ${pct} %</span>`;
    if(!(pot.mystere && av<1)) label = `${p.nom}, ${pct} %${soif?", a soif":""}${attend?", attend le jour":""}${av>=1?", prêt à récolter":""}`;
  }
  if(cle!==el.cle){ el.cle=cle; el.b.className=cls; el.b.innerHTML=html; el.b.setAttribute("aria-label",label); }
}
function rendre(){
  $("lune").textContent = etat.lunes; $("or").textContent = etat.or;
  majPastille();
  $("rosee").textContent = etat.rosee; $("roseeMax").textContent = roseeMax(); const rb=document.querySelector("#barre .arrosoir small"); if(rb) rb.textContent = `${etat.rosee}/${roseeMax()}`;
  const z = zoneDef(ZONE);
  $("roseeStat").hidden = true;   // la rosée a son propre bouton, à gauche des graines
  const mats = Object.keys(MATIERES).filter(k=>(etat.matieres[k]||0)>0).map(k=>`<span title="${MATIERES[k].nom}">${IMG?im(`matiere-${k}`,"ico"):MATIERES[k].emoji} <b>${etat.matieres[k]}</b></span>`).join("");
  if(IMG && !$("lune").dataset.ico){ $("lune").dataset.ico="1"; document.querySelector(".ico-lune").innerHTML=im("matiere-lune","ico"); document.querySelector(".ico-rosee").innerHTML=im("matiere-rosee","ico"); }
  $("matieres").innerHTML = ""; void mats;   // les matières se voient à l'atelier ; l'en-tête garde l'or, les lunes et la rosée
  if(z){ for(let i=0;i<z.nbPots;i++) majPot(i); majSentier(); }
  else if(ZONE==="atelier" || ZONE==="cuisine") rendreAtelier();
  else if(ZONE==="courrier") rendreCourrier();
  else if(ZONE==="carnet"){ /* rendu à l'ouverture et au changement d'onglet */ }
  else rendreVillage();
}
function rendreTitre(){ if(ZONE==="village") $("titre").textContent = etat.pleineLune ? TEXTES.titrePleine : TEXTES.titre; document.title = TEXTES.titre; }
function rendreMeteo(){
  document.body.classList.toggle("pluie", PLUIE);
  document.body.classList.toggle("illustre", IMG);
  $("bandeau").hidden = true; $("luneBtn").classList.toggle("libre", !IMG);
  if(!IMG) document.body.appendChild($("luneBtn")); else { const c=$("carte"); if(c && $("luneBtn").parentNode!==c) c.appendChild($("luneBtn")); }
  document.body.dataset.phase = PHASE.phase; document.body.dataset.moment = PHASE.id; document.body.dataset.temps = TEMPSID; document.body.dataset.ciel = estSoleilLeve() ? "jour" : "nuit";
  const phrase = (etat.pleineLune && TEMPSID==="clair" && PHASE.phrasePleine) ? PHASE.phrasePleine : (PHASE.phrase[TEMPSID] || PHASE.phrase.clair);
  const fe = feteDef(); const pf = fe ? " " + ((PHASE.phase==="nuit"||PHASE.phase==="crepuscule") && fe.phraseNuit ? fe.phraseNuit : fe.phrase) : "";
  { const t = `${PHASE.nom}${TEMPSID==="clair"?"":", "+tempsDef().nom.toLowerCase()}. ${phrase}${pf}`; if($("meteo").textContent!==t) $("meteo").textContent = t; }
  $("luneBtn").setAttribute("aria-label", nuit() ? "La lune" : "Le soleil");
}

/* ---------- barre d'outils ---------- */
let outil = "radis";
function rendreBarre(){
  const bar = $("barre"); bar.innerHTML = "";
  const z = zoneDef(ZONE);
  // la rosée est un outil à part : un bouton rond à gauche ; les graines se rangent à côté
  let semis = bar;
  if(z && z.rosee){ semis = document.createElement("div"); semis.className="semis"; }
  const bouton = (html, pressed, cls, fn, ou=semis)=>{ const b=document.createElement("button"); if(cls) b.className=cls; b.setAttribute("aria-pressed", !!pressed); b.innerHTML=html; b.addEventListener("click",fn); ou.appendChild(b); return b; };
  if(z){
    if(z.rosee) bouton(`<span class="goutte">${IMG?im("matiere-rosee",""):"💧"}</span><small>${etat.rosee}/${roseeMax()}</small>`, outil==="eau", "arrosoir", ()=>{ outil="eau"; dire(`${etat.rosee} goutte${etat.rosee>1?"s":""} en réserve, une de plus toutes les ${duree(PLUIE?REGLES.regenRosee/2:REGLES.regenRosee)}. Une plante arrosée pousse à pleine vitesse ; sans eau, ${REGLES.ralentiSoif} fois moins vite. Touche une plante qui a soif.`); rendreBarre(); }, bar).setAttribute("aria-label", `Rosée, ${etat.rosee} sur ${roseeMax()}`);
    if(semis!==bar) bar.appendChild(semis);
    for(const k of z.graines){
      const p = PLANTES[k]; if(!p) continue; if(besoin(p)==="pluie" && !PLUIE && !fx().pluieToujours) continue;
      bouton(`${p.emoji} ${p.nom} <small>${p.prix?p.prix+" 🪙":"gratuit"}</small>`, outil===k, "", ()=>{ outil=k; dire(`${p.nom} : ${duree(p.duree)} de pousse, se vend ${p.valeur} or, plus en lettre.${besoin(p)==="pluie"?" Ne pousse que sous la pluie, et n'a jamais soif.":besoin(p)==="lumiere"?" Pousse à la lumière du jour seulement, sans jamais avoir soif.":` Une goutte de rosée lui donne ${duree(p.soif)} d'eau.`}`); rendreBarre(); });
    }
    if(etat.graines>0){
      const k = Object.keys(PLANTES).find(k=>PLANTES[k].graine && PLANTES[k].zone===z.id), p = k && PLANTES[k];
      if(p) bouton(`${p.emoji} ${p.nom} <small>×${etat.graines}</small>`, outil===k, "", ()=>{ outil=k; dire(`Graine rare. ${duree(p.duree)} de pousse, se vend ${p.valeur} or. Elle luit la nuit.`); rendreBarre(); });
    }
    if((etat.mysteres||0)>0 && z.id==="potager") bouton(`❔ Graine mystère <small>×${etat.mysteres}</small>`, outil==="mystere", "", ()=>{ outil="mystere"; dire("Une graine d'Odile. Personne ne sait ce qu'elle donnera, ni quand."); rendreBarre(); });
    const sep = document.createElement("div"); sep.className="sep"; bar.appendChild(sep);
  }
}

/* ---------- actions sur un pot ---------- */
function agir(i){
  const z = zoneDef(zoneJeu()), pot = etat.zones[z.id].pots[i];
  if(!pot.ouvert){
    const prix = (fx().potsGratuits[z.id]||[]).includes(i) ? 0 : z.prixPot[i];
    if(etat.or >= prix){ etat.or -= prix; pot.ouvert = true; dire(z.msgOuvrir); tinter(520); rendreNav(); }
    else dire(`Il te manque ${prix-etat.or} pièces d'or. Vends ou livre des récoltes depuis le comptoir.`);
  } else if(pot.plante){
    const p = PLANTES[pot.plante];
    if(pot.age >= p.duree){
      etat.recoltes++;
      const myst = !!pot.mystere; delete pot.mystere;
      const rare = myst || Math.random() < .04 + fx().rare;
      ajouter(rare ? pot.plante+"*" : pot.plante, 1);
      const hb = etat.herbier[pot.plante] = etat.herbier[pot.plante] || {n:0, rare:0}; hb.n++; if(rare){ hb.rare++; etat.rares=(etat.rares||0)+1; }
      let txt = myst ? `✦ La graine mystère a donné : ${p.rare}, une forme rare de ${p.nom.toLowerCase()}. Elle est dans le panier.` : rare ? `✦ Variante rare : ${p.rare} ! Une forme rare de ${p.nom.toLowerCase()}, qui vaut trois fois plus. Elle est dans le panier.` : `${p.nom} ${accord(p,"récolté","récoltée")}, dans le panier.`;
      if(p.matiere && Math.random()<p.matiere.proba){ etat.matieres[p.matiere.id]=(etat.matieres[p.matiere.id]||0)+1; txt += ` ${MATIERES[p.matiere.id].emoji} Une ${MATIERES[p.matiere.id].nom.toLowerCase()} dans la vase.`; }
      const evt = {type:"recolte", plante:pot.plante, pot:{...pot}, zone:z.id};
      pot.plante=null; pot.age=0; pot.sec=0;
      potsEl[i].b.classList.add("recolte"); setTimeout(()=>potsEl[i].b.classList.remove("recolte"),600);
      dire(txt); tinter(660); tinter(880,.12);
      evenement(evt);
    } else if(pot.mystere && outil!=="eau"){ dire("Elle pousse. Personne ne sait ce que ce sera, ni quand.");
    } else if(outil==="eau"){
      if(pot.mystere && besoin(p)==="rosee" && pot.eau<=0 && etat.rosee>0){ etat.rosee--; pot.eau = p.soif; dire(`La graine mystère boit. ${etat.rosee} goutte${etat.rosee>1?"s":""} en réserve.`); tinter(330); rendre(); }
      else if(pot.mystere) dire("La graine mystère n'a pas besoin d'eau pour l'instant.");
      else if(besoin(p)!=="rosee") dire(`${p.nom} ${besoin(p)==="pluie"?"ne boit que la pluie":"n'a besoin que de lumière"}.`);
      else if(pot.eau>0) dire(`${p.nom} n'a pas soif pour l'instant. Garde ta goutte.`);
      else if(etat.rosee<=0) dire(`Plus de rosée. Prochaine goutte dans ${duree((PLUIE?REGLES.regenRosee/2:REGLES.regenRosee)-etat.regen)}.`);
      else { etat.rosee--; pot.eau = p.soif; dire(`${p.nom} boit. ${etat.rosee} goutte${etat.rosee>1?"s":""} en réserve.`); tinter(330); rendre(); }
    } else dire(`${p.nom} pousse encore (${Math.min(99,Math.floor(100*pot.age/p.duree))} %), prêt${p.g==="f"?"e":""} dans ${p.duree-pot.age<60?"moins d’une minute":duree(p.duree-pot.age)}${besoin(p)==="lumiere"?" de jour":besoin(p)==="pluie"?" de pluie":""}.` + (besoin(p)==="rosee" && pot.eau<=0 ? ` Et ${accord(p,"il","elle")} a soif.` : besoin(p)==="lumiere" && nuit() ? ` ${accord(p,"Il","Elle")} attend le jour.` : ""));
  } else {
    if(outil==="eau"){ dire("Rien à arroser ici."); return; }
    if(outil==="mystere"){
      if(z.id!=="potager" || (etat.mysteres||0)<=0){ outil=z.graines[0]; rendreBarre(); return; }
      etat.mysteres--; const k = hasard(["radis","tulipe","lavande","citrouille","lunefleur"]), pm = PLANTES[k];
      pot.plante = k; pot.mystere = true; pot.age = 0; pot.eau = besoin(pm)==="rosee" ? pm.soif : 0; pot.sec = 0;
      dire("Graine mystère semée. Elle poussera à son rythme ; on verra bien ce qu'elle devient."); tinter(440); tinter(587,.15);
      if(etat.mysteres<=0) outil=z.graines[0];
      rendreBarre(); evenement(null); sauver(); rendre(); return;
    }
    const p = PLANTES[outil];
    if(!p || p.zone!==z.id || (besoin(p)==="pluie" && !PLUIE && !fx().pluieToujours)){ outil=z.graines[0]; rendreBarre(); dire("Choisis une graine dans la barre, puis touche une place libre."); return; }
    if(p.graine){ if(etat.graines<=0){ outil=z.graines[0]; rendreBarre(); return; } etat.graines--; }
    else if(etat.or < p.prix){ dire(`${p.nom} coûte ${p.prix} pièces d'or.`); return; }
    else etat.or -= p.prix;
    pot.plante = outil; pot.age = 0; pot.eau = besoin(p)==="rosee" ? p.soif : 0; pot.sec = 0;
    dire(`${p.nom} ${accord(p,"semé","semée")}. Prêt${p.g==="f"?"e":""} dans ${duree(p.duree)}${besoin(p)==="lumiere"?" de jour":""}.`); tinter(440);
    if(p.graine && etat.graines<=0) outil=z.graines[0];
    rendreBarre();
  }
  evenement(null); sauver(); rendre();
}

/* ---------- atelier : cuisine, améliorations, objets ---------- */
let cleAtelier = "";
function recetteConnue(r){ return !!(etat.recettes[r.id] || (r.fete && r.fete===feteActive())); }
// une recette apparaît quand sa condition de découverte est remplie (et reste visible ensuite)
function recetteDecouverte(r){ if(r.fete) return r.fete===feteActive(); if(!r.decouverte || etat.recettes[r.id] || etat.decouvertes[r.id]) return true; return false; }
function majDecouvertes(){
  const c = ctx(); let nouv = [];
  for(const r of RECETTES){ if(r.fete || !r.decouverte || etat.recettes[r.id] || etat.decouvertes[r.id]) continue;
    let ok=false; try{ ok=!!r.decouverte(c); }catch(e){} if(ok){ etat.decouvertes[r.id]=Date.now(); nouv.push(DENREES[r.id].nom.toLowerCase()); } }
  if(nouv.length){ annoncer(`Nouvelle recette à l'atelier : ${nouv.join(", ")}. Elle s'apprend avec des lunes.`); tinter(659); tinter(784,.12); cleAtelier=""; }
}
const feuxMax = () => 1 + fx().feux;
function majCuisson(){
  const now = Date.now(), finies = etat.cuissons.filter(x=>x.fin<=now); if(!finies.length) return;
  etat.cuissons = etat.cuissons.filter(x=>x.fin>now);
  for(const x of finies){ ajouter(x.id, 1); etat.cuisines=(etat.cuisines||0)+1; annoncer(`${DENREES[x.id].nom} : c'est cuit. Dans le panier.`); }
  tinter(587); tinter(784,.12); cleAtelier=""; evenement({type:"cuisine", id:finies[0].id}); sauver();
}
function rendreAtelier(){
  const a = $("atelier");
  const cle = JSON.stringify([etat.matieres, Object.keys(etat.objets), etat.panier, etat.recettes, etat.decouvertes, etat.amelio, etat.lunes, feteActive(), etat.cuissons, Math.floor(Date.now()/30000), ZONE]); if(cle===cleAtelier) return; cleAtelier = cle;
  const libres = feuxMax() - etat.cuissons.length;
  const feu = etat.cuissons.map(x=>{ const r=RECETTES.find(y=>y.id===x.id), p=Math.min(1, 1-(x.fin-Date.now())/(r.cuisson*1000)); return `<div class="cuisson">${ico(x.id,"big")}<div><b>${DENREES[x.id].nom}</b><div class="barreProg"><i style="width:${Math.round(p*100)}%"></i></div><small>Prêt dans ${duree(Math.max(1,(x.fin-Date.now())/1000))}</small></div></div>`; }).join("")
    + Array.from({length:Math.max(0,libres)}, ()=>`<div class="cuisson libre"><span class="big">🔥</span><div><b>Feu libre</b><small>Choisis un plat ci-dessous pour le mettre à cuire.</small></div></div>`).join("");
  const decouvertes = RECETTES.filter(recetteDecouverte), cachees = RECETTES.filter(r=>!r.fete && !recetteDecouverte(r));
  const cuisine = decouvertes.map(r=>{
    const d = DENREES[r.id], connue = recetteConnue(r), peut = connue && aTout(r.ingr) && libres>0;
    const action = connue ? `<button data-cuire="${r.id}" ${peut?"":"disabled"}>${libres>0?"Cuisiner":feuxMax()>1?"Les feux sont pris":"Le feu est pris"}</button>` : `<button class="lune" data-apprendre="${r.id}" ${etat.lunes>=r.prix?"":"disabled"}>Apprendre · ${r.prix} 🌙</button>`;
    return `<div class="objet ${connue?"":"inconnue"}">${ico(r.id,"big")}<div><b>${d.nom}${r.fete?` <em class="saison">de saison</em>`:""}</b><small>${r.texte}</small><small class="cout">${listeEmoji(r.ingr)} · ${duree(r.cuisson)} de cuisson · se vend ${d.valeur} 🪙${(etat.panier[r.id]||0)?` · ${etat.panier[r.id]} au panier`:""}</small></div>${action}</div>`;
  }).join("") + cachees.map(r=>`<div class="objet cachee"><span class="big">❔</span><div><b>Recette inconnue</b><small>${r.indice||"Elle viendra."}</small></div></div>`).join("");
  const amel = AMELIORATIONS.map(x=>{
    const n = etat.amelio[x.id]||0, max = x.niveaux.length, prix = x.niveaux[n];
    return `<div class="objet ${n>=max?"fait":""}"><span class="big">${x.emoji}</span><div><b>${x.nom} <em class="niv">${n}/${max}</em></b><small>${x.texte}</small></div>${n>=max?"":`<button class="lune" data-ameliorer="${x.id}" ${etat.lunes>=prix?"":"disabled"}>Niveau ${n+1} · ${prix} 🌙</button>`}</div>`;
  }).join("");
  const mats = Object.keys(MATIERES).filter(k=>!MATIERES[k].chantier && !MATIERES[k].outil).map(k=>`<div class="matiere"><span class="big">${IMG?im(`matiere-${k}`,"big"):MATIERES[k].emoji}</span><div><b>${MATIERES[k].nom} · ${etat.matieres[k]||0}</b><small>${MATIERES[k].texte}</small></div></div>`).join("");
  const objs = OBJETS.map(o=>{
    const fait = !!etat.objets[o.id];
    const cout = Object.keys(o.cout).map(k=>`${MATIERES[k].emoji} ${o.cout[k]}`).join(" + ");
    const peut = !fait && Object.keys(o.cout).every(k=>(etat.matieres[k]||0)>=o.cout[k]);
    return `<div class="objet ${fait?"fait":""}"><span class="big">${IMG?im(`objet-${o.id}`,"big"):o.emoji}</span><div><b>${o.nom}</b><small>${o.texte}</small><small class="cout">${fait?"Fabriqué. Il est là pour de bon.":"Coût : "+cout}</small></div>${fait?"":`<button data-objet="${o.id}" ${peut?"":"disabled"}>Fabriquer</button>`}</div>`;
  }).join("");
  const nbConnues = RECETTES.filter(r=>!r.fete && etat.recettes[r.id]).length, nbTot = RECETTES.filter(r=>!r.fete).length;
  // deux écrans : la cuisine (feux et recettes) et l'atelier (améliorations et objets)
  if(ZONE==="cuisine") a.innerHTML = `<p class="intro">La cuisine transforme les récoltes. Un plat cuit en temps réel et se vend bien plus cher que ses ingrédients.</p>
    <h3>🔥 ${feuxMax()>1?"Les feux":"Le feu"} <small>${libres>0?`${libres} libre${libres>1?"s":""} sur ${feuxMax()}`:feuxMax()>1?"tous pris":"pris"}</small></h3>${feu}
    <h3>📜 Recettes <small>${nbConnues}/${nbTot} connues</small></h3><p class="intro">Une recette se découvre (l'histoire, les habitants, l'herbier, les bâtiments), puis s'apprend avec des lunes. Un plat cuit en temps réel et se vend bien plus cher que ses ingrédients.</p><div class="objets">${cuisine}</div>
`;
  else a.innerHTML = `<p class="intro">Les améliorations se paient en lunes, et ce que les visiteurs laissent devient des objets.</p>
    <h3>✨ Améliorations</h3><p class="intro">Elles se paient en lunes, celles que donnent les visiteurs et les habitants.</p><div class="objets">${amel}</div>
    <h3>🪚 Objets</h3><div class="matieres">${mats}</div><div class="objets">${objs}</div>`;
  a.querySelectorAll("[data-objet]").forEach(b=>b.addEventListener("click",()=>fabriquer(b.dataset.objet)));
  a.querySelectorAll("[data-cuire]").forEach(b=>b.addEventListener("click",()=>cuisiner(b.dataset.cuire)));
  a.querySelectorAll("[data-apprendre]").forEach(b=>b.addEventListener("click",()=>apprendre(b.dataset.apprendre)));
  a.querySelectorAll("[data-ameliorer]").forEach(b=>b.addEventListener("click",()=>ameliorer(b.dataset.ameliorer)));
}
function cuisiner(id){
  const r = RECETTES.find(x=>x.id===id); if(!r || !recetteConnue(r) || !aTout(r.ingr) || etat.cuissons.length>=feuxMax()) return;
  for(const k in r.ingr) retirer(k, r.ingr[k]);
  etat.cuissons.push({id, fin: Date.now() + r.cuisson*1000}); audio.effet("mijote");
  dire(`${DENREES[id].nom} : sur le feu. Prêt dans ${duree(r.cuisson)}.`); tinter(523); tinter(659,.1);
  evenement({type:"feu", id}); sauver(); rendre();
}
function apprendre(id){
  const r = RECETTES.find(x=>x.id===id); if(!r || etat.recettes[id] || etat.lunes<r.prix || !recetteDecouverte(r)) return;
  etat.lunes -= r.prix; etat.recettes[id]=1;
  dire(`Recette apprise : ${DENREES[id].nom.toLowerCase()}.`); tinter(587); tinter(784,.12);
  evenement({type:"recette", id}); sauver(); rendre();
}
function ameliorer(id){
  const x = AMELIORATIONS.find(a=>a.id===id), n = etat.amelio[id]||0; if(!x || n>=x.niveaux.length || etat.lunes<x.niveaux[n]) return;
  etat.lunes -= x.niveaux[n]; etat.amelio[id]=n+1;
  dire(`${x.nom} : niveau ${n+1}.`); tinter(587); tinter(880,.12);
  evenement({type:"amelioration", id}); sauver(); rendre(); rendreBarre();
}
function fabriquer(id){
  const o = OBJETS.find(x=>x.id===id); if(!o || etat.objets[id]) return;
  if(!Object.keys(o.cout).every(k=>(etat.matieres[k]||0)>=o.cout[k])) return;
  for(const k in o.cout) etat.matieres[k]-=o.cout[k];
  etat.objets[id]=Date.now();
  dire(`${o.nom} : ${o.texte}`); tinter(523); tinter(659,.1); tinter(784,.2);
  evenement({type:"objet", id}); sauver(); rendre(); rendreBarre();
}

/* ---------- courrier : lettres de Saint-Aubin, visites, chapitres, panier, colporteur ---------- */
let cleCourrier = "", collecte = null;
function annoncer(t){ if(collecte) collecte.push(t); else dire(t); }
const jourDe = d => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
const pnjDe = id => VILLE.find(p=>p.id===id);
const ac = (p, m, f, pl) => p.g==="pl" ? pl : p.g==="f" ? f : m;   // accord selon la personne
function pnjDispo(){ const c=ctx(); return VILLE.filter(p=>{ try{ return p.des(c); }catch(e){ return false; } }); }
const hasard = t => t[Math.floor(Math.random()*t.length)];
function nouvelleLettre(pnj, enPersonne){
  let pool = pnj.envies.filter(([id])=>obtenable(id));
  if(enPersonne){ const dans = pool.filter(([id])=>qte(id)>0); pool = dans.length ? dans : pool.filter(([id])=>PLANTES[id] && PLANTES[id].duree<=2400); }
  if(!pool.length) pool = [["radis",3,5]];
  // ne pas redemander ce que cette personne a demandé récemment, s'il y a autre chose
  if(!enPersonne){ const deja = new Set((etat.ville.recentes||[]).filter(r=>r.pnj===pnj.id).flatMap(r=>r.k)); const neuf = pool.filter(([id])=>!deja.has(id)); if(neuf.length) pool = neuf; }
  const items = {}, copie = [...pool], n = !enPersonne && copie.length>1 && Math.random()<.35 ? 2 : 1;
  for(let i=0;i<n;i++){ const [id,a,b] = copie.splice(Math.floor(Math.random()*copie.length),1)[0];
    items[id] = enPersonne ? Math.max(1, Math.min(a, qte(id)||a)) : a+Math.floor(Math.random()*(b-a+1)); }
  const val = Object.keys(items).reduce((t,k)=>t+defObjet(k).valeur*items[k],0);
  const long = Object.keys(items).some(k=>{ const p=PLANTES[k]; const r=RECETTES.find(x=>x.id===k); return (p && p.duree>=18000) || (r && Object.keys(r.ingr).some(i=>PLANTES[i] && PLANTES[i].duree>=18000)); });
  const heures = enPersonne ? 4 : (long ? 72 : 48) + fx().dureeLettres;
  if(!enPersonne){ const v=etat.ville; v.recentes = [...(v.recentes||[]), {pnj:pnj.id, k:Object.keys(items)}].slice(-10); }
  return {id:++etat.ville.nid, pnj:pnj.id, items, or:Math.ceil(val*(enPersonne?2:1.5)+4), lunes:Math.random()<.3?2:0,
    fin:Date.now()+heures*3600000, raison:hasard(pnj.raisons), parole:enPersonne?hasard(pnj.paroles):"", enPersonne:!!enPersonne};
}
function choisirPnj(dispo, exclus=[]){
  let ok = dispo.filter(p=>p.envies.some(([id])=>obtenable(id))); if(!ok.length) return pnjDe("margot");
  // éviter ceux qui viennent d'écrire (cette tournée, puis les dernières lettres), tant qu'il reste quelqu'un d'autre
  const recents = (etat.ville.recentes||[]).slice(-3).map(r=>r.pnj);
  for(const sauf of [exclus, recents]){ const reste = ok.filter(p=>!sauf.includes(p.id)); if(reste.length) ok = reste; }
  const f = ok.find(p=>p.id==="enfants"); const autres = ok.filter(p=>p.id!=="enfants");
  return f && (Math.random()<.25 || !autres.length) ? f : hasard(autres); }
function appliquerDon(don){
  const t=[];
  if(don.or){ gagnerOr(don.or); t.push(`+${don.or} 🪙`); }
  if(don.lunes){ gagnerLunes(don.lunes); t.push(`+${don.lunes} 🌙`); }
  if(don.recette){ etat.recettes[don.recette]=1; t.push(`recette : ${DENREES[don.recette].nom.toLowerCase()}`); }
  if(don.graines){ etat.graines+=don.graines; t.push(`${don.graines} graine${don.graines>1?"s":""} de fleur de lune (barre du potager)`); }
  if(don.mysteres){ etat.mysteres=(etat.mysteres||0)+don.mysteres; t.push(`${don.mysteres} graine${don.mysteres>1?"s":""} mystère${don.mysteres>1?"s":""} (barre du potager)`); }
  for(const k in (don.matieres||{})){ ajouter(k, don.matieres[k]); t.push(`${MATIERES[k].emoji} +${don.matieres[k]}`); }
  return t.join(", ");
}
function majCourrier(dt=1){
  const d = new Date(), j = jourDe(d), v = etat.ville, now = Date.now();
  // lettres et visites échues : elles s'en vont sans rancune
  v.lettres = v.lettres.filter(l=>{ if(now<l.fin) return true; const p=pnjDe(l.pnj); if(p) annoncer(l.enPersonne ? `${p.nom} ${ac(p,"est redescendu","est redescendue","sont redescendus")} à Saint-Aubin. Ce sera pour une autre fois.` : `La lettre de ${p.nom} a expiré. Rien de grave : ${p.nom} ${ac(p,"a","a","ont")} trouvé ailleurs.`); cleVillage=""; return false; });
  // le fil : un chapitre à la fois, dans l'ordre
  const suivant = CHAPITRES.find(ch=>!v.chapitres[ch.id]);
  if(suivant){ let ok=false; try{ ok=!!suivant.cond(ctx()); }catch(e){}
    if(ok){ v.chapitres[suivant.id]=now; const g=appliquerDon(suivant.don||{}); annoncer(`Une lettre de ${suivant.de} : « ${suivant.titre} ». Elle t'attend au comptoir.${g?" Avec elle : "+g+".":""}`); tinter(659); tinter(880,.15); audio.effet("papier"); } }
  // la fête : annoncée une fois par an
  const fe = feteDef(d); if(fe){ const k=fe.id+d.getFullYear(); if(!etat.feteVue[k]){ etat.feteVue[k]=1; annoncer(fe.annonce); } }
  // Anselme passe le matin, dès 8 h (ou tout de suite la première fois)
  if(v.facteurJour!==j && (d.getHours()>=8 || !v.facteurJour)){
    v.facteurJour = j;
    const dispo = pnjDispo(), place = 7 - v.lettres.filter(l=>!l.enPersonne).length, nb = Math.max(0, Math.min(3+fx().lettres, place)), qui = [];
    for(let i=0;i<nb;i++){ const p = choisirPnj(dispo, qui); qui.push(p.id); v.lettres.push(nouvelleLettre(p, false)); }
    if(nb) annoncer(`Anselme est passé : ${nb} lettre${nb>1?"s":""} de Saint-Aubin.`);
    v.matin3 = j;
  }
  // tournée du matin passée avant la mise à jour (deux lettres) : une troisième, une seule fois
  if(v.facteurJour===j && v.matin3!==j){ v.matin3 = j; const ce = v.lettres.filter(l=>!l.enPersonne).map(l=>l.pnj);
    if(ce.length<7){ v.lettres.push(nouvelleLettre(choisirPnj(pnjDispo(), ce), false)); annoncer(`Anselme avait oublié une lettre dans sa sacoche.`); } }
  // deuxième tournée l'après-midi, dès 15 h : une lettre de plus
  if(v.facteurJour===j && v.facteurSoir!==j && d.getHours()>=15){
    v.facteurSoir = j; const place = 7 - v.lettres.filter(l=>!l.enPersonne).length;
    if(place>0){ const ce = v.lettres.filter(l=>!l.enPersonne).map(l=>l.pnj); v.lettres.push(nouvelleLettre(choisirPnj(pnjDispo(), ce), false)); annoncer(`Anselme repasse en fin de journée : une lettre de plus.`); }
  }
  // une visite en personne, au plus une par jour, entre 10 h et 18 h
  if(v.visiteJour!==j && d.getHours()>=10 && d.getHours()<18 && !v.lettres.some(l=>l.enPersonne) && Math.random() < Math.min(dt,2)/7200){
    v.visiteJour = j; const p = choisirPnj(pnjDispo()), l = nouvelleLettre(p, true); v.lettres.push(l); cleVillage="";
    annoncer(`${p.nom} ${ac(p,"est monté","est montée","sont montés")} jusqu'à la clairière. ${ac(p,"Il attend","Elle attend","Ils attendent")} près du sentier, sur la carte.`); tinter(494); tinter(659,.15);
  }
}
function livrer(id){
  const v = etat.ville, l = v.lettres.find(x=>x.id===id); if(!l || !aTout(l.items)) return;
  for(const k in l.items) retirer(k, l.items[k]);
  gagnerOr(l.or); if(l.lunes) gagnerLunes(l.lunes);
  v.livrees++; v.lettres = v.lettres.filter(x=>x!==l); cleVillage="";
  const p = pnjDe(l.pnj);
  dire(`${p.nom} ${l.enPersonne?ac(p,"repart content","repart contente","repartent contents"):ac(p,"sera content","sera contente","seront contents")}. +${l.or} 🪙${l.lunes?` et +${l.lunes} 🌙`:""}.`); tinter(659); tinter(784,.1); tinter(988,.2);
  evenement({type:"livraison", pnj:l.pnj}); majCourrier(0); sauver(); rendre();
}
function vendre(id, n){
  n = Math.min(n, etat.panier[id]||0); if(n<=0) return;
  const val = defObjet(id).valeur*n; etat.panier[id]-=n; if(!etat.panier[id]) delete etat.panier[id];
  gagnerOr(val); dire(`Le colporteur prend ${n} ${plur(defObjet(id).nom, n)}. +${val} 🪙.`); tinter(523);
  evenement({type:"vente", id}); sauver(); rendre();
}
const resteTxt = ms => { const h=Math.max(0,ms)/3600000; return h>=24 ? `${Math.floor(h/24)} j ${Math.floor(h%24)} h` : h>=1 ? `${Math.floor(h)} h ${String(Math.floor(h*60%60)).padStart(2,"0")}` : `${Math.max(1,Math.floor(h*60))} min`; };
function carteLettre(l){
  const p = pnjDe(l.pnj), ok = aTout(l.items);
  return `<div class="lettre ${l.enPersonne?"personne":""} ${ok?"prete":""}"><div class="tete">${portrait(p,true)}<div><b>${p.nom}</b><small>${p.metier}${l.enPersonne?" · sur place":""}</small></div><span class="delai">${l.enPersonne?"repart":"reste"} ${resteTxt(l.fin-Date.now())}</span></div>
    ${l.parole?`<p class="parole">« ${l.parole} »</p>`:""}<p>Je voudrais ${listeObjets(l.items)}. ${l.raison}</p>
    <div class="pied"><small>${listeEmoji(l.items)}</small><small class="gain">+${l.or} 🪙${l.lunes?` +${l.lunes} 🌙`:""}</small><button data-livrer="${l.id}" ${ok?"":"disabled"}>${l.enPersonne?"Donner":"Livrer"}</button></div></div>`;
}
function rendreCourrier(){
  const a = $("courrier"), v = etat.ville;
  if(v.lettres.some(l=>!l.vue)){ v.lettres.forEach(l=>l.vue=true); sauver(); }
  const cle = JSON.stringify([sousComptoir, etat.postes, etat.etals, etat.graines, etat.fidele, etat.refusAbo, Math.floor(Date.now()/60000), new Date().getDay(), v.lettres.map(l=>l.id), etat.panier, etat.matieres, Object.keys(v.chapitres), v.lus, Math.floor(Date.now()/60000), sousComptoir==="marche" ? MARCHE.version : 0, etat.or]); if(cle===cleCourrier) return; cleCourrier = cle;
  const nonLus = CHAPITRES.filter(ch=>v.chapitres[ch.id] && !v.lus[ch.id]);
  const visites = v.lettres.filter(l=>l.enPersonne), lettres = v.lettres.filter(l=>!l.enPersonne);
  const demandes = {}; v.lettres.forEach(l=>Object.keys(l.items).forEach(k=>demandes[k]=1));
  const cles = Object.keys(etat.panier).filter(k=>etat.panier[k]>0).sort((x,y)=>defObjet(y).valeur-defObjet(x).valeur);
  const panier = cles.length ? cles.map(k=>{ const d=defObjet(k), n=etat.panier[k];
    return `<div class="article ${d.rare?"rare":""}" data-info="${k}">${ico(k,"big")}<div><b>${d.nom} ×${n}</b><small>${d.valeur} 🪙 pièce${demandes[base(k)]?" · <em>demandé</em>":""}${d.rare?" · variante rare":""}</small></div><button data-vendre="${k}" data-n="1">Vendre 1</button>${n>1?`<button data-vendre="${k}" data-n="${n}">Tout · ${d.valeur*n}</button>`:""}</div>`; }).join("")
    : `<p class="intro">Vide. Ce que tu récoltes et ce que tu cuisines arrive ici.</p>`;
  const auj = jourDe(new Date()), prochain = v.facteurJour!==auj ? "ce matin, dès 8 h" : v.facteurSoir!==auj ? "vers 15 h" : "demain matin";
  const nPret = lettres.filter(l=>aTout(l.items)).length + visites.length + nonLus.length;
  const onglets = `<div class="onglets sous" role="tablist">${[["courrier",`✉️ Courrier${nPret?` <i class="mini">${nPret}</i>`:""}`],["panier",`🧺 Panier <small>${cles.reduce((t,k)=>t+etat.panier[k],0)}</small>`],["marche",`🏪 Marché`], ...(AMIS && RESEAU.actif ? [["amis",`💌 Amis${MARCHE.nouveau?` <i class="mini">!</i>`:""}`]] : [])].map(([id,t])=>`<button role="tab" data-sous="${id}" aria-selected="${sousComptoir===id}">${t}</button>`).join("")}</div>`;
  if(sousComptoir==="amis"){ a.innerHTML = onglets + rendreAmis(); brancherMarche(a); a.querySelectorAll("[data-sous]").forEach(b=>b.addEventListener("click",()=>{ sousComptoir=b.dataset.sous; cleCourrier=""; rendreCourrier(); if(sousComptoir!=="courrier"&&sousComptoir!=="panier") chargerMarche(); })); return; }
  if(sousComptoir==="marche"){ const [haut, bas] = rendreMarche().split("<!--BAS-->"); a.innerHTML = onglets + haut + rendreEtals() + bas; a.querySelectorAll("details.repli").forEach((d,i)=>{ if(i===0) d.addEventListener("toggle",()=>{ MARCHE.ouvert = d.open; }); }); brancherEtals(a); brancherMarche(a); a.querySelectorAll("[data-sous]").forEach(b=>b.addEventListener("click",()=>{ sousComptoir=b.dataset.sous; cleCourrier=""; rendreCourrier(); })); return; }
  const chantier = Object.keys(MATIERES).filter(k=>(MATIERES[k].chantier||MATIERES[k].outil) && (etat.matieres[k]||0)>0);
  if(sousComptoir==="panier"){ a.innerHTML = onglets + `<p class="intro">Le colporteur achète tout, au prix de base. Les lettres paient une fois et demie, les visites le double. Touche un objet pour sa fiche.</p><div class="panier">${panier}</div>` +
    (chantier.length ? `<h3>Pour bâtir</h3><div class="materiaux">${chantier.map(k=>`<span class="mat">${MATIERES[k].emoji} ${MATIERES[k].nom}${MATIERES[k].outil?"":` ×${etat.matieres[k]}`}</span>`).join("")}</div>` : "");
  } else a.innerHTML = onglets + `<p class="intro">${TEXTES.courrierIntro}</p>` +
    nonLus.map(ch=>`<button class="chapitre" data-lire="${ch.id}"><span class="big">📜</span><span><b>${ch.titre}</b><small>De ${ch.de}. Toucher pour lire.</small></span></button>`).join("") +
    (visites.length ? `<h3>Sur place</h3>${visites.map(carteLettre).join("")}` : "") +
    `<h3>Lettres <small>${lettres.length}</small></h3>` + (lettres.length ? lettres.map(carteLettre).join("") : `<p class="intro">Pas de lettre en attente. Anselme repasse ${prochain}.</p>`) +
    `<p class="intro fin">${v.livrees} lettre${v.livrees>1?"s":""} livrée${v.livrees>1?"s":""}. Le fil de l'histoire se relit dans le carnet.</p>`;
  a.querySelectorAll("[data-livrer]").forEach(b=>b.addEventListener("click",()=>livrer(+b.dataset.livrer)));
  a.querySelectorAll("[data-vendre]").forEach(b=>b.addEventListener("click",e=>{ e.stopPropagation(); vendre(b.dataset.vendre, +b.dataset.n); }));
  a.querySelectorAll("[data-info]").forEach(x=>x.addEventListener("click",()=>infoObjet(x.dataset.info)));
  a.querySelectorAll("[data-lire]").forEach(b=>b.addEventListener("click",()=>lireChapitre(b.dataset.lire)));
  a.querySelectorAll("[data-sous]").forEach(b=>b.addEventListener("click",()=>{ sousComptoir=b.dataset.sous; cleCourrier=""; $("contenu").scrollTop=0; rendreCourrier(); if(sousComptoir==="marche" || sousComptoir==="amis") chargerMarche(); }));
}

/* ---------- marché public et amis (en ligne, via reseau.js) ----------
   Mettre en vente retire l'objet du panier tout de suite (il est « au marché ») ; retirer l'annonce le rend.
   L'acheteur paie à l'achat ; le vendeur encaisse quand son jeu voit la vente. Les cadeaux ne vont qu'aux amis.
*/
let sousComptoir = "courrier";

/* ---------- étals des gens de Saint-Aubin : matériaux et outils, abonnements de livraison ---------- */
const hachage = t => { let h=2166136261; for(const ch of t){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619)>>>0; } return h; };
const nomArticle = id => id==="graine" ? "Graine de fleur de lune" : id==="mystere" ? "Graine mystère" : MATIERES[id] ? MATIERES[id].nom : defObjet(id).nom;
const emojiArticle = id => id==="graine" ? "🌼" : id==="mystere" ? "❔" : MATIERES[id] ? MATIERES[id].emoji : defObjet(id).emoji;
const possede = id => id==="graine" ? etat.graines : id==="mystere" ? (etat.mysteres||0) : qte(id);
/* Mathilde, la maraîchère : produits du potager et de la mare (jamais la fleur de lune ni les variantes rares).
   Chaque jour de marché, cinq produits tirés au sort, plus ceux que la ville ou un habitant te demande et que tu n'as pas.
   Prix : 1,6 fois ce que le colporteur en donne (on ne gagne rien à revendre). Stock : beaucoup de petits, peu de gros. */
const MARAICHAGE = ["radis","tulipe","lavande","citrouille","champignon","nenuphar","roseau","iris","lotus"];
function demandesManquantes(){
  const voulu = {};
  etat.ville.lettres.forEach(l=>Object.entries(l.items).forEach(([k,n])=>voulu[k]=Math.max(voulu[k]||0,n)));
  HABITANTS.forEach(h=>{ const d=demandeActive(h); if(d && d.offrir) Object.entries(d.offrir).forEach(([k,n])=>voulu[k]=Math.max(voulu[k]||0,n)); });
  return MARAICHAGE.filter(k=>voulu[k] && qte(k)<voulu[k]);
}
function vendDe(e){
  if(!e.maraichere) return e.vend;
  const j = jourDe(new Date()), tri = MARAICHAGE.slice().sort((x,y)=>hachage(j+x)-hachage(j+y));
  const achetes = Object.keys(etat.etals[e.id+":"+periodeStock(e)]||{}).filter(k=>PLANTES[k]);   // ce qu'on lui a déjà pris aujourd'hui reste affiché
  const ids = [...new Set([...demandesManquantes(), ...tri.slice(0,5), ...achetes])].sort((x,y)=>PLANTES[x].valeur-PLANTES[y].valeur);
  return ids.map(k=>{ const v=PLANTES[k].valeur; return [k, Math.round(v*1.6), v<=5?6:v<=15?4:v<=36?3:v<=100?2:1]; });
}
function prixDuJour(id, base){ const j=jourDe(new Date()); return Math.max(1, Math.round(base * (.85 + .3*(hachage(j+id)%1000)/1000))); }
const periodeStock = (etal) => etal.id==="rose" ? "s"+Math.floor((Date.now()/86400000 + 3)/7) : jourDe(new Date());   // Rose ne réassortit qu'une fois par semaine
function resteEtal(etal, id, stock){ if(stock==null) return Infinity; const k = etal.id+":"+periodeStock(etal); return stock - ((etat.etals[k]||{})[id]||0); }
function acheterEtal(etalId, id){
  const etal = ETALS.find(e=>e.id===etalId), art = etal && vendDe(etal).find(v=>v[0]===id); if(!art) return;
  if(!present(etal)){ dire(`${etal.nom} n'est pas au marché en ce moment.`); return; }
  const lunes = etal.monnaie==="lunes", unite = lunes ? "🌙" : "🪙", bourse = () => lunes ? etat.lunes : etat.or;
  const [ , base, stock, max] = art, prix = prixDuJour(id, base);
  if(max && possede(id)>=max){ dire(`Tu as déjà ${MATIERES[id].g==="f"?"une":"un"} ${nomArticle(id).toLowerCase()}.`); return; }
  if(resteEtal(etal,id,stock)<=0){ dire(`${etal.nom} n'en a plus aujourd'hui.`); return; }
  if(bourse()<prix){ dire(`Il te manque ${prix-bourse()} ${unite}.`); return; }
  if(lunes) etat.lunes -= prix; else etat.or -= prix;
  if(id==="graine") etat.graines++; else if(id==="mystere") etat.mysteres=(etat.mysteres||0)+1; else ajouter(id, 1); compterFidelite(etal);
  const k = etal.id+":"+periodeStock(etal); etat.etals[k] = etat.etals[k]||{}; etat.etals[k][id] = (etat.etals[k][id]||0)+1;
  for(const cle in etat.etals){ const [eid, per] = cle.split(":"), e2 = ETALS.find(x=>x.id===eid); if(!e2 || per!==periodeStock(e2)) delete etat.etals[cle]; }
  dire(MATIERES[id]||id==="graine"||id==="mystere" ? `${etal.nom} te vend ${(MATIERES[id]&&MATIERES[id].g==="f")||id==="graine"||id==="mystere"?"une":"un"} ${nomArticle(id).toLowerCase()}. −${prix} ${unite}.` : `${etal.nom} te vend : ${nomArticle(id)}, dans ton panier. −${prix} ${unite}.`); tinter(523); tinter(659,.1);
  sauver(); cleCourrier=""; rendre();
}
const JOURS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
// le marché tient de 7 h à 19 h ; l'étranger capuché, lui, n'est là que de minuit à 4 h
const OUVRE = 7, FERME = 19;
const present = e => { const d = new Date(), h = d.getHours(); return e.nuit ? h < 4 : e.jours.includes(d.getDay()) && h >= OUVRE && h < FERME; };
function absenceTxt(e){ const d = new Date(), h = d.getHours(), ceJour = e.jours.includes(d.getDay());
  if(ceJour && h < OUVRE) return `Pas encore arrivé${elle(e)?"e":""}. Le marché ouvre à ${OUVRE} h.`;
  if(ceJour && h >= FERME) return `Déjà rentré${elle(e)?"e":""}. Le marché ferme à ${FERME} h ; revient ${joursTxt(e)}.`;
  return `Pas là aujourd'hui. Revient ${joursTxt(e)}.`; }
const joursTxt = e => { if(e.nuit) return "de minuit à 4 h"; const n=e.jours.map(j=>"le "+JOURS[j]); return n.length>1 ? n.slice(0,-1).join(", ")+" et "+n[n.length-1] : n[0]; };
const elle = e => e.nom.startsWith("Mme") || e.nom==="Rose" || e.nom==="Mathilde";
// fidélité : chaque article acheté compte ; au seuil, le marchand propose d'envoyer un apprenti
function fidelite(e){ return (etat.fidele||{})[e.id]||0; }
function compterFidelite(e){
  etat.fidele = etat.fidele||{}; etat.fidele[e.id] = (etat.fidele[e.id]||0)+1;
  if(e.apprenti && etat.fidele[e.id]===e.fidelite) setTimeout(()=>{ dire(`${e.nom} : « ${e.apprenti.proposition} » Sa proposition t'attend à son étal.`); tinter(587); tinter(784,.12); }, 1600);
}
const posteDe = eid => (etat.postes||{})[eid];
const parHeure = (n, o) => `${String(n).replace(".",",")} ${plur(MATIERES[o].nom, n>=2?2:1)} par heure`;
function installerApprenti(eid){
  const e = ETALS.find(x=>x.id===eid), ap = e.apprenti, n0 = ap.niveaux[0]; if(posteDe(eid)) return;
  if(etat.or < n0.prix){ dire(`Il te manque ${n0.prix-etat.or} 🪙 pour l'installer.`); return; }
  etat.or -= n0.prix; etat.postes = etat.postes||{}; etat.postes[eid] = {niveau:0, acc:0, depuis:Date.now()};
  dire(`${ap.qui} s'installe : ${ap.nom.toLowerCase()} est ouvert${ap.nom.startsWith("La")?"e":""}. ${ap.texte}`); tinter(523); tinter(659,.12); tinter(784,.24);
  sauver(); cleCourrier=""; rendre();
}
function ameliorerPoste(eid){
  const e = ETALS.find(x=>x.id===eid), ap = e.apprenti, p = posteDe(eid), suiv = p && ap.niveaux[p.niveau+1]; if(!suiv) return;
  if(etat.or < suiv.prix){ dire(`Il te manque ${suiv.prix-etat.or} 🪙.`); return; }
  etat.or -= suiv.prix; p.niveau++; dire(`${ap.nom} : niveau ${p.niveau+1}. ${parHeure(suiv.par, ap.objet)}, réserve de ${suiv.reserve}.`); tinter(587); tinter(880,.12);
  sauver(); cleCourrier=""; rendre();
}
function refuserApprenti(eid){ const e=ETALS.find(x=>x.id===eid); etat.refusAbo = etat.refusAbo||{}; etat.refusAbo[eid]=true; dire(`${e.nom} : « Si tu changes d'avis, tu sais où me trouver. »`); sauver(); cleCourrier=""; rendre(); }
// production des apprentis, appelée avec le temps qui passe (même pendant l'absence) : rien ne se perd, ils se reposent quand la réserve est pleine
function produire(dt){
  for(const eid in (etat.postes||{})){
    const e = ETALS.find(x=>x.id===eid); if(!e || !e.apprenti) continue;
    const p = etat.postes[eid], n = e.apprenti.niveaux[p.niveau], o = e.apprenti.objet, stock = etat.matieres[o]||0;
    if(stock >= n.reserve){ p.acc = 0; continue; }
    p.acc += n.par*dt/3600; const k = Math.min(Math.floor(p.acc), n.reserve - stock);
    if(k>0){ ajouter(o, k); p.acc -= k; p.total = (p.total||0)+k; }
  }
}
function ouvrirPoste(eid){
  const e = ETALS.find(x=>x.id===eid), ap = e.apprenti, p = posteDe(eid); if(!p) return;
  const n = ap.niveaux[p.niveau], suiv = ap.niveaux[p.niveau+1], o = ap.objet, stock = etat.matieres[o]||0;
  const c = ouvrirPanneau(`<h2>${ap.emoji} ${ap.nom}</h2><div class="corps">${IMG?`<div class="pied-visite"><img src="img/poste-${eid}.webp" alt="" onerror="this.parentNode.remove()"></div>`:""}<p class="intro">${ap.texte}</p>
    <div class="regle"><b>${ap.qui}</b><small>Niveau ${p.niveau+1} sur ${ap.niveaux.length} : ${parHeure(n.par, o)}, jusqu'à ${n.reserve} en réserve. ${MATIERES[o].emoji} ${stock}/${n.reserve}${stock>=n.reserve?" : la réserve est pleine, il se repose.":"."} Depuis son arrivée : ${p.total||0} ${plur(MATIERES[o].nom, p.total||0)}.</small></div>
    ${suiv?`<div class="regle"><b>Niveau suivant</b><small>${parHeure(suiv.par, o)}, réserve de ${suiv.reserve}. ${suiv.prix} 🪙, une fois.</small></div><button class="fermer" id="amelPoste" ${etat.or>=suiv.prix?"":"disabled"}>Améliorer · ${suiv.prix} 🪙</button>`:`<div class="regle"><b>Au mieux</b><small>${ap.qui.split(",")[0]} ne peut pas aller plus vite. Il le dit lui-même.</small></div>`}</div>`);
  const b = $("amelPoste"); if(b) b.addEventListener("click", ()=>{ ameliorerPoste(eid); c.hidden=true; });
}
function htmlPostes(){
  const ids = Object.keys(etat.postes||{}); if(!ids.length) return "";
  return `<h3>Tes apprentis</h3>` + ids.map(eid=>{
    const e = ETALS.find(x=>x.id===eid), ap = e.apprenti, p = etat.postes[eid], n = ap.niveaux[p.niveau], suiv = ap.niveaux[p.niveau+1], o = ap.objet, stock = etat.matieres[o]||0, plein = stock>=n.reserve;
    return `<div class="poste"><span class="big">${ap.emoji}</span><div><b>${ap.nom} <em class="niv">${p.niveau+1}/${ap.niveaux.length}</em></b><small>${ap.qui}. ${parHeure(n.par, o)}, jusqu'à ${n.reserve} en réserve. ${MATIERES[o].emoji} ${stock}/${n.reserve}${plein?" : la réserve est pleine, il se repose.":""}</small></div>${suiv?`<button class="choix" data-ameliorer-poste="${eid}" ${etat.or>=suiv.prix?"":"disabled"}>Améliorer · ${suiv.prix} 🪙</button>`:`<small class="max">Au mieux</small>`}</div>`;
  }).join("");
}
function rendreEtals(){
  return htmlPostes() + `<h3>Les étals de Saint-Aubin</h3><p class="intro">Matériaux, outils et produits frais, de ${OUVRE} h à ${FERME} h. Chacun vient à ses jours, avec un stock limité ; les prix bougent un peu. À force d'acheter chez quelqu'un, il finit par proposer son apprenti.</p>` +
    ETALS.map(e=>{
      const tete = `<div class="tete">${portrait(e, true)}<div><b>${e.nom}</b><small>${e.metier} · ${joursTxt(e)}</small></div></div>`;
      let prop = "";
      if(e.apprenti && !posteDe(e.id) && fidelite(e) >= e.fidelite){
        if(!(etat.refusAbo||{})[e.id]) prop = `<div class="abo propose"><p class="parole">« ${e.apprenti.proposition} »</p><p class="intro">${e.apprenti.nom} : ${parHeure(e.apprenti.niveaux[0].par, e.apprenti.objet)} pour commencer, sans rien payer ensuite. Améliorable.</p>
          <div class="ecoutes"><button class="choix" data-installer="${e.id}" aria-pressed="true" ${etat.or>=e.apprenti.niveaux[0].prix?"":"disabled"}>Installer · ${e.apprenti.niveaux[0].prix} 🪙</button><button class="choix" data-refuser="${e.id}">Non merci</button></div></div>`;
        else prop = `<button class="lienAbo" data-reprendre="${e.id}">Finalement, l'apprenti de ${e.nom} ?</button>`;
      }
      if(e.nuit && !present(e)) return "";   // l'étranger ne se montre qu'à ses heures
      if(!present(e)) return `<div class="etal ferme">${tete}<p class="parole">${absenceTxt(e)}</p>${prop}</div>`;
      const voulu = e.maraichere ? new Set(demandesManquantes()) : new Set();
      const articles = vendDe(e).map(([id, base, stock, max])=>{ const prix=prixDuJour(id,base), reste=resteEtal(e,id,stock), a=possede(id), plein = max && a>=max;
        return `<div class="article">${PLANTES[id] ? ico(id,"big") : `<span class="big">${emojiArticle(id)}</span>`}<div><b>${nomArticle(id)}</b><small>${prix} ${e.monnaie==="lunes"?"🌙":"🪙"}${stock!=null?` · ${Math.max(0,reste)} en stock`:""}${a?` · tu en as ${a}`:""}${voulu.has(id)?" · <em>demandé</em>":""}</small></div><button data-etal="${e.id}" data-art="${id}" ${plein||reste<=0||(e.monnaie==="lunes"?etat.lunes:etat.or)<prix?"disabled":""}>${plein?"Acquis":reste<=0?"Épuisé":"Acheter"}</button></div>`; }).join("");
      return `<div class="etal">${tete}<p class="parole">« ${e.phrase} »</p><div class="panier">${articles}</div>${prop}</div>`;
    }).join("");
}
function brancherEtals(a){
  const re = ()=>{ cleCourrier=""; rendreCourrier(); };
  a.querySelectorAll("[data-etal]").forEach(b=>b.addEventListener("click",()=>acheterEtal(b.dataset.etal, b.dataset.art)));
  a.querySelectorAll("[data-installer]").forEach(b=>b.addEventListener("click",()=>installerApprenti(b.dataset.installer)));
  a.querySelectorAll("[data-refuser]").forEach(b=>b.addEventListener("click",()=>refuserApprenti(b.dataset.refuser)));
  a.querySelectorAll("[data-reprendre]").forEach(b=>b.addEventListener("click",()=>{ delete (etat.refusAbo||{})[b.dataset.reprendre]; re(); }));
  a.querySelectorAll("[data-ameliorer-poste]").forEach(b=>b.addEventListener("click",()=>ameliorerPoste(b.dataset.ameliorerPoste)));
}


// marché entre joueurs (en ligne) : mis de côté pour l'instant ; le code reste, il suffit de repasser JOUEURS à true
const JOUEURS = false;
// vendre au marché (annonces, villageois) : mis de côté ; on vend au colporteur, depuis le panier
const VENTES = false;
// amis : sauvegarde en ligne (clé pour changer d'appareil) et un cadeau d'un objet par jour entre amis
const AMIS = true;
const MARCHE = {version:0, charge:false, enCours:false, erreur:"", moi:null, annonces:[], noms:{}, amis:[], suivis:[], cadeaux:[], jardiniers:[], voir:null, filtre:"tous", nouveau:false, vente:null, dernierSync:0};
const nomJoueur = id => (MARCHE.noms[id]||{}).nom || "Un jardinier";
const objetValide = id => { const b=base(id); return !!(PLANTES[b] || DENREES[b]); };
/* ---------- mon étal : mes annonces vivent d'abord sur l'appareil ----------
   etat.etal = [{lid, objet, qte, prix, mode, vu, srv, offre}] : la vérité, même hors ligne. Les villageois y achètent sans réseau.
   srv : l'id de l'annonce en ligne une fois publiée (null tant qu'on n'a pas pu l'envoyer : seuls les villageois la voient).
   etat.aRetirer : annonces en ligne à retirer du serveur dès que possible (vendues à un villageois, ou retirées, hors ligne).
   etat.dejaRegle : si un jardinier a acheté en ligne une annonce déjà partie hors ligne, on n'encaisse pas une seconde fois. */
const monEtal = () => { etat.etal = etat.etal || []; if(!JOUEURS) etat.etal.forEach(l=>{ if(l.mode==="jamais") l.mode="demander"; }); return etat.etal; };
const MAX_ANNONCES = 10;
function majMarcheVue(){ MARCHE.version++; cleCourrier=""; if(ZONE==="courrier") rendreCourrier(); majPastille(); }
async function chargerMarche(silencieux){
  if(!(JOUEURS || AMIS) || !RESEAU.actif || MARCHE.enCours) return; MARCHE.enCours = true; if(!silencieux) majMarcheVue();
  try{
    MARCHE.moi = await RESEAU.maPartie();
    if(MARCHE.moi){
      await viderRetraits();
      const [ann, liens, cad, jard] = await Promise.all([JOUEURS ? RESEAU.annonces() : [], RESEAU.amis(), RESEAU.cadeaux(), RESEAU.jardiniers().catch(()=>[])]);
      MARCHE.annonces = ann||[]; MARCHE.suivis = (liens||[]).filter(l=>l.uid===RESEAU.uid()).map(l=>l.ami); MARCHE.cadeaux = cad||[];
      MARCHE.jardiniers = (jard||[]).filter(j=>j.uid!==RESEAU.uid()); MARCHE.jardiniers.forEach(j=>MARCHE.noms[j.uid]=j);
      const ids = [...new Set([...MARCHE.annonces.map(x=>x.vendeur), ...MARCHE.annonces.map(x=>x.acheteur).filter(Boolean), ...MARCHE.suivis, ...(liens||[]).map(l=>l.uid), ...MARCHE.cadeaux.map(c=>c.de)])];
      (await RESEAU.joueurs(ids)).forEach(j=>MARCHE.noms[j.uid]=j);
      await solderMarche();
      if(JOUEURS) await accorderEtal();
    }
    MARCHE.erreur = ""; MARCHE.charge = true;
  }catch(e){ MARCHE.erreur = e.message || "réseau"; }
  MARCHE.enCours = false; majMarcheVue();
}
// retraits en attente : faits hors ligne, envoyés au serveur dès que la connexion revient
async function viderRetraits(){
  const file = etat.aRetirer || []; if(!file.length) return;
  const reste = [];
  for(const id of file){
    try{ const r = await RESEAU.retirer(id); if(!r){ etat.dejaRegle = etat.dejaRegle||{}; etat.dejaRegle[id] = 1; } }
    catch(e){ reste.push(id); }
  }
  etat.aRetirer = reste; sauver();
}
// ventes à encaisser et cadeaux à recevoir : une seule fois chacun (le serveur y veille)
async function solderMarche(){
  const moi = RESEAU.uid(); let rien = true; etat.dejaRegle = etat.dejaRegle||{};
  for(const a of MARCHE.annonces.filter(x=>x.vendeur===moi && x.statut==="vendue" && !x.encaissee)){
    const r = await RESEAU.encaisser(a.id); if(!r) continue; a.encaissee = true; rien = false;
    etat.etal = monEtal().filter(l=>String(l.srv)!==String(a.id));
    if(etat.dejaRegle[a.id]){ delete etat.dejaRegle[a.id]; annoncer(`${nomJoueur(a.acheteur)} avait aussi acheté tes ${plur(defObjet(r.objet).nom, r.qte)} en ligne pendant qu'un villageois te les prenait. Tant mieux pour ${nomJoueur(a.acheteur)} : tu as déjà été payé.`); continue; }
    gagnerOr(r.prix); annoncer(`${nomJoueur(a.acheteur)} a acheté ${r.qte} ${plur(defObjet(r.objet).nom, r.qte)} au marché : +${r.prix} 🪙.`); tinter(659); tinter(880,.12); }
  for(const c of MARCHE.cadeaux.filter(x=>x.a===moi && !x.recu)){
    const r = await RESEAU.recevoir(c.id); if(r && objetValide(r.objet)){ ajouter(r.objet, r.qte); c.recu = true; rien=false; annoncer(`${nomJoueur(c.de)} t'offre ${r.qte} ${plur(defObjet(r.objet).nom, r.qte)}${r.mot?` : « ${r.mot} »`:"."} C'est dans le panier.`); tinter(587); tinter(784,.12); tinter(988,.24); } }
  if(!rien){ sauver(); rendre(); }
}
// mettre d'accord l'étal de l'appareil et le serveur : publier ce qui ne l'est pas, oublier ce qui a été réglé ailleurs
async function accorderEtal(){
  const moi = RESEAU.uid(), etal = monEtal(), enAttente = new Set((etat.aRetirer||[]).map(String));
  const miennes = MARCHE.annonces.filter(a=>a.vendeur===moi), parId = new Map(miennes.map(a=>[String(a.id), a]));
  // une annonce liée que le serveur dit vendue ou retirée ailleurs (autre appareil) n'est plus à l'étal
  etat.etal = etal.filter(l=>{ if(l.srv==null) return true; const s = parId.get(String(l.srv)); return !s || s.statut==="ouverte"; });
  // une annonce ouverte en ligne inconnue ici (version précédente, autre appareil) rejoint l'étal
  const anciennes = etat.ventes || {};
  for(const a of miennes.filter(a=>a.statut==="ouverte" && !enAttente.has(String(a.id)))){
    if(monEtal().some(l=>String(l.srv)===String(a.id))) continue;
    const v = anciennes[a.id] || {};
    monEtal().push({lid:"s"+a.id, objet:a.objet, qte:a.qte, prix:a.prix, mode:v.mode||"auto", vu:v.vu||new Date(a.cree).getTime()||Date.now(), srv:a.id, offre:v.offre||null});
  }
  delete etat.ventes;
  // publier ce qui n'a pas encore pu l'être
  for(const l of monEtal().filter(l=>l.srv==null)){
    try{ const r = await RESEAU.publier(l.objet, l.qte, l.prix); const id = r && r[0] && r[0].id; if(id!=null) l.srv = id; }catch(e){ break; }
  }
  sauver();
}
/* ---------- les villageois achètent à mon étal (le colporteur n'existe plus), avec ou sans réseau ----------
   Chaque annonce est jugée par rapport au prix du village (valeur × quantité). Un villageois passe au hasard,
   d'autant plus vite que c'est bon marché ; très cher, il ne passe jamais (seuls les jardiniers achètent).
   Selon le réglage de l'annonce, il achète aussitôt, ou fait une offre qu'on accepte ou non (pour garder l'objet à un ami). */
const COTES = [
  {max:.85, nom:"Très bon marché", niveau:0, moyenne:20*60000, delai:"un villageois passera vite"},
  {max:1.1, nom:"Bon marché", niveau:1, moyenne:2*3600000, delai:"un villageois passera dans les heures qui viennent"},
  {max:1.4, nom:"Cher", niveau:2, moyenne:10*3600000, delai:"un villageois finira par passer, sans se presser"},
  {max:Infinity, nom:"Très cher", niveau:3, moyenne:Infinity, delai: JOUEURS ? "aucun villageois n'achètera, seulement les jardiniers" : "aucun villageois n'achètera à ce prix"}];
function cote(objet, n, prix){ const r = prix / Math.max(1, defObjet(objet).valeur*n); return COTES.find(c=>r<=c.max); }
const MODES_VENTE = {auto:{nom:"achètent sans me demander", court:"villageois bienvenus"}, demander:{nom:"me demandent d'abord", court:"sur offre"}, jamais:{nom:"n'achètent pas (gardé aux jardiniers)", court:"jardiniers seulement"}};
if(!JOUEURS) delete MODES_VENTE.jamais;
const offreDe = l => l && l.offre && l.offre.fin>Date.now() ? l.offre : null;
const pnjAuHasard = () => VILLE[Math.floor(Math.random()*VILLE.length)];
const retirerEnLigne = l => { if(l.srv==null) return; etat.aRetirer = etat.aRetirer||[]; etat.aRetirer.push(l.srv); if(MARCHE.moi) viderRetraits().catch(()=>{}); };
function venteVillageois(lid, pnjId){
  const l = monEtal().find(x=>x.lid===lid), p = pnjDe(pnjId); if(!l) return;
  etat.etal = monEtal().filter(x=>x!==l); retirerEnLigne(l);
  gagnerOr(l.prix); evenement({type:"vente", id:l.objet});
  annoncer(`${p.nom} ${p.g==="pl"?"ont":"a"} acheté tes ${plur(defObjet(l.objet).nom, l.qte)} ×${l.qte} au marché : +${l.prix} 🪙.`); tinter(659); tinter(880,.12);
  sauver(); rendre(); majMarcheVue();
}
function villageois(){
  if(!VENTES){ // les annonces d'avant reviennent au panier
    const l = etat.etal||[]; if(l.length){ l.forEach(a=>ajouter(a.objet, a.qte)); etat.etal = []; annoncer(`Le marché ne prend plus d'annonces : ${l.length>1?"tes objets en vente reviennent au panier. Le colporteur les achète.":"ton objet en vente revient au panier. Le colporteur l'achète."}`); sauver(); }
    return; }
  const maint = Date.now(); let change = false;
  for(const l of monEtal().slice()){
    const dt = Math.min(3*86400000, Math.max(0, maint - (l.vu||maint))); l.vu = maint;
    if(l.offre && !offreDe(l)){ l.offre = null; change = true; }
    if(l.mode==="jamais" || offreDe(l)) continue;
    const c = cote(l.objet, l.qte, l.prix); if(!isFinite(c.moyenne)) continue;
    if(Math.random() >= 1 - Math.exp(-dt / c.moyenne)) continue;
    const p = pnjAuHasard(); change = true;
    if(l.mode==="auto") venteVillageois(l.lid, p.id);
    else { l.offre = {pnj:p.id, fin:maint+8*3600000}; annoncer(`${p.nom} ${p.g==="pl"?"voudraient":"voudrait"} tes ${plur(defObjet(l.objet).nom, l.qte)} ×${l.qte} pour ${l.prix} 🪙. Réponds au marché.`); tinter(587); }
  }
  sauver(); if(change) majMarcheVue();
}
setInterval(()=>{ if(!document.hidden) villageois(); }, 30000);
// toutes les deux minutes (et au retour) : encaisser, recevoir, publier, sauvegarder en ligne
async function syncMarche(){
  if(!(JOUEURS || AMIS) || !RESEAU.actif || !MARCHE.moi && MARCHE.charge) return;
  if(Date.now()-MARCHE.dernierSync < 110000) return; MARCHE.dernierSync = Date.now();
  await chargerMarche(true);
  if(MARCHE.moi){ try{ await RESEAU.sauvegarder(etat); }catch(e){} }
}
setInterval(syncMarche, 30000);
function rendreMarche(){
  if(!VENTES && !JOUEURS) return "<!--BAS-->";
  const etal = monEtal(), enLigne = JOUEURS && RESEAU.actif && MARCHE.charge && MARCHE.moi && !MARCHE.erreur;
  const moi = RESEAU.uid(), amis = new Set(MARCHE.suivis);
  const ouvertes = enLigne ? MARCHE.annonces.filter(a=>a.statut==="ouverte" && a.vendeur!==moi && objetValide(a.objet)) : [];
  if(MARCHE.voir && !ouvertes.some(a=>a.vendeur===MARCHE.voir) && !MARCHE.jardiniers.some(j=>j.uid===MARCHE.voir)) MARCHE.voir = null;
  const vues = MARCHE.voir ? ouvertes.filter(a=>a.vendeur===MARCHE.voir) : MARCHE.filtre==="amis" ? ouvertes.filter(a=>amis.has(a.vendeur)) : ouvertes;
  const carte = a => { const d=defObjet(a.objet), ami=amis.has(a.vendeur);
    return `<div class="article ${d.rare?"rare":""}">${ico(a.objet,"big")}<div><b>${d.nom} ×${a.qte}</b><small>${nomJoueur(a.vendeur)}${ami?" · ami":""} · ${cote(a.objet,a.qte,a.prix).nom}</small></div><button data-acheter="${a.id}" ${etat.or>=a.prix?"":"disabled"}>${a.prix} 🪙</button></div>`; };
  const mienne = l => { const d=defObjet(l.objet); return `<div class="article mienne">${ico(l.objet,"big")}<div><b>${d.nom} ×${l.qte} · ${l.prix} 🪙</b><small>${cote(l.objet,l.qte,l.prix).nom} · ${(MODES_VENTE[l.mode]||MODES_VENTE.auto).court}${l.srv==null?" · au village seulement":""}</small></div><button data-retirer="${l.lid}">Retirer</button></div>`; };
  const panierCles = Object.keys(etat.panier).filter(k=>etat.panier[k]>0 && objetValide(k));
  const v = MARCHE.vente;
  const formVente = panierCles.length ? `<div class="formulaire vente">
      <select id="mObjet">${panierCles.map(k=>`<option value="${k}" ${v&&v.objet===k?"selected":""}>${defObjet(k).nom} (${etat.panier[k]})</option>`).join("")}</select>
      <label>Quantité <input id="mQte" type="number" min="1" max="99" value="${v?v.qte:1}"></label>
      <label>Prix total 🪙 <input id="mPrix" type="number" min="1" max="99999" value="${v&&v.prix?v.prix:""}"></label>
      <p class="cote" id="mCote"></p>
      <label class="large">Les villageois <select id="mMode">${Object.entries(MODES_VENTE).map(([k,m])=>`<option value="${k}" ${(etat.modeVente||"auto")===k?"selected":""}>${m.nom}</option>`).join("")}</select></label>
      <button class="choix" data-m="publier" ${etal.length>=MAX_ANNONCES?"disabled":""}>Mettre en vente</button></div>
      <p class="intro">${etal.length}/${MAX_ANNONCES} annonces. L'objet quitte ton panier tant qu'il est en vente ; tu le récupères si tu retires l'annonce. Plus c'est bon marché, plus vite un villageois passe : quelques minutes à très bon marché, quelques heures à bon marché, une journée quand c'est cher. ${JOUEURS ? "Très cher, seuls les jardiniers achètent. Les villageois passent même sans réseau ; les autres jardiniers voient tes annonces dès que tu es connecté." : "Très cher, personne n'achète. Les villageois passent même quand tu n'es pas là."}</p>` : `<p class="intro">Ton panier est vide.</p>`;
  const offres = etal.filter(offreDe).map(l=>{ const o=offreDe(l), p=pnjDe(o.pnj), d=defObjet(l.objet);
    return `<div class="article offre">${portrait(p,true)}<div><b>${p.nom} ${p.g==="pl"?"voudraient":"voudrait"} ${d.nom} ×${l.qte}</b><small>pour ${l.prix} 🪙 · l'offre tient ${resteTxt(o.fin-Date.now())}</small></div><button data-accepter="${l.lid}">Vendre</button><button data-garder="${l.lid}">Garder</button></div>`; }).join("");
  const nAmis = ouvertes.filter(a=>amis.has(a.vendeur)).length;
  const puces = (ouvertes.length || MARCHE.voir) ? `<div class="ecoutes mini">${MARCHE.voir ? `<button class="choix" data-filtre="tous" aria-pressed="true">${nomJoueur(MARCHE.voir)} ✕</button>` : `<button class="choix" data-filtre="tous" aria-pressed="${MARCHE.filtre==="tous"}">Tous ${ouvertes.length}</button>${MARCHE.suivis.length?`<button class="choix" data-filtre="amis" aria-pressed="${MARCHE.filtre==="amis"}">Amis ${nAmis}</button>`:""}`}</div>` : "";
  const etatReseau = !JOUEURS || !RESEAU.actif ? "" : !MARCHE.charge && !MARCHE.erreur ? `<p class="intro mini">On monte au marché…</p>` : MARCHE.erreur ? `<p class="intro mini">Hors ligne : seuls les villageois passent. Les jardiniers reviendront avec le réseau.</p>` : !MARCHE.moi ? `<p class="intro mini">Les villageois passent. Pour que les autres jardiniers te voient, entre au marché tout en bas.</p>` : "";
  const vide = MARCHE.voir ? `${nomJoueur(MARCHE.voir)} n'a rien en vente.` : MARCHE.filtre==="amis" && enLigne ? "Tes amis n'ont rien en vente." : "Aucune annonce pour l'instant. On vend tout en bas.";
  const haut = `<div class="marche-tete"><h3>Le marché</h3>${JOUEURS && RESEAU.actif?`<button class="rond" data-m="recharger" aria-label="Actualiser">↻</button>`:""}</div>${offres?`<div class="panier marche">${offres}</div>`:""}${etatReseau}${puces}
    <div class="panier marche">${vues.map(carte).join("")}${etal.map(mienne).join("")}${(vues.length||etal.length) ? "" : `<p class="intro">${vide}</p>`}</div>`;
  // les jardiniers : ceux passés récemment, plus les amis et les vendeurs du moment ; amis d'abord
  let enLigneBas = "";
  if(!JOUEURS || !RESEAU.actif) enLigneBas = "";
  else if(MARCHE.erreur) enLigneBas = `<details class="repli"><summary>Jardiniers, amis et cadeaux</summary><p class="intro">Le marché en ligne ne répond pas (${MARCHE.erreur}).</p><button class="choix" data-m="recharger">Réessayer</button></details>`;
  else if(!MARCHE.charge) enLigneBas = "";
  else if(!MARCHE.moi) enLigneBas = `<h3>Les autres jardiniers</h3><p class="intro">Le marché de la Lisière est ouvert à tous les jardiniers. Choisis le nom sous lequel les autres te verront.</p>
    <div class="formulaire"><input id="mNom" maxlength="30" placeholder="Ton nom de jardinier"><button class="choix" data-m="inscrire">Entrer au marché</button></div>`;
  else {
    const nAnn = id => ouvertes.filter(a=>a.vendeur===id).length;
    const ids = [...new Set([...MARCHE.suivis, ...ouvertes.map(a=>a.vendeur), ...MARCHE.jardiniers.map(j=>j.uid)])].filter(id=>id!==moi);
    ids.sort((x,y)=>(amis.has(y)-amis.has(x)) || (nAnn(y)-nAnn(x)));
    const ligne = id => { const j=MARCHE.noms[id]||{}, n=nAnn(id), ami=amis.has(id), deja=ami && cadeauDuJour(id);
      return `<div class="ligne jardinier ${MARCHE.voir===id?"choisi":""}"><button class="qui" data-voir="${id}"><b>${nomJoueur(id)}${ami?" · ami":""}</b><small>${n?`${n} annonce${n>1?"s":""}`:"rien en vente"}${j.sauve_le?` · vu ${depuis(j.sauve_le)}`:""}</small></button>`+
        (ami ? `<button data-offrir="${id}" ${deja?"disabled":""}>${deja?"Offert aujourd'hui":"Offrir"}</button>` : `<button data-ajout="${id}">Ajouter en ami</button>`)+`</div>`; };
    const amisListe = ids.slice(0,30).map(ligne).join("");
    enLigneBas = `<details class="repli" ${MARCHE.ouvert?"open":""}><summary>Jardiniers, amis et cadeaux</summary>
    <p class="intro">Tu es <b>${MARCHE.moi.nom}</b>, code ami <strong class="code">${MARCHE.moi.code}</strong>. Touche un nom pour ne voir que ses annonces. Entre amis, on peut s'offrir un objet par jour.</p>
    ${amisListe || `<p class="intro">Personne d'autre n'est encore passé au marché.</p>`}
    <div class="formulaire"><input id="mCode" maxlength="8" placeholder="Code ami" autocapitalize="characters"><button class="choix" data-m="ami">Ajouter</button></div></details>
    <details class="repli"><summary>Ta partie ailleurs</summary><p class="intro">Ta lisière est sauvegardée en ligne. Pour la reprendre sur un autre téléphone ou un ordinateur, entre-y cette clé : <strong class="code">${MARCHE.moi.cle}</strong>. Garde-la pour toi.</p>
    <div class="formulaire"><input id="mCle" maxlength="20" placeholder="Clé d'une autre partie"><button class="choix" data-m="recuperer">Reprendre</button></div></details>`;
  }
  return haut + "<!--BAS-->" + `<h3>Vendre au marché</h3>${formVente}` + enLigneBas;
}
// onglet Amis : entrer (un nom), ses amis et les autres jardiniers, les cadeaux, la clé pour changer d'appareil
function rendreAmis(){
  if(!RESEAU.actif) return `<p class="intro">Les amis demandent une connexion à internet.</p>`;
  if(MARCHE.erreur) return `<p class="intro">Pas de réseau pour l'instant (${MARCHE.erreur}). Ta lisière continue sans : tout se rattrape au retour de la connexion.</p><button class="choix" data-m="recharger">Réessayer</button>`;
  if(!MARCHE.charge) return `<p class="intro">On cherche tes amis…</p>`;
  if(!MARCHE.moi) return `<p class="intro">Choisis un nom de jardinier : ta lisière sera sauvegardée en ligne (pour la reprendre sur un autre appareil) et tu pourras t'ajouter en ami avec d'autres jardiniers pour vous offrir un objet par jour.</p>
    <div class="formulaire"><input id="mNom" maxlength="30" placeholder="Ton nom de jardinier"><button class="choix" data-m="inscrire">C'est moi</button></div>`;
  const moi = RESEAU.uid(), amis = new Set(MARCHE.suivis);
  const ids = [...new Set([...MARCHE.suivis, ...MARCHE.jardiniers.map(j=>j.uid)])].filter(id=>id!==moi);
  ids.sort((x,y)=>amis.has(y)-amis.has(x));
  const ligne = id => { const j=MARCHE.noms[id]||{}, ami=amis.has(id), deja=ami && cadeauDuJour(id);
    return `<div class="ligne jardinier"><div class="qui"><b>${nomJoueur(id)}${ami?" · ami":""}</b><small>${j.sauve_le?`vu ${depuis(j.sauve_le)}`:"pas encore venu"}</small></div>`+
      (ami ? `<button data-offrir="${id}" ${deja?"disabled":""}>${deja?"Offert aujourd'hui":"Offrir"}</button>` : `<button data-ajout="${id}">Ajouter en ami</button>`)+`</div>`; };
  const recus = MARCHE.cadeaux.filter(c=>c.a===moi).slice(0,5).map(c=>`<div class="ligne"><div><b>${nomJoueur(c.de)}</b><small>${defObjet(c.objet).nom}${c.mot?` · « ${c.mot} »`:""} · ${depuis(c.cree)}</small></div></div>`).join("");
  return `<div class="marche-tete"><h3>Mes amis</h3><button class="rond" data-m="recharger" aria-label="Actualiser">↻</button></div>
    <p class="intro">Tu es <b>${MARCHE.moi.nom}</b>, code ami <strong class="code">${MARCHE.moi.code}</strong>. Entre amis, on peut s'offrir un objet par jour ; il arrive dans le panier de l'autre.</p>
    ${ids.slice(0,30).map(ligne).join("") || `<p class="intro">Personne d'autre n'est encore venu.</p>`}
    <div class="formulaire"><input id="mCode" maxlength="8" placeholder="Code ami" autocapitalize="characters"><button class="choix" data-m="ami">Ajouter</button></div>
    ${recus ? `<h3>Reçus</h3>${recus}` : ""}
    <details class="repli"><summary>Ta partie ailleurs</summary><p class="intro">Ta lisière est sauvegardée en ligne. Pour la reprendre sur un autre téléphone ou un ordinateur, entre-y cette clé : <strong class="code">${MARCHE.moi.cle}</strong>. Garde-la pour toi.</p>
    <div class="formulaire"><input id="mCle" maxlength="20" placeholder="Clé d'une autre partie"><button class="choix" data-m="recuperer">Reprendre</button></div></details>`;
}
function brancherMarche(a){
  const action = async (fn, ok) => { try{ const r = await fn(); if(ok) ok(r); }catch(e){ dire(`Le marché n'a pas pu : ${e.message}.`); } chargerMarche(); };
  a.querySelectorAll("[data-m]").forEach(b=>b.addEventListener("click",()=>{
    const m = b.dataset.m;
    if(m==="recharger") chargerMarche();
    if(m==="inscrire"){ const nom=($("mNom").value||"").trim(); if(!nom){ dire("Choisis d'abord un nom."); return; } action(()=>RESEAU.inscrire(nom), ()=>{ dire(`Bienvenue, ${nom}.`); RESEAU.sauvegarder(etat).catch(()=>{}); }); }
    if(m==="ami"){ const code=($("mCode").value||"").trim(); if(!code) return; action(()=>RESEAU.ajouterAmi(code), r=>dire(r ? `${r.nom} est maintenant dans tes amis.` : "Aucun jardinier n'a ce code.")); }
    if(m==="publier"){ const objet=$("mObjet").value, qte=Math.max(1,Math.min(99,+$("mQte").value||1)), prix=Math.max(1,Math.min(99999,+$("mPrix").value||0));
      if(!prix){ dire("Indique un prix."); return; } if((etat.panier[objet]||0)<qte){ dire("Tu n'en as pas autant."); return; }
      if(monEtal().length>=MAX_ANNONCES){ dire(`Dix annonces au plus.`); return; }
      const mode = ($("mMode")||{}).value || "auto"; etat.modeVente = mode; MARCHE.vente = null;
      // l'annonce est à l'étal tout de suite, même sans réseau ; elle part en ligne dès que possible
      etat.panier[objet]-=qte; if(!etat.panier[objet]) delete etat.panier[objet];
      monEtal().push({lid:"l"+Date.now().toString(36)+Math.floor(Math.random()*1e4), objet, qte, prix, mode, vu:Date.now(), srv:null, offre:null});
      sauver(); rendre(); dire(`En vente : ${qte} ${plur(defObjet(objet).nom,qte)} pour ${prix} 🪙.`); tinter(523); majMarcheVue();
      if(MARCHE.moi) chargerMarche(true);
    }
    if(m==="recuperer"){ const cle=($("mCle").value||"").trim(); if(!cle) return;
      action(()=>RESEAU.recuperer(cle), r=>{ if(!r){ dire("Cette clé ne correspond à aucune partie."); return; } if(r.sauvegarde){ try{ localStorage.setItem(KEY, JSON.stringify(r.sauvegarde)); }catch(e){} dire("Partie reprise. La lisière se recharge…"); setTimeout(()=>location.reload(), 900); } else dire("Partie liée, mais elle n'avait pas encore de sauvegarde."); }); }
  }));
  const revoir = () => { MARCHE.version++; cleCourrier=""; rendreCourrier(); };
  a.querySelectorAll("[data-filtre]").forEach(b=>b.addEventListener("click",()=>{ MARCHE.filtre=b.dataset.filtre; MARCHE.voir=null; revoir(); }));
  a.querySelectorAll("[data-voir]").forEach(b=>b.addEventListener("click",()=>{ MARCHE.voir = MARCHE.voir===b.dataset.voir ? null : b.dataset.voir; revoir(); const e=a.querySelector(".ecoutes"); if(e) e.scrollIntoView({block:"nearest", behavior:"smooth"}); }));
  a.querySelectorAll("[data-ajout]").forEach(b=>b.addEventListener("click",()=>{ b.disabled=true; action(()=>RESEAU.ajouterAmiId(b.dataset.ajout), r=>dire(r ? `${r.nom} est maintenant dans tes amis. Vous pouvez vous offrir un objet par jour.` : "Ce jardinier n'est plus au marché.")); }));
  a.querySelectorAll("[data-acheter]").forEach(b=>b.addEventListener("click",()=>{
    const ann = MARCHE.annonces.find(x=>String(x.id)===b.dataset.acheter); if(!ann || etat.or<ann.prix) return;
    action(()=>RESEAU.acheter(ann.id), r=>{ if(!r){ dire("Trop tard : quelqu'un l'a acheté avant toi."); return; } etat.or-=r.prix; ajouter(r.objet, r.qte); sauver(); rendre(); dire(`Acheté à ${nomJoueur(ann.vendeur)} : ${r.qte} ${plur(defObjet(r.objet).nom,r.qte)}, dans ton panier. −${r.prix} 🪙.`); tinter(659); tinter(784,.1); });
  }));
  // retirer : tout de suite sur l'appareil ; le serveur suit dès que possible
  a.querySelectorAll("[data-retirer]").forEach(b=>b.addEventListener("click",()=>{ const l=monEtal().find(x=>x.lid===b.dataset.retirer); if(!l) return;
    etat.etal = monEtal().filter(x=>x!==l); retirerEnLigne(l); ajouter(l.objet, l.qte); sauver(); rendre();
    dire(`Annonce retirée : ${l.qte} ${plur(defObjet(l.objet).nom,l.qte)} revien${l.qte>1?"nent":"t"} au panier.`); majMarcheVue(); }));
  a.querySelectorAll("[data-offrir]").forEach(b=>b.addEventListener("click",()=>ouvrirCadeau(b.dataset.offrir)));
  // le prix proposé : le prix du village ; l'étiquette dit tout de suite si c'est bon marché ou cher
  const o=$("mObjet"), q=$("mQte"), p=$("mPrix"), ct=$("mCote");
  if(o && p){ const voirCote=()=>{ if(ct){ const c=cote(o.value, +q.value||1, +p.value||0); ct.textContent = `${c.nom} · prix du village : ${defObjet(o.value).valeur*(+q.value||1)} 🪙 · ${c.delai}`; ct.dataset.niveau = c.niveau; } };
    const prop=()=>{ if(MARCHE.vente && MARCHE.vente.objet===o.value && MARCHE.vente.qte===+q.value && MARCHE.vente.prix){ voirCote(); return; } p.value = Math.max(1, defObjet(o.value).valeur*(+q.value||1)); MARCHE.vente={objet:o.value, qte:+q.value||1, prix:+p.value}; voirCote(); };
    o.addEventListener("change",()=>{ MARCHE.vente=null; q.value = Math.min(99, etat.panier[o.value]||1); prop(); }); q.addEventListener("input",()=>{ MARCHE.vente=null; prop(); }); p.addEventListener("input",()=>{ MARCHE.vente={objet:o.value, qte:+q.value||1, prix:+p.value}; voirCote(); }); prop(); }
  if(MARCHE.allerVendre && o){ MARCHE.allerVendre=false; setTimeout(()=>o.scrollIntoView({block:"center", behavior:"smooth"}), 50); }
  a.querySelectorAll("[data-accepter]").forEach(b=>b.addEventListener("click",()=>{ const l=monEtal().find(x=>x.lid===b.dataset.accepter), o=offreDe(l); if(l && o){ b.disabled=true; venteVillageois(l.lid, o.pnj); } }));
  a.querySelectorAll("[data-garder]").forEach(b=>b.addEventListener("click",()=>{ const l=monEtal().find(x=>x.lid===b.dataset.garder); if(l){ l.offre=null; l.vu=Date.now(); } sauver(); dire("Tu la gardes. Elle reste au marché."); majMarcheVue(); }));
}
// un cadeau par jour et par ami (jour de Paris, comme le serveur), un seul objet
const jourParis = d => new Date(d).toLocaleDateString("fr-CA", {timeZone:"Europe/Paris"});
const cadeauDuJour = ami => { const auj = jourParis(Date.now()); return MARCHE.cadeaux.some(c=>c.de===RESEAU.uid() && c.a===ami && jourParis(c.cree)===auj); };
function depuis(t){ const m = Math.max(0, (Date.now()-new Date(t))/60000);
  return m<10 ? "à l'instant" : m<60 ? `il y a ${Math.round(m)} min` : m<1440 ? `il y a ${Math.round(m/60)} h` : m<2880 ? "hier" : `il y a ${Math.round(m/1440)} jours`; }
function ouvrirCadeau(ami){
  const cles = Object.keys(etat.panier).filter(k=>etat.panier[k]>0 && objetValide(k));
  const deja = cadeauDuJour(ami);
  const c = ouvrirPanneau(`<h2>Offrir à ${nomJoueur(ami)}</h2><div class="corps">${deja ? `<p class="intro">Tu lui as déjà offert quelque chose aujourd'hui. Reviens demain.</p>` : cles.length ? `<p class="intro">Un objet par jour entre amis. Il arrive dans son panier la prochaine fois qu'il ouvre le jeu.</p>
    <div class="formulaire vente"><select id="cObjet">${cles.map(k=>`<option value="${k}">${defObjet(k).nom} (${etat.panier[k]})</option>`).join("")}</select>
    <input id="cMot" maxlength="200" placeholder="Un mot (facultatif)"></div>
    <button class="fermer" id="cEnvoyer">Offrir</button>` : `<p class="intro">Ton panier est vide.</p>`}</div>`);
  const b=$("cEnvoyer"); if(b) b.addEventListener("click", async ()=>{
    const objet=$("cObjet").value, mot=($("cMot").value||"").trim()||null;
    if((etat.panier[objet]||0)<1){ dire("Tu n'en as plus."); return; }
    b.disabled = true;
    try{ const r = await RESEAU.offrir(ami, objet, mot); etat.panier[objet]-=1; if(!etat.panier[objet]) delete etat.panier[objet];
      MARCHE.cadeaux.unshift((r&&r[0]) || {de:RESEAU.uid(), a:ami, objet, qte:1, cree:new Date().toISOString()});
      sauver(); rendre(); c.hidden=true; dire(`Envoyé à ${nomJoueur(ami)} : ${defObjet(objet).nom}.`); tinter(587); tinter(880,.12); MARCHE.version++; cleCourrier=""; rendreCourrier(); }
    catch(e){ b.disabled = false; dire(e.status===403 || /security|policy/i.test(e.message) ? "Un seul cadeau par jour à cet ami : reviens demain." : `Le cadeau n'est pas parti : ${e.message}.`); }
  });
}
// fiche d'un objet du panier : ce que c'est, d'où ça vient, ce que ça vaut, à qui ça plaît
function infoObjet(id){
  const d = defObjet(id), b = base(id), p = PLANTES[b], r = RECETTES.find(x=>x.id===b);
  const aiment = HABITANTS.filter(h=>h.aime.includes(b)).map(h=>h.nom.toLowerCase());
  const veulent = VILLE.filter(v=>v.envies.some(e=>e[0]===b)).map(v=>v.nom);
  const lignes = [];
  if(d.rare){ lignes.push(["Une variante rare", `C'est une forme rare de ${p.nom.toLowerCase()}, comme il en existe chez les vrais jardiniers. Chaque récolte a environ ${Math.round((.04+fx().rare)*100)} % de chances de sortir ainsi ; l'amélioration « Œil de jardinier », à l'atelier, augmente cette chance.`]);
    lignes.push(["Ce qu'elle vaut", `${d.valeur} 🪙 au colporteur, trois fois une ${p.nom.toLowerCase()} ordinaire. Offerte à un habitant, elle rapporte plus de lunes. Elle compte dans l'herbier du carnet. Une lettre qui demande des ${plur(p.nom,2)} l'accepte aussi, en dernier recours.`]); }
  else if(p) lignes.push(["D'où ça vient", `Récoltée au ${zoneDef(p.zone).nom.toLowerCase()} : ${duree(p.duree)} de pousse${besoin(p)==="lumiere"?" de jour":besoin(p)==="pluie"?", seulement les jours de pluie":""}. Vaut ${d.valeur} 🪙 au colporteur.`]);
  else if(r) lignes.push(["Un plat de l'atelier", `${r.texte} Il faut ${listeObjets(r.ingr)}. Vaut ${d.valeur} 🪙 au colporteur.`]);
  else if(b==="poire") lignes.push(["Du poirier", `Le poirier en laisse trois chaque aube. Vaut ${d.valeur} 🪙 au colporteur.`]);
  if(aiment.length) lignes.push(["Qui l'aime", `${aiment.join(", ")}.`.replace(/^./,x=>x.toUpperCase())]);
  if(veulent.length) lignes.push(["Qui en commande", veulent.join(", ")+"."]);
  ouvrirPanneau(`<h2>${d.nom}</h2><div class="corps"><div class="pied-visite">${ico(id,"grand")}</div>${lignes.map(([t,x])=>`<div class="regle"><b>${t}</b><small>${x}</small></div>`).join("")}</div>`);
}
function lireChapitre(id){
  const ch = CHAPITRES.find(x=>x.id===id); if(!ch) return;
  etat.ville.lus[id]=1; sauver(); cleCourrier=""; audio.effet("papier");
  ouvrirPanneau(`<h2>📜 ${ch.titre}</h2><div class="corps"><p class="intro">De ${ch.de}</p><div class="missive">${ch.texte.split("\n\n").map(x=>`<p>${x.replace(/\n/g,"<br>")}</p>`).join("")}</div></div>`);
  rendre();
}
function ouvrirVisite(l){
  const p = pnjDe(l.pnj), ok = aTout(l.items);
  const c = ouvrirPanneau(`<h2>${p.nom}</h2><div class="corps">${IMG?`<div class="pied-visite">${im(`pnj-${p.id}`,"")}</div>`:""}<p class="intro">${p.metier}, ${ac(p,"monté","montée","montés")} de Saint-Aubin. Repart dans ${resteTxt(l.fin-Date.now())}.</p>
    <div class="missive"><p>« ${l.parole} »</p><p>Je voudrais ${listeObjets(l.items)}, si vous avez. ${l.raison}</p></div>
    <div class="regle"><b>${listeEmoji(l.items)}</b><small>Une visite paie le double d'une vente : +${l.or} 🪙${l.lunes?` et +${l.lunes} 🌙`:""}.</small></div>
    <button class="fermer" id="donnerVisite" ${ok?"":"disabled"}>Donner</button></div>`);
  const b=$("donnerVisite"); if(b) b.addEventListener("click", ()=>{ livrer(l.id); c.hidden=true; });
}
function majPastille(){
  const v = etat.ville, n = CHAPITRES.filter(ch=>v.chapitres[ch.id] && !v.lus[ch.id]).length + v.lettres.filter(l=>!l.vue || aTout(l.items) || l.enPersonne).length + (MARCHE.nouveau?1:0) + (etat.etal||[]).filter(offreDe).length;
  $("pastille").hidden = !n;
}

/* ---------- village : carte, chantiers, bâtiments ---------- */
// la carte illustrée fait 2:3 ; la clairière d'origine (carrée) en occupe le milieu, de OY à OY+w.
// Toutes les positions (terres, étang, bâtiments) restent exprimées dans ce carré.
const CARTE = {w:1800, h:1800, H:2700, OY:450};
let carteFaite = false, cleVillage = "";
function imgOu(nom, repli, attrs){ // image dans img/ si elle existe (par-dessus), sinon le dessin reste
  return `${repli}<image href="img/${nom}" ${attrs} onerror="this.remove()"></image>`;
}
function dessinBatiment(b, fini){
  // repli dessiné, 120x120 centré sur (0,0)
  const toit="#5a3f38", mur="#8c6b4f", pierre="#7d8294", bois="#6b4e35", lum="#f4d58a";
  if(!fini) return `<g><rect x="-40" y="-10" width="80" height="40" fill="#3a3150" stroke="${bois}" stroke-width="3"/><path d="M-44 30 v-50 M44 30 v-50 M-44 -20 h88 M-44 2 h88" stroke="${bois}" stroke-width="3" fill="none"/><path d="M-30 -20 l20 22 M10 -20 l20 22" stroke="${bois}" stroke-width="2"/></g>`;
  switch(b.id){
    case "cabane": return `<g><rect x="-34" y="-6" width="68" height="40" fill="${mur}"/><path d="M-42 -4 L0 -40 L42 -4z" fill="${toit}"/><rect x="-8" y="10" width="16" height="24" fill="${bois}"/><rect x="14" y="4" width="12" height="12" fill="${lum}"/></g>`;
    case "puits": return `<g><path d="M-26 20 a26 10 0 1 0 52 0 a26 10 0 1 0 -52 0" fill="${pierre}"/><rect x="-26" y="2" width="52" height="18" fill="${pierre}"/><path d="M-22 2 v-28 M22 2 v-28" stroke="${bois}" stroke-width="4"/><path d="M-30 -26 L0 -44 L30 -26z" fill="${toit}"/><circle cx="0" cy="-6" r="4" fill="#3a3150"/></g>`;
    case "ruche": return `<g><rect x="-44" y="18" width="88" height="8" fill="${bois}"/>${[-28,0,28].map(x=>`<path d="M${x-12} 18 q-4 -28 12 -30 q16 2 12 30z" fill="#d9b26a"/><path d="M${x-10} 6 h20 M${x-11} 12 h22" stroke="#b08a3e" stroke-width="2"/><rect x="${x-3}" y="12" width="6" height="4" fill="#3a3150"/>`).join("")}</g>`;
    case "lavoir": return `<g><rect x="-40" y="4" width="80" height="22" fill="${pierre}"/><rect x="-34" y="8" width="68" height="12" fill="#2d5484"/><path d="M-38 4 v-26 M38 4 v-26 M0 4 v-26" stroke="${bois}" stroke-width="4"/><path d="M-46 -22 L0 -42 L46 -22z" fill="#8a4a3a"/></g>`;
    case "serre": return `<g><path d="M-40 26 v-30 L0 -40 L40 -4 v30z" fill="rgba(180,220,230,.45)" stroke="#cfd8e4" stroke-width="2"/><path d="M-20 26 v-24 M0 26 v-40 M20 26 v-24 M-40 10 h80" stroke="#cfd8e4" stroke-width="2"/><path d="M-30 20 q6 -16 12 0 M8 22 q6 -14 12 0" fill="#5f9d7e"/></g>`;
    case "poirier": return `<g><rect x="-5" y="0" width="10" height="34" fill="${bois}"/><circle cx="0" cy="-10" r="30" fill="#5f9d7e"/><circle cx="-18" cy="0" r="18" fill="#8fc9a8"/><circle cx="16" cy="-4" r="20" fill="#8fc9a8"/>${[[-12,-14],[10,-20],[4,2],[-20,8],[20,10]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="4" ry="5" fill="#d9c56a"/>`).join("")}</g>`;
    case "lanterne": return `<g><rect x="-3" y="-20" width="6" height="54" fill="${bois}"/><rect x="-12" y="-40" width="24" height="26" rx="3" fill="#3a3150" stroke="${bois}" stroke-width="2"/><rect x="-8" y="-36" width="16" height="18" fill="${lum}"/><circle cx="0" cy="-27" r="22" fill="${lum}" opacity=".15"/></g>`;
    case "banc": return `<g><rect x="-30" y="2" width="60" height="10" rx="3" fill="${pierre}"/><rect x="-24" y="12" width="8" height="14" fill="${pierre}"/><rect x="16" y="12" width="8" height="14" fill="${pierre}"/><path d="M-30 4 q10 -6 20 0" fill="#5f9d7e"/><rect x="26" y="-10" width="6" height="36" fill="${bois}"/><circle cx="29" cy="-22" r="18" fill="#5f9d7e"/></g>`;
    case "moulin": return `<g><path d="M-18 34 L-10 -16 h20 L18 34z" fill="${mur}"/><path d="M-14 -16 L0 -30 L14 -16z" fill="${toit}"/><g stroke="${bois}" stroke-width="3" fill="rgba(241,233,214,.6)"><path d="M0 -24 L-4 -56 L4 -56z M0 -24 L28 -12 L26 -4z M0 -24 L-28 -12 L-26 -4z M0 -24 L4 8 L-4 8z"/></g><circle cx="0" cy="-24" r="4" fill="${bois}"/></g>`;
    case "portail": return `<g><rect x="-30" y="-30" width="8" height="64" fill="${bois}"/><rect x="22" y="-30" width="8" height="64" fill="${bois}"/><rect x="-30" y="-36" width="60" height="8" fill="${bois}"/><path d="M-20 -24 h18 v50 h-18z" fill="${bois}" opacity=".7"/><path d="M-20 -24 l18 50 M-20 26 l18 -50" stroke="#3a3150" stroke-width="2"/></g>`;
  }
  return `<circle r="24" fill="${pierre}"/>`;
}
function construireCarte(){
  if(carteFaite) return; carteFaite = true;
  const v = $("village"), {w,h,H,OY} = CARTE;
  // fond dessiné : ciel/lisière en haut, prairie, terres à gauche, étang à droite, sentier
  const zonesClic = `<g id="zonesClic"><rect id="terresClic" x="${w*.04}" y="${h*.32}" width="${w*.38}" height="${h*.14}" fill="transparent"/><polygon id="etangClic" points="${[[.87,.285],[.94,.29],[1,.30],[1,.44],[.93,.455],[.77,.45],[.74,.425],[.69,.41],[.62,.39],[.615,.355],[.67,.325],[.78,.30]].map(([x,y])=>`${w*x},${h*y}`).join(" ")}" fill="transparent"/></g>`;
  const terres = `<g id="terres" class="lieu" tabindex="0" role="button" aria-label="Le potager"><rect x="${w*.14}" y="${h*.46}" width="${w*.26}" height="${h*.2}" rx="18" fill="#2b2437"/>${Array.from({length:7},(_,i)=>`<path d="M${w*.16} ${h*.48+i*h*.026} h${w*.22}" stroke="#3a3150" stroke-width="7" stroke-linecap="round"/>`).join("")}<path d="M${w*.13} ${h*.44} h${w*.28}" stroke="#4a5a3a" stroke-width="14" stroke-linecap="round" opacity=".8"/></g>`;
  const etang = `<g id="etang" class="lieu" tabindex="0" role="button" aria-label="La mare"><path d="M${w*.60} ${h*.52} q${w*.06} -${h*.1} ${w*.2} -${h*.05} q${w*.12} ${h*.05} ${w*.08} ${h*.16} q-${w*.06} ${h*.1} -${w*.2} ${h*.06} q-${w*.14} -${h*.03} -${w*.08} -${h*.17}z" fill="#2d5484"/><path d="M${w*.64} ${h*.55} q${w*.06} -${h*.06} ${w*.14} -${h*.03}" stroke="#86b8e6" stroke-width="3" fill="none" opacity=".5"/>${[[.62,.5],[.64,.49],[.86,.62],[.88,.6]].map(([x,y])=>`<path d="M${w*x} ${h*y} v-${h*.05}" stroke="#5f9d7e" stroke-width="4" stroke-linecap="round"/>`).join("")}</g>`;
  const bois = `<path d="M0 0 h${w} v${h*.16} q-${w*.1} ${h*.05} -${w*.2} 0 q-${w*.1} -${h*.05} -${w*.2} 0 q-${w*.1} ${h*.05} -${w*.2} 0 q-${w*.1} -${h*.05} -${w*.2} 0 q-${w*.1} ${h*.05} -${w*.2} 0z" fill="#0f1322"/>` +
    Array.from({length:34},(_,i)=>{ const x=(i/34)*w+((i*37)%50), y=h*.1+((i*53)%60), r=40+((i*17)%40); return `<path d="M${x} ${y+r} L${x-r*.6} ${y+r} L${x} ${y-r} L${x+r*.6} ${y+r}z" fill="#141a2e" opacity=".9"/>`; }).join("");
  const sentier = `<path d="M${w*.5} ${h} q-${w*.04} -${h*.1} 0 -${h*.2} q${w*.04} -${h*.08} 0 -${h*.18}" stroke="#3a3150" stroke-width="34" stroke-linecap="round" fill="none" opacity=".9"/>`;
  const slots = BATIMENTS.map(b=>`<g class="slot" data-b="${b.id}" tabindex="0" role="button" aria-label="${b.nom}" transform="translate(${w*b.x/100} ${h*b.y/100})"></g>`).join("");
  v.innerHTML = `<div class="carte" id="carte"><canvas class="calque" id="calque"></canvas><svg viewBox="0 0 ${w} ${H}" aria-label="Carte de la lisière">
    <rect width="${w}" height="${OY}" fill="#0f1322"/><rect y="${OY}" width="${w}" height="${H-OY}" fill="#1c2a1f"/>
    <image id="carteImg" href="" x="0" y="0" width="${w}" height="${H}" preserveAspectRatio="xMidYMid slice"></image>
    <g transform="translate(0 ${OY})">
      <g id="carteRepli">${bois}${terres}${etang}${sentier}</g>
      ${zonesClic}
      <g id="fete" pointer-events="none"></g>
      <g id="objetsCarte" pointer-events="none"></g>
      <g id="slots">${slots}</g>
      <g id="postes">${ETALS.filter(e=>e.apprenti).map(e=>`<g class="slot poste" data-p="${e.id}" role="button" aria-label="${e.apprenti.nom}" transform="translate(${w*e.apprenti.ix/100} ${h*e.apprenti.iy/100})"></g>`).join("")}</g>
      <g id="passant" class="passant"></g>
    </g>
    <rect id="teinte" width="${w}" height="${H}" fill="#141a2e" opacity="0" pointer-events="none"/>
  </svg></div>`;
  const versMare = ()=>{ if(zoneOuverte("mare")) allerA("mare"); else dire("L'étang attend : il s'ouvre avec la cabane, ou quand six pots sont ouverts au potager."); };
  v.querySelector("#terres").addEventListener("click", ()=>allerA("potager")); v.querySelector("#terresClic").addEventListener("click", ()=>allerA("potager"));
  v.querySelector("#etang").addEventListener("click", versMare); v.querySelector("#etangClic").addEventListener("click", versMare);
  if(!IMG) v.querySelector("#zonesClic").setAttribute("display","none");
  if(IMG){ v.querySelector("#carteRepli").setAttribute("display","none"); v.querySelectorAll(".slot[data-b]").forEach(g=>{ const b=BATIMENTS.find(x=>x.id===g.dataset.b); if(b.ix!=null) g.setAttribute("transform",`translate(${w*b.ix/100} ${h*b.iy/100})`); }); }
  v.querySelectorAll(".slot[data-b]").forEach(g=>g.addEventListener("click", ()=>ouvrirBatiment(g.dataset.b)));
  v.querySelectorAll(".slot[data-p]").forEach(g=>g.addEventListener("click", ()=>ouvrirPoste(g.dataset.p)));
  v.querySelector("#passant").addEventListener("click", ()=>{ const l=etat.ville.lettres.find(x=>x.enPersonne); if(l) ouvrirVisite(l); });
  const carte = v.querySelector("#carte"), svg = carte.querySelector("svg");
  // zoom : pincer pour zoomer et dézoomer, double toucher pour alterner
  const apresTaille = [];
  // au plus loin, toute la carte tient en largeur (elle se centre verticalement) ; au plus près, 3,5 fois la largeur
  const R = CARTE.H/CARTE.w;
  // au plus loin, la carte couvre tout l'écran (sans bandes) ; au plus près, 3,5 fois la largeur
  const bornes = ()=>{ const cw=carte.clientWidth||400, ch=carte.clientHeight||600; return [Math.max(cw, ch/R), cw*3.5]; };
  const centrer = ()=>{ const t=(+svg.getAttribute("width")||0)*R, ch=carte.clientHeight, m = t<ch ? (ch-t)/2 : 0; svg.style.marginTop = m+"px"; const cq=carte.querySelector("#calque"); if(cq) cq.style.top = m+"px"; };
  apresTaille.push(centrer);
  const fixer = (t, fx, fy)=>{ const [mn,mx]=bornes(); t=Math.max(mn, Math.min(mx, t)); const ancien=+svg.getAttribute("width")||t;
    const px=(carte.scrollLeft+fx)/ancien, py=(carte.scrollTop+fy)/ancien;
    svg.setAttribute("width", t); svg.setAttribute("height", t*R);
    carte.scrollLeft = px*t - fx; carte.scrollTop = py*t - fy;
    etat.zoomCarte = t/(carte.clientWidth||400); apresTaille.forEach(f=>f()); return t; };
  requestAnimationFrame(()=>{ const cw=carte.clientWidth, z=etat.zoomCarte||2.2; const t=Math.max(bornes()[0], Math.min(bornes()[1], z*cw));
    svg.setAttribute("width", t); svg.setAttribute("height", t*R); carte.scrollLeft=(t-cw)/2; carte.scrollTop=t*R*.5-carte.clientHeight/2; apresTaille.forEach(f=>f()); });
  addEventListener("resize", ()=>fixer(+svg.getAttribute("width")||600, carte.clientWidth/2, carte.clientHeight/2));
  let pince = null;
  const dist = e=>Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
  carte.addEventListener("touchstart", e=>{ if(e.touches.length===2){ const r=carte.getBoundingClientRect(); pince={d:dist(e), t:+svg.getAttribute("width"), fx:(e.touches[0].clientX+e.touches[1].clientX)/2-r.left, fy:(e.touches[0].clientY+e.touches[1].clientY)/2-r.top}; } }, {passive:true});
  carte.addEventListener("touchmove", e=>{ if(pince && e.touches.length===2){ e.preventDefault(); fixer(pince.t*dist(e)/pince.d, pince.fx, pince.fy); } }, {passive:false});
  carte.addEventListener("touchend", e=>{ if(e.touches.length<2 && pince){ pince=null; sauver(); } });
  carte.addEventListener("wheel", e=>{ if(!e.ctrlKey) return; e.preventDefault(); const r=carte.getBoundingClientRect(); fixer((+svg.getAttribute("width"))*(e.deltaY<0?1.1:1/1.1), e.clientX-r.left, e.clientY-r.top); }, {passive:false});
  // double toucher : alterne entre vue d'ensemble et vue rapprochée
  let dernierTap = 0;
  carte.addEventListener("touchend", e=>{ if(e.touches.length) return; const now=Date.now(); if(now-dernierTap<300 && e.changedTouches.length===1){ const r=carte.getBoundingClientRect(), c=e.changedTouches[0], [mn,mx]=bornes(), t=+svg.getAttribute("width"); fixer(t>mn*1.5 ? mn : mn*2.2, c.clientX-r.left, c.clientY-r.top); sauver(); dernierTap=0; } else dernierTap=now; });
  demarrerCalque(carte, svg);
  const lb = $("luneBtn"); if(IMG){ carte.appendChild(lb); const place=()=>{ const t=+svg.getAttribute("width")||0; const oy=t*CARTE.OY/CARTE.w; lb.style.left=(t*.72)+"px"; lb.style.top=((parseFloat(svg.style.marginTop)||0)+oy)+"px"; lb.style.width=(t*.22)+"px"; lb.style.height=(t*.14)+"px"; }; place(); apresTaille.push(place); }
  v.insertAdjacentHTML("beforeend", `<div class="legende"><span>Touche les terres pour le potager, l'étang pour la mare, une pierre plate pour bâtir.</span></div>`);
  cleVillage = "";
}
const IMGS_OK = {}, IMGS_KO = {};
function choisirImage(el, candidats){ // essaie les images dans l'ordre, garde la première qui existe (résultats mémorisés)
  const essai = i => { if(i>=candidats.length) return; const n=candidats[i]; if(IMGS_KO[n]) return essai(i+1);
    if(IMGS_OK[n]){ if(el.getAttribute("href")!==`img/${n}.webp`) el.setAttribute("href",`img/${n}.webp`); return; }
    const t=new Image(); t.onload=()=>{ IMGS_OK[n]=1; if(el.getAttribute("href")!==`img/${n}.webp`) el.setAttribute("href",`img/${n}.webp`); }; t.onerror=()=>{ IMGS_KO[n]=1; essai(i+1); }; t.src=`img/${n}.webp`; };
  essai(0);
}
function zoneOuverte(id){ const z=zoneDef(id), c=ctx(); try{ return !z.ouvrir || z.ouvrir(c); }catch(e){ return false; } }
function rendreVillage(){
  if(!carteFaite) construireCarte();
  const ch = etat.village.chantier, now = Date.now();
  const soleilLeve = estSoleilLeve();
  const vis = etat.ville.lettres.find(l=>l.enPersonne), fete = feteActive();
  const cle = JSON.stringify([Object.keys(etat.objets||{}), Object.keys(etat.postes||{}), Object.keys(etat.village.batis), ch && ch.id, ch && Math.floor((now-ch.debut)/60000), PHASE.id, TEMPSID, soleilLeve, vis && vis.id, fete, etat.ville.lettres.map(l=>l.id+(l.vue?"v":"")+(aTout(l.items)?"p":"")).join(), Object.keys(etat.ville.lus).length, Object.keys(etat.ville.chapitres).length]);
  if(cle===cleVillage){ rendreSeuil(); return; } cleVillage = cle;   // le résumé suit les pots à chaque instant (il ne se réécrit que s'il change)
  { const {w,h} = CARTE, g = $("village").querySelector("#passant");
    if(vis){ const p = pnjDe(vis.pnj), T = w*.13; g.innerHTML = `<circle cx="${w*.47}" cy="${h*.86}" r="${w*.05}" fill="#f4d58a" opacity=".25"><animate attributeName="r" values="${w*.045};${w*.06};${w*.045}" dur="2.4s" repeatCount="indefinite"/></circle>` + (IMG ? `<image href="img/pnj-${p.id}.webp" x="${w*.47-T/2}" y="${h*.89-T}" width="${T}" height="${T}"></image>` : `<text x="${w*.47}" y="${h*.88}" font-size="${w*.06}" text-anchor="middle">${p.emoji}</text>`) + `<circle cx="${w*.505}" cy="${h*.80}" r="${w*.012}" fill="#f4d58a"/><text x="${w*.505}" y="${h*.806}" font-size="${w*.016}" text-anchor="middle" font-weight="700" fill="#141a2e">!</text>`; g.setAttribute("aria-label", `${p.nom} attend près du sentier`); g.setAttribute("role","button"); }
    else g.innerHTML = "";
    const fg = $("village").querySelector("#fete");
    if(fete==="citrouilles"){ const sombre = PHASE.phase==="nuit"||PHASE.phase==="crepuscule";
      // quelques lanternes posées dans l'herbe, par petits groupes : au départ du sentier, près de la cabane, au bord des terres
      const pos = [[.415,.80,1],[.455,.815,.8],[.565,.70,.9],[.44,.62,.85],[.33,.47,.8],[.36,.475,.65]];
      fg.innerHTML = pos.map(([x,y,k])=>{ const T=w*.05*k, cx=w*x, cy=h*y;
        const halo = sombre ? `<circle cx="${cx}" cy="${cy-T*.35}" r="${T*1.1}" fill="url(#haloCitr)"/>` : "";
        return halo + (IMG ? `<image href="img/denree-lanterne.webp" x="${cx-T/2}" y="${cy-T*.85}" width="${T}" height="${T}" ${sombre?"":"opacity=\".95\""}></image>` : `<text x="${cx}" y="${cy}" font-size="${T*.8}" text-anchor="middle">🎃</text>`); }).join("")
        + `<defs><radialGradient id="haloCitr"><stop offset="0" stop-color="#ffb75a" stop-opacity=".55"/><stop offset="1" stop-color="#ffb75a" stop-opacity="0"/></radialGradient></defs>`; }
    else fg.innerHTML = ""; }
  // les objets fabriqués à l'atelier se posent sur la carte
  { const {w,h} = CARTE, og = $("village").querySelector("#objetsCarte"), PL = {banc:[.43,.47,.075], lanterne:[.43,.9,.06], nichoir:[.79,.24,.06], tonneau:[.585,.62,.055]};
    if(og) og.innerHTML = OBJETS.filter(o=>etat.objets[o.id] && PL[o.id]).map(o=>{ const [x,y,k]=PL[o.id], T=w*k;
      return IMG ? `<image href="img/objet-${o.id}.webp" x="${w*x-T/2}" y="${h*y-T*.8}" width="${T}" height="${T}"></image>` : `<text x="${w*x}" y="${h*y}" font-size="${T*.8}" text-anchor="middle">${o.emoji}</text>`; }).join(""); }
  for(const b of BATIMENTS){
    const g = $("village").querySelector(`.slot[data-b="${b.id}"]`); if(!g) continue;
    const fini = bati(b.id), enCours = ch && ch.id===b.id;
    const T = IMG ? 300 : 160, bimg = n => `<image href="img/${n}.webp" x="${-T/2}" y="${-T*.68}" width="${T}" height="${T}" onerror="this.outerHTML='<text y=&quot;0&quot; font-size=&quot;120&quot; text-anchor=&quot;middle&quot;>${b.emoji}</text>'"></image>`;
    if(fini) g.innerHTML = IMG ? bimg(`bat-${b.id}`) : dessinBatiment(b,true);
    else if(enCours){ const p=Math.min(1,(now-ch.debut)/(ch.fin-ch.debut)); g.innerHTML = (IMG ? bimg(`bat-${b.id}-chantier`) : dessinBatiment(b,false)) + `<rect x="-40" y="${T*.32}" width="80" height="8" rx="4" fill="#3a3150"/><rect x="-40" y="${T*.32}" width="${80*p}" height="8" rx="4" fill="#f4d58a"/>`; }
    else g.innerHTML = `<ellipse rx="40" ry="18" fill="#55496b" opacity="${IMG?.3:.6}"/><ellipse rx="28" ry="11" fill="${IMG?"rgba(58,49,80,.5)":"#3a3150"}" stroke="#e8dcc0" stroke-width="3" stroke-dasharray="7 6"/>`;
    g.classList.toggle("vide", !fini && !enCours);
  }
  // les postes des apprentis installés (illustration si elle existe, sinon un repère)
  for(const e of ETALS.filter(x=>x.apprenti)){
    const g = $("village").querySelector(`.slot[data-p="${e.id}"]`); if(!g) continue;
    if(!posteDe(e.id)){ g.innerHTML = ""; continue; }
    const T = 260; g.innerHTML = `<ellipse rx="70" ry="26" fill="#55496b" opacity=".25"/><text y="22" font-size="90" text-anchor="middle">${e.apprenti.emoji}</text>` + (IMG ? `<image href="img/poste-${e.id}.webp" x="${-T/2}" y="${-T*.68}" width="${T}" height="${T}" onload="this.previousElementSibling.remove()"></image>` : "");
  }
  const teinte = $("village").querySelector("#teinte");
  if(IMG){
    const ci = $("village").querySelector("#carteImg");
    // image par temps et moment si elle existe (carte-village-<temps>-<moment>, puis carte-village-<temps>), sinon jour/nuit/pluie + teinte
    // la carte de jour dès que le soleil est levé, celle de nuit dès qu'il est couché ; l'aube et le soir ne font que teinter
    const base = PLUIE ? "carte-village-pluie" : soleilLeve ? "carte-village-jour" : "carte-village";
    const candidats = [`carte-village-${TEMPSID}-${PHASE.id}`, `carte-village-${TEMPSID}`, base];
    choisirImage(ci, candidats);
    const [col, op] = PHASE.teinte; const gris = TEMPSID==="nuageux" ? .14 : TEMPSID==="brume" ? .22 : TEMPSID==="tempete" ? .18 : 0;
    if(TEMPSID==="tempete"){ teinte.setAttribute("opacity", .3 + op*.4); teinte.setAttribute("fill", "#232a3a"); }
    else { teinte.setAttribute("opacity", Math.min(.6, op + gris)); teinte.setAttribute("fill", gris && !op ? (TEMPSID==="brume" ? "#c9d2dc" : "#2a3140") : col); }
  } else {
    const op = PHASE.id==="nuit" ? .35 : PHASE.id==="crepuscule" ? .22 : PHASE.id==="aube" ? .12 : 0;
    teinte.setAttribute("opacity", PLUIE ? op+.15 : op); teinte.setAttribute("fill", PLUIE ? "#0d1220" : "#141a2e");
  }
  rendreSeuil();
}
function rendreSeuil(){
  const s = $("seuil"); const plein = fx().seuil;
  if(!plein){ if(!s.hidden) s.hidden = true; return; }   // sans panneau d'affichage, la carte reste nue
  const ch = etat.village.chantier, lignes=[];
  if(plein) for(const z of ZONES){ const pots=etat.zones[z.id].pots, prets=pots.filter(p=>p.plante && PLANTES[p.plante] && p.age>=PLANTES[p.plante].duree).length, soif=pots.filter(p=>p.plante && besoin(PLANTES[p.plante])==="rosee" && p.eau<=0 && p.age<PLANTES[p.plante].duree).length, v=etat.zones[z.id].visiteur;
    const part=[]; if(prets) part.push(`${prets} à récolter`); if(soif) part.push(`${soif} qui ${soif>1?"ont":"a"} soif`); if(v){ const d=VISITEURS.find(x=>x.id===v.id); if(d) part.push(`${d.nom} est là`); }
    lignes.push(`<span>${z.emoji} <b>${z.nom}</b> · ${part.length?part.join(", "):"rien à faire"}</span>`); }
  if(ch && plein){ const b=BATIMENTS.find(x=>x.id===ch.id); lignes.push(`<span>🔨 <b>${b.nom}</b> · fin dans ${duree(Math.max(0,(ch.fin-Date.now())/1000))}</span>`); }
  const dem = HABITANTS.filter(h=>demandeActive(h)).map((h,i)=>i ? h.nom.charAt(0).toLowerCase()+h.nom.slice(1) : h.nom); if(dem.length) lignes.push(`<span>💬 ${dem.join(", ")} ${dem.length>1?"demandent":"demande"} quelque chose</span>`);
  const lt = etat.ville.lettres.filter(l=>!l.enPersonne), pr = lt.filter(l=>aTout(l.items)).length, vis = etat.ville.lettres.find(l=>l.enPersonne);
  const nv = lt.filter(l=>!l.vue).length, chp = CHAPITRES.filter(c=>etat.ville.chapitres[c.id] && !etat.ville.lus[c.id]).length, part=[];
  if(nv) part.push(`<b>${nv} nouvelle${nv>1?"s":""} lettre${nv>1?"s":""}</b>`); if(pr) part.push(`${pr} prête${pr>1?"s":""} à livrer`); if(chp) part.push(`une lettre de l'histoire à lire`);
  if(part.length) lignes.push(`<span>✉️ ${part.join(" · ")}</span>`);
  if(vis) lignes.push(`<span>👋 <b>${pnjDe(vis.pnj).nom}</b> attend près du sentier</span>`);
  if(etat.cabane){ const c=etat.cabane, t=c.travaux[0], ab=aReparer().length, nonLus=LIVRES.filter(l=>c.livres[l.id] && !c.livres[l.id].defauts.length && !c.lus[l.id]).length, part=[];
    if(t) part.push(c.travaux.length>1 ? `${c.travaux.length} ateliers au travail` : `atelier : encore ${duree(Math.max(60, t.reste/(amC("presse")?2:1)))}`); const abL = aReparer().filter(id=>!c.travaux.some(x=>x.livre===id)).length; if(abL) part.push(`${abL} livre${abL>1?"s":""} à réparer`);
    if(nonLus) part.push(`<b>${nonLus} à lire</b>`);
    if(part.length) lignes.push(`<span>🛖 <b>Cabane</b> · ${part.join(", ")}</span>`); }
  // ne toucher au bandeau que s'il change : le réécrire à chaque seconde le faisait clignoter
  const html = lignes.join(""); if(s.dataset.html!==html){ s.dataset.html = html; s.innerHTML = html; } if(s.hidden !== !lignes.length) s.hidden = !lignes.length;
}
function ouvrirBatiment(id){
  if(id==="cabane" && bati("cabane")) return ouvrirCabane();
  const b = BATIMENTS.find(x=>x.id===id), ch = etat.village.chantier, fini = bati(id), enCours = ch && ch.id===id;
  let corps = `<p class="intro">${b.texte}</p>`;
  if(fini) corps += `<div class="regle"><b>Terminé</b><small class="histoire">${b.histoire}</small></div>`;
  else if(enCours) corps += `<div class="regle"><b>En chantier</b><small>Fin dans ${duree(Math.max(0,(ch.fin-Date.now())/1000))}. ${TEXTES.chantierUn}</small></div>`;
  else { const mq = manqueBatiment(b);
    corps += `<div class="regle"><b>${b.jours} jour${b.jours>1?"s":""} de chantier</b><div class="besoins">${besoinsBatiment(b)}</div><small>${ch ? "Un chantier est déjà en cours : "+BATIMENTS.find(x=>x.id===ch.id).nom+"." : mq.length ? `Il te manque : ${mq.join(", ")}. Les matériaux et les outils s'achètent aux étals du marché (Comptoir).` : "Tu as tout ce qu'il faut."}</small></div>` +
    `<button class="fermer" id="lancer" ${(ch || mq.length) ? "disabled" : ""}>Lancer le chantier</button>`; }
  const c = ouvrirPanneau(`<h2>${b.emoji} ${b.nom}</h2><div class="corps">${corps}</div>`);
  const l = $("lancer"); if(l) l.addEventListener("click", ()=>{ lancerChantier(b); c.hidden=true; });
}
// ce qu'un bâtiment demande : or, matériaux, outils (les outils servent, ils ne s'usent pas)
function besoinsBatiment(b){
  const t = [`<span class="besoin ${etat.or>=b.prix?"ok":""}">🪙 ${etat.or}/${b.prix}</span>`];
  for(const k in (b.materiaux||{})) t.push(`<span class="besoin ${(etat.matieres[k]||0)>=b.materiaux[k]?"ok":""}">${MATIERES[k].emoji} ${etat.matieres[k]||0}/${b.materiaux[k]} ${plur(MATIERES[k].nom, b.materiaux[k])}</span>`);
  for(const k of (b.outils||[])) t.push(`<span class="besoin ${(etat.matieres[k]||0)>0?"ok":""}">${MATIERES[k].emoji} ${MATIERES[k].nom.toLowerCase()}</span>`);
  return t.join(" ");
}
function manqueBatiment(b){
  const m = []; if(etat.or<b.prix) m.push(`${b.prix-etat.or} 🪙`);
  for(const k in (b.materiaux||{})){ const x = b.materiaux[k]-(etat.matieres[k]||0); if(x>0) m.push(`${x} ${plur(MATIERES[k].nom, x)}`); }
  for(const k of (b.outils||[])) if(!(etat.matieres[k]>0)) m.push(`${MATIERES[k].g==="f"?"une":"un"} ${MATIERES[k].nom.toLowerCase()}`);
  return m;
}
/* ---------- la cabane : l'atelier de reliure ----------
   etat.cabane = {livres:{id:{defauts:[...], recu, offert}}, travaux:[{livre, defaut, reste}], ameli:{id:1}, lus:{id:1}} */
const LIVRES = CONTENU.LIVRES, DEFAUTS = CONTENU.DEFAUTS_LIVRE, AMC = CONTENU.AMELIO_CABANE;
const cab = () => (etat.cabane = etat.cabane || {livres:{}, travaux:[], ameli:{}, lus:{}});
const amC = id => !!(etat.cabane && etat.cabane.ameli[id]);
const livreDef = id => LIVRES.find(l=>l.id===id);
// couture, presse et bassine demandent tes mains : une seule à la fois ; le séchoir travaille seul (trois places avec le grand séchoir)
const placeLibre = k => { const c = cab(); if(DEFAUTS[k].passif) return c.travaux.filter(t=>t.defaut===k).length < (amC("etabli2") ? 3 : 1); return !c.travaux.some(t=>!DEFAUTS[t.defaut].passif); };
const mainsPrises = () => { const t = cab().travaux.find(x=>!DEFAUTS[x.defaut].passif); return t ? DEFAUTS[t.defaut] : null; };
const aReparer = () => Object.keys(cab().livres).filter(id=>cab().livres[id].defauts.length);
function nomBesoin(k){ return MATIERES[k] ? MATIERES[k].nom.toLowerCase() : defObjet(k).nom.toLowerCase(); }
function besoinTxt(b){ const k=Object.keys(b); return k.length ? k.map(x=>`${b[x]} ${plur(nomBesoin(x), b[x])}`).join(", ") : "rien que du temps"; }
// le premier livre attend sous l'établi dès que la cabane est là
function initCabane(){
  if(!bati("cabane") || etat.cabane) return;
  const c = cab(), l = LIVRES.find(x=>x.premier); c.livres[l.id] = {defauts:["tache"], total:1, recu:Date.now()};
  annoncer(`Sous l'établi de la cabane, un vieux livre abîmé : « ${l.titre} ». Touche la cabane sur la carte pour entrer : tu peux le réparer.`);
}
// un livre abandonné, rapporté par une bête ; les carnets d'Odile arrivent dans l'ordre
function apporterLivre(){
  const c = cab(), pris = id => !!c.livres[id];
  const suiteMin = Math.min(...LIVRES.filter(l=>l.suite && !pris(l.id)).map(l=>l.suite));
  const dispo = LIVRES.filter(l=>!pris(l.id) && (!l.suite || l.suite===suiteMin));
  if(!dispo.length) return null;
  const l = hasard(dispo), types = Object.keys(DEFAUTS).sort(()=>Math.random()-.5);
  const n = l.suite ? 2 + Math.floor(Math.random()*2) : 1 + Math.floor(Math.random()*3);
  c.livres[l.id] = {defauts:types.slice(0, n), total:n, recu:Date.now()};
  return l;
}
// l'établi travaille ; sans lampe, il se repose quand le soleil est couché
function relier(dt, jour){
  const c = etat.cabane; if(!c || !c.travaux.length) return;
  if(!jour && !amC("lampe")) return;
  const v = amC("presse") ? 2 : 1;
  for(const t of c.travaux.slice()){
    t.reste -= dt*v; if(t.reste>0) continue;
    c.travaux = c.travaux.filter(x=>x!==t);
    const l = c.livres[t.livre], d = livreDef(t.livre); if(!l || !d) continue;
    l.defauts = l.defauts.filter(x=>x!==t.defaut);
    annoncer(l.defauts.length ? `« ${d.titre} » : ${DEFAUTS[t.defaut].nom.toLowerCase()}, c'est réparé. Il reste ${l.defauts.length} défaut${l.defauts.length>1?"s":""}.` : `« ${d.titre} » est réparé. Il rejoint l'étagère de la cabane : tu peux le lire.`);
    if(!l.defauts.length) tinter(523), tinter(659,.12), tinter(784,.24);
  }
}
const FEM = ["grenouille","abeille","coccinelle","chauvesouris","libellule","carpe"];
const articleVisiteur = v => { const n = v.nom.toLowerCase(); return /^[aeiouyéè]/.test(n) && v.id!=="heron" && v.id!=="herisson" ? "l'"+n : (FEM.includes(v.id)?"la ":"le ")+n; };
// un livre arrive : on le voit, avec ce qu'il a, et on peut aller tout de suite à la cabane
function montrerLivre(l, par){
  const x = cab().livres[l.id]; if(!x) return;
  audio.effet("papier"); tinter(523); tinter(659,.15); tinter(784,.3);
  const p = ouvrirPanneau(`<h2>📖 Un livre sur le seuil</h2><div class="corps"><div class="livreArrive">${couv(l, "grande")}<div><b>${l.titre}</b><small>${l.genre}${par?` · rapporté par ${articleVisiteur(par)}`:""}</small></div></div>
    <p class="intro">Il a pris l'eau et la poussière du bois. Pour le lire, il faut d'abord le réparer :</p>
    ${x.defauts.map(k=>`<div class="regle"><b>${DEFAUTS[k].emoji} ${DEFAUTS[k].nom}</b><small>${DEFAUTS[k].atelier} · ${besoinTxt(DEFAUTS[k].besoin)}</small></div>`).join("")}
    <button class="fermer" id="versCabane">Aller à la cabane</button></div>`);
  $("versCabane").addEventListener("click", ouvrirCabane);
}
function lancerReparation(id, def){
  const c = cab(), l = c.livres[id], D = DEFAUTS[def]; if(!l || !D || !l.defauts.includes(def)) return;
  if(!placeLibre(def)){ const m = mainsPrises(); dire(D.passif ? "Le séchoir est plein." : `Tu as déjà les mains prises : ${m.atelier.charAt(0).toLowerCase()+m.atelier.slice(1)}. Le séchoir, lui, est libre.`); return; }
  if(c.travaux.some(t=>t.livre===id)){ dire("Ce livre est déjà à un atelier."); return; }
  for(const k in D.besoin) if(qte(k)<D.besoin[k]){ dire(`Il te faut ${besoinTxt(D.besoin)}.`); return; }
  for(const k in D.besoin) retirer(k, D.besoin[k]);
  c.travaux.push({livre:id, defaut:def, reste:D.duree});
  dire(`${D.atelier} : « ${livreDef(id).titre} ». ${D.geste}.`); tinter(392); tinter(494,.12);
  sauver(); rendre(); ouvrirCabane();
}
function lireLivre(id){
  const c = cab(), d = livreDef(id); if(!d || !c.livres[id] || c.livres[id].defauts.length) return;
  let gain = "";
  if(!c.lus[id]){ c.lus[id] = 1;
    if(d.don && d.don.recette){ const r = RECETTES.find(x=>x.id===d.don.recette); if(r && !etat.recettes[r.id]){ etat.recettes[r.id]=1; gain = `Tu as appris une recette : ${DENREES[r.id].nom.toLowerCase()}. Elle t'attend à l'atelier.`; } else { gagnerLunes(3); gain = "Tu connaissais déjà cette recette : +3 🌙."; } }
    if(d.don && d.don.graine){ etat.graines += d.don.graine; gain = "Une graine de fleur de lune : elle t'attend dans la barre du potager."; }
    if(d.don && d.don.lunes){ gagnerLunes(d.don.lunes); gain = `+${d.don.lunes} 🌙`; }
    evenement({type:"livre", id}); sauver(); rendre();
  }
  const lebrun = pnjDispo().some(p=>p.id==="lebrun"), livre = c.livres[id];
  const p = ouvrirPanneau(`<h2>📖 ${d.titre}</h2><div class="corps"><p class="intro">${d.genre}</p><div class="livreTexte">${d.texte.split("\n").map(x=>`<p>${x}</p>`).join("")}</div>${gain?`<div class="regle"><b>Entre les pages</b><small>${gain}</small></div>`:""}
    ${lebrun ? (livre.offert ? `<p class="intro">Prêté à la bibliothèque de l'école. M. Lebrun en prend soin.</p>` : `<button class="choix" id="offrirLivre">Le prêter à l'école de M. Lebrun</button>`) : ""}
    <button class="choix" id="retourCabane">Retour à la cabane</button></div>`);
  const o = $("offrirLivre"); if(o) o.addEventListener("click", ()=>{ livre.offert = "lebrun"; gagnerOr(30); gagnerLunes(2); sauver(); rendre(); dire(`M. Lebrun : « Les enfants vont l'adorer. Je vous le rendrai en meilleur état qu'il n'est parti. » +30 🪙 +2 🌙.`); lireLivre(id); });
  $("retourCabane").addEventListener("click", ouvrirCabane);
}
function ameliorerCabane(id){
  const a = AMC.find(x=>x.id===id); if(!a || amC(id) || manqueBatiment(a).length) return;
  etat.or -= a.prix; for(const k in a.materiaux) etat.matieres[k] -= a.materiaux[k]; cab().ameli[id] = 1;
  dire(`${a.nom} dans la cabane. ${a.effet}`); tinter(523); tinter(659,.12); tinter(784,.24);
  sauver(); rendre(); ouvrirCabane();
}
const couv = (d, cls="") => `<span class="couv ${cls}" style="--c:${d.couleur}"></span>`;
function ouvrirCabane(){
  const c = cab(), jour = estSoleilLeve(), repos = !jour && !amC("lampe");
  const carteTravail = t=>{ const d=livreDef(t.livre), D=DEFAUTS[t.defaut], v=amC("presse")?2:1, pc=Math.max(0, Math.min(100, Math.round(100*(1-t.reste/D.duree))));
    const L = c.livres[t.livre], n = Math.max(L.total||0, L.defauts.length), k = n - L.defauts.length + 1;
    return `<div class="article">${couv(d)}<div><b>${d.titre}</b><small>Étape ${k}/${n} · ${D.geste} · ${repos?"l'établi se repose jusqu'au matin":"encore "+duree(Math.max(60,t.reste/v))}</small><span class="jauge"><i style="width:${pc}%"></i></span></div></div>`; };
  const ateliers = Object.keys(DEFAUTS).map(k=>{ const D=DEFAUTS[k], ts=c.travaux.filter(t=>t.defaut===k);
    const m = mainsPrises(), attente = !D.passif && m && !ts.length ? `<small>Attend : tu travailles à ${m.atelier.charAt(0).toLowerCase()+m.atelier.slice(1)}.</small>` : `<small>Libre.${D.passif?" Il travaille seul, même pendant que tu fais autre chose.":""}</small>`;
    return `<div class="atelierReliure"><b>${D.emoji} ${D.atelier}</b>${ts.length ? ts.map(carteTravail).join("") : attente}</div>`; }).join("");
  const libre = k => placeLibre(k);
  const enAttente = aReparer().filter(id=>!c.travaux.some(t=>t.livre===id));   // un livre sur l'établi n'est plus « à réparer »
  const abimes = enAttente.map(id=>{ const d=livreDef(id), l=c.livres[id], enCours=c.travaux.some(t=>t.livre===id);
    return `<div class="livreAbime">${couv(d)}<div><b>${d.titre}</b><small>${d.genre}${enCours?" · sur l'établi":""}</small>${l.defauts.map(k=>{ const D=DEFAUTS[k], ok=Object.keys(D.besoin).every(x=>qte(x)>=D.besoin[x]);
      return `<div class="defaut"><span><b>${D.nom}</b><small>${D.emoji} ${D.geste} · ${besoinTxt(D.besoin)} · ${duree(D.duree/(amC("presse")?2:1))}</small></span><button data-reparer="${id}" data-def="${k}" ${(!libre(k)||enCours||!ok)?"disabled":""}>${libre(k)?"Réparer":DEFAUTS[k].passif?"Plein":"Mains prises"}</button></div>`; }).join("")}</div></div>`; }).join("");
  const repares = LIVRES.filter(l=>c.livres[l.id] && !c.livres[l.id].defauts.length);
  const dos = LIVRES.map(l=>{ const x=c.livres[l.id]; if(x && !x.defauts.length) return `<button class="dos" style="--c:${l.couleur}" data-lire="${l.id}" aria-label="${l.titre}"><span>${l.titre}</span>${c.lus[l.id]?"":"<i></i>"}</button>`; return `<span class="dos vide"></span>`; });
  const etagere = [0,10].map(i=>`<div class="etagere">${dos.slice(i,i+10).join("")}</div>`).join("");
  const ameli = AMC.map(a=>amC(a.id) ? `<div class="regle"><b>✓ ${a.nom}</b><small>${a.effet}</small></div>` : `<div class="regle"><b>${a.nom}</b><small>${a.effet}</small><div class="besoins">${besoinsBatiment(a)}</div><button class="choix" data-ameli="${a.id}" ${manqueBatiment(a).length?"disabled":""}>Installer</button></div>`).join("");
  const html = `<h2>🛖 La cabane</h2><div class="corps">${IMG?`<img class="cabaneImg" src="img/cabane-interieur-${jour?"jour":"nuit"}.webp" alt="" onerror="this.remove()">`:""}
    <p class="intro">Quatre petits ateliers, une cheminée, une étagère. Les bêtes du bois rapportent parfois des livres abandonnés ; ici, on les répare. Coudre, coller, nettoyer : une chose à la fois. Le séchoir, lui, travaille pendant ce temps.</p>
    ${!etat.boiteTrouvee && !etat.ville.chapitres.boite && etat.ville.chapitres.ruelle ? `<div class="plancher"><h3>Le plancher</h3><p class="intro">Mme Ruelle parlait d'une boîte, sous le plancher d'une cabane. Odile comptait toujours à partir de la cheminée.</p><div class="planches">${[1,2,3,4,5,6].map(i=>`<button class="planche" data-planche="${i}" aria-label="Planche ${i}"></button>`).join("")}</div><small class="intro">la cheminée ← → la fenêtre</small></div>` : ""}
    <h3>À réparer <small>${enAttente.length}</small></h3>${abimes || `<p class="intro">${c.travaux.length ? "Rien d'autre à réparer." : "Rien à réparer."} Salue les visiteurs : il arrive qu'ils laissent un livre sur le seuil.</p>`}
    <h3>Les ateliers</h3>${repos && c.travaux.length ? `<p class="intro">La nuit, les ateliers se reposent. Une lampe de travail permettrait de continuer.</p>` : ""}${ateliers}
    <h3>L'étagère <small>${repares.length}/${LIVRES.length}</small></h3>${etagere}
    <h3>Améliorer la cabane</h3>${ameli}</div>`;
  const pn = $("panneau"), page = pn.querySelector(".page");
  if(!pn.hidden && page && page.dataset.vue==="cabane"){ const y = page.scrollTop; page.innerHTML = `<button class="fermerHaut" id="fermerPanneau" aria-label="Fermer">✕</button>` + html; $("fermerPanneau").addEventListener("click",()=>{pn.hidden=true;}); page.scrollTop = y; }
  else { ouvrirPanneau(html); pn.querySelector(".page").dataset.vue = "cabane"; }
  pn.querySelectorAll("[data-reparer]").forEach(b=>b.addEventListener("click",()=>lancerReparation(b.dataset.reparer, b.dataset.def)));
  pn.querySelectorAll("[data-lire]").forEach(b=>b.addEventListener("click",()=>lireLivre(b.dataset.lire)));
  pn.querySelectorAll("[data-ameli]").forEach(b=>b.addEventListener("click",()=>ameliorerCabane(b.dataset.ameli)));
  pn.querySelectorAll("[data-planche]").forEach(b=>b.addEventListener("click",()=>{
    if(b.dataset.planche!=="3"){ b.classList.add("tapee"); dire(hasard(["Une planche bien clouée. Rien dessous.","Elle ne bouge pas.","Un peu de poussière, c'est tout.","Elle grince, mais elle tient."])); tinter(220); return; }
    etat.boiteTrouvee = 1; sauver(); tinter(392); tinter(523,.15); tinter(659,.3);
    dire("La troisième planche bouge. Dessous, une boîte à biscuits en fer…"); majCourrier(0);
    setTimeout(()=>{ if(etat.ville.chapitres.boite) lireChapitre("boite"); else ouvrirCabane(); }, 900);
  }));
}
setInterval(()=>{ const pn=$("panneau"), page=pn && pn.querySelector(".page"); if(pn && !pn.hidden && page && page.dataset.vue==="cabane" && !document.hidden) ouvrirCabane(); }, 20000);
function lancerChantier(b){
  if(etat.village.chantier || manqueBatiment(b).length || bati(b.id)) return;
  etat.or -= b.prix; for(const k in (b.materiaux||{})) etat.matieres[k] -= b.materiaux[k]; const now=Date.now();
  etat.village.chantier = {id:b.id, debut:now, fin:now + b.jours*86400000};
  dire(`${b.nom} : le chantier commence. Fin dans ${b.jours} jour${b.jours>1?"s":""}.`); tinter(392); tinter(494,.12); tinter(587,.24);
  cleVillage=""; evenement({type:"chantier", id:b.id}); sauver(); rendre(); rendreBarre();
}
function majChantier(){
  const ch = etat.village.chantier; if(!ch || Date.now()<ch.fin) return;
  const b = BATIMENTS.find(x=>x.id===ch.id);
  etat.village.batis[ch.id] = ch.fin; etat.village.chantier = null; cleVillage="";
  if(b){ annoncer(`${b.nom} est ${b.id==="ruche"||b.id==="serre"||b.id==="cabane"||b.id==="lanterne"?"terminée":"terminé"}. ${b.histoire}`); [523,659,784,1047].forEach((f,i)=>tinter(f,i*.15)); }
  evenement({type:"bati", id:ch.id}); rendreNav(); rendreBarre();
}

/* calque météo par-dessus la carte : nuages, brume, pluie, éclairs */
function demarrerCalque(carte, svg){
  const cv = carte.querySelector("#calque"), c2 = cv.getContext("2d"); let nuages=[], gouttes=[], eclair=0;
  // tailles arrondies : une largeur fractionnaire (412,5 px) ne tient pas dans un canvas, et la comparer telle quelle
  // relançait taille() à chaque image, donc des nuages redessinés au hasard 60 fois par seconde (le « clignotement »)
  const taille = ()=>{ const t=Math.round(+svg.getAttribute("width")||600), th=Math.round(+svg.getAttribute("height")||t); cv.width=t; cv.height=th; cv.style.width=t+"px"; cv.style.height=th+"px"; nuages=Array.from({length:7},(_,i)=>({x:Math.random()*t,y:t*(.02+Math.random()*.18),r:t*(.08+Math.random()*.1),v:t*(.002+Math.random()*.002)})); gouttes=Array.from({length:220},()=>({x:Math.random()*t,y:Math.random()*th,l:t*.012,v:t*.012})); };
  taille(); addEventListener("resize", ()=>setTimeout(taille,60));
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let avant = 0;   // vitesse des nuages : en largeur de carte par seconde, quatre à huit minutes pour la traverser
  function boucle(ts){
    if(!cv.isConnected) return;
    const dt = avant ? Math.min(.1, (ts-avant)/1000) : 0; avant = ts;   // au temps réel, pas à l'image (60 ou 120 Hz)
    const tv=Math.round(+svg.getAttribute("width")||600); if(Math.abs(cv.width-tv)>1) taille();
    const t=cv.width, th=cv.height; c2.clearRect(0,0,t,th);
    if(TEMPSID==="nuageux" || TEMPSID==="tempete"){
      c2.fillStyle = TEMPSID==="tempete" ? "rgba(20,24,34,.55)" : (nuit() ? "rgba(40,46,60,.45)" : "rgba(235,238,242,.5)");
      for(const n of nuages){ if(!reduit){ n.x += n.v*dt*(TEMPSID==="tempete"?4:1); if(n.x-n.r*2>t) n.x=-n.r*2; }
        for(const [dx,dy,k] of [[0,0,1],[-.9,.25,.7],[.9,.3,.75],[.3,-.2,.6]]) { c2.beginPath(); c2.ellipse(n.x+dx*n.r,n.y+dy*n.r,n.r*k*1.5,n.r*k,0,0,7); c2.fill(); } }
    }
    if(TEMPSID==="brume"){ const g=c2.createLinearGradient(0,th*.3,0,th); g.addColorStop(0,"rgba(200,210,222,0)"); g.addColorStop(1,"rgba(200,210,222,.45)"); c2.fillStyle=g; c2.fillRect(0,0,t,th); }
    if(PLUIE){ c2.strokeStyle = TEMPSID==="tempete" ? "rgba(200,220,240,.55)" : "rgba(134,184,230,.45)"; c2.lineWidth=Math.max(1,t*.0015); c2.lineCap="round";
      const pente = TEMPSID==="tempete" ? .45 : .12;
      for(const g of gouttes){ c2.beginPath(); c2.moveTo(g.x,g.y); c2.lineTo(g.x-g.l*pente,g.y+g.l); c2.stroke(); if(!reduit){ g.y+=g.v*(TEMPSID==="tempete"?1.6:1); g.x-=g.v*pente; if(g.y>th){ g.y=-g.l; g.x=Math.random()*t*1.2; } } } }
    if(TEMPSID==="tempete"){ if(eclair>0){ c2.fillStyle=`rgba(255,255,255,${eclair})`; c2.fillRect(0,0,t,th); eclair-=.06; } else if(Math.random()<.004) eclair=.6; }
    if(!reduit) requestAnimationFrame(boucle);
  }
  cv.dataset.boucle = (+cv.dataset.boucle||0) + 1; const moi = cv.dataset.boucle;   // une seule boucle par calque
  const b0 = boucle; boucle = ts => { if(cv.dataset.boucle!==moi) return; b0(ts); };
  requestAnimationFrame(boucle);
}

/* ---------- visiteurs et habitants ---------- */
function majSentier(){
  const z = zoneDef(zoneJeu()), s = $("sentier"), vide = $("sentierVide"), v = etat.zones[z.id].visiteur, c = ctx(null, z.id);
  s.querySelectorAll(".habitant").forEach(e=>{ if(e.dataset.zone!==z.id) e.remove(); });
  for(const h of HABITANTS){
    if(h.zone!==z.id) continue;
    let el = s.querySelector(`.habitant[data-id="${h.id}"]`), ok=habitantPresent(h,c);
    if(ok && !el){ el=document.createElement("button"); el.className="habitant"; el.dataset.id=h.id; el.dataset.zone=z.id; el.innerHTML=`${IMG?im(`habitant-${h.id}`,"dessin"):h.emoji}<i class="bulle" hidden>!</i>`; el.setAttribute("aria-label",h.nom); s.appendChild(el);
      el.addEventListener("click", e=>{ e.stopPropagation(); ouvrirHabitant(h); tinter(440); }); }
    if(el){ const d=demandeActive(h); el.querySelector(".bulle").hidden = !d; el.title = d ? d.but : h.titre; }
  }
  let el = s.querySelector(".visiteur");
  if(!v){
    if(el) el.remove(); vide.hidden=false;
    const hab = HABITANTS.find(h=>h.zone===z.id && habitantPresent(h,c));
    vide.textContent = hab ? hab.sentier : (PLUIE ? z.sentierPluie : z.sentierCalme);
    return;
  }
  vide.hidden=true;
  const d = VISITEURS.find(x=>x.id===v.id);
  if(!d){ etat.zones[z.id].visiteur=null; return; }
  if(!el || el.dataset.id!==d.id){
    if(el) el.remove();
    el = document.createElement("button"); el.className="visiteur"; el.dataset.id=d.id; el.addEventListener("click", saluer); s.appendChild(el);
    el.innerHTML = `<span class="big">${image(d)}</span><span><b>${d.nom}</b><small>Touche pour saluer</small></span><span class="temps"><i></i></span>`;
    el.setAttribute("aria-label",`${d.nom} est là. Toucher pour saluer.`);
  }
  el.querySelector(".temps i").style.width = (100*v.reste/(REGLES.dureeVisite*fx().dureeVisite))+"%";
}
function arrivee(d){
  etat.zones[d.zone].visiteur = {id:d.id, reste:REGLES.dureeVisite*fx().dureeVisite};
  const ailleurs = d.zone!==zoneJeu() || ZONE==="atelier" || ZONE==="cuisine";
  dire(`${d.nom} s'avance${ailleurs ? " ("+zoneDef(d.zone).nom.toLowerCase()+")" : ""}.`); tinter(392); tinter(494,.15); audio.cri(d.id);
}
function saluer(){
  const z = zoneJeu(), v = etat.zones[z].visiteur; if(!v) return;
  const d = VISITEURS.find(x=>x.id===v.id), premiere = !etat.visites[d.id];
  etat.visites[d.id] = (etat.visites[d.id]||0)+1;
  let txt = `${d.nom} ${premiere?"entre dans ton carnet":"te salue"}.`;
  const lunes = (d.don.lunes||0) + fx().bonusLunes;
  if(lunes){ gagnerLunes(lunes); txt += ` +${lunes} lune${lunes>1?"s":""}.`; }
  // les graines de fleur de lune restent rares : au plus une par jour venue des visiteurs, et pas tant qu'on en garde deux
  const auj = new Date().toDateString();
  if(d.don.graine && etat.graines<2 && etat.graineJour!==auj && Math.random()<d.don.graine){ etat.graines++; etat.graineJour=auj; txt += " Une graine de fleur de lune roule à tes pieds."; }
  if(d.don.matiere && Math.random()<d.don.matiere.proba){ const m=d.don.matiere.id; etat.matieres[m]=(etat.matieres[m]||0)+1; txt += ` ${MATIERES[m].emoji} ${MATIERES[m].nom} : +1.`; }
  // parfois, une bête laisse un livre abandonné sur le seuil de la cabane
  let livre = null;
  if(bati("cabane") && aReparer().length<3 && Math.random() < (amC("etageres") ? .14 : .07)) livre = apporterLivre();
  etat.zones[z].visiteur = null; dire(txt); tinter(587); tinter(784,.1); tinter(988,.2);
  evenement({type:"salut", visiteur:d.id, fois:etat.visites[d.id]});
  sauver(); rendre(); rendreBarre();
  if(livre) setTimeout(()=>montrerLivre(livre, d), 900);
}
function rouler(dt){
  const f = fx();
  for(const z of ZONES){
    const zs = etat.zones[z.id];
    if(zs.visiteur){ zs.visiteur.reste -= dt; if(zs.visiteur.reste<=0){ const d=VISITEURS.find(x=>x.id===zs.visiteur.id); zs.visiteur=null; if(d && z.id===zoneJeu()) dire(`${d.nom} s'éloigne sans un bruit.`); } continue; }
    const c = ctx(null, z.id);
    const td = tempsDef();
    for(const d of VISITEURS){ if(d.zone!==z.id) continue; if(td.seuls && !td.seuls.includes(d.id)) continue; let ok=false; try{ ok=d.cond(c); }catch(e){} if(ok && Math.random() < dt*(td.visites||1)/(d.periode*(f.periode[d.id]||1))){ arrivee(d); break; } }
  }
}

/* ---------- temps ---------- */
function pousser(dt, lumiere){
  const vit = fx().vitesse;
  for(const z of ZONES) for(const pot of etat.zones[z.id].pots){
    if(!pot.plante) continue;
    const p = PLANTES[pot.plante]; if(!p){ pot.plante=null; continue; }
    if(pot.age>=p.duree) continue;
    const reste = p.duree - pot.age, b = besoin(p), v = vit[z.id]||1;
    let mouille = 0, sec = 0;
    if(b==="pluie") mouille = dt;
    else if(b==="lumiere") mouille = lumiere ? dt : 0;
    else { mouille = Math.min(pot.eau, dt); pot.eau -= mouille; sec = (dt - mouille)/REGLES.ralentiSoif; }
    mouille *= v; sec *= v;
    mouille = Math.min(mouille, reste); sec = Math.min(sec, reste - mouille);
    pot.age += mouille + sec; pot.sec += sec;
    if(pot.age>=p.duree){ if(p.graine) etat.lunesFleuries++; evenement({type:"fleur", plante:pot.plante, zone:z.id}); }
  }
}
function avancer(dt){
  produire(dt); initCabane();
  // par tranches de 15 min au plus, pour que les plantes de lumière suivent le vrai jour pendant une absence
  let t = Date.now() - dt*1000, reste = dt;
  while(reste > 0){
    const pas = Math.min(900, reste);
    const jour = phaseDe(new Date(t + pas*500)).ciel==="soleil";
    pousser(pas, jour); relier(pas, jour);
    t += pas*1000; reste -= pas;
  }
  const regen = (PLUIE ? REGLES.regenRosee/2 : REGLES.regenRosee) * fx().regenRosee;
  etat.regen += dt;
  while(etat.regen>=regen){ etat.regen-=regen; if(etat.rosee<roseeMax()) etat.rosee++; }
  if(etat.rosee>roseeMax()) etat.rosee=roseeMax();
  if(PLUIE){
    etat.averse += dt;
    if(etat.averse>=REGLES.averse){ etat.averse=0; let n=0;
      for(const z of ZONES) for(const pot of etat.zones[z.id].pots){ const p=pot.plante&&PLANTES[pot.plante]; if(p && besoin(p)==="rosee" && pot.eau<=0 && pot.age<p.duree){ pot.eau=p.soif; n++; } }
      if(n) dire(`Averse. ${n} plante${n>1?"s":""} abreuvée${n>1?"s":""} sans ta rosée.`); }
  }
}
function majPluie(){
  const d = new Date(), t = REGLES.temps(d), ph = phaseDe(d);
  let change = false;
  if(t!==TEMPSID){ TEMPSID=t; PLUIE=tempsDef().pluie; change=true; dire(`Le temps change : ${tempsDef().nom.toLowerCase()}.`); }
  if(ph.id!==PHASE.id){ PHASE=ph; change=true; dire(`${PHASE.nom}. ${PHASE.phrase[TEMPSID]||PHASE.phrase.clair}`); }
  if(change){ rendreMeteo(); rendreBarre(); audio.rafraichir(); }
  if(PHASE.id==="aube"){
    const jour = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    if(etat.aubeJour!==jour){ etat.aubeJour=jour; etat.rosee=roseeMax(); const f=fx(); let m=TEXTES.roseeAube;
      if(f.aubeLunes){ gagnerLunes(f.aubeLunes); m+=` +${f.aubeLunes} lunes.`; }
      for(const ad of f.aubeDenree){ ajouter(ad.id, ad.n); m+=` ${DENREES[ad.id].emoji} ${ad.n} ${DENREES[ad.id].nom.toLowerCase()}s dans le panier.`; }
      for(const am of f.aubeMatiere){ etat.matieres[am.id]=(etat.matieres[am.id]||0)+am.n; m+=` ${MATIERES[am.id].emoji} ${MATIERES[am.id].nom} : +${am.n}.`; }
      annoncer(m); tinter(392); tinter(587,.15); }
  }
}
function tick(){
  const maintenant = Date.now(), dt = Math.min(43200,(maintenant-dernierTick)/1000); dernierTick = maintenant;
  if(dt<=0) return;
  majPluie(); majChantier(); majCourrier(dt); majCuisson(); majDecouvertes();
  document.body.dataset.ciel = estSoleilLeve() ? "jour" : "nuit";
  avancer(dt); if($("panneau").hidden) rouler(Math.min(dt,2));   // pendant une lecture (un panneau ouvert), les visiteurs attendent : personne ne part, personne n'arrive
  evenement(null); sauver(); rendre();
}
function retour(){
  const dt = Math.min(43200,(Date.now()-dernierTick)/1000);
  TEMPSID = REGLES.temps(new Date()); PLUIE = tempsDef().pluie; PHASE = phaseDe(new Date()); rendreMeteo(); rendreNav();
  collecte = []; if(etat.ville.chapitres.boite && !etat.mysteresOdile){ etat.mysteresOdile = 1; etat.mysteres = (etat.mysteres||0) + 2; annoncer("En rangeant la boîte d'Odile, tu trouves au fond deux graines que tu n'avais pas vues : des graines mystères. Elles t'attendent dans la barre du potager."); }
  if(!etat.ville.chapitres.boite) etat.mysteresOdile = 1;
  if(!etat.amitieRattrapee){ etat.amitieRattrapee = 1; for(const h of HABITANTS){ const hs=(etat.habitants||{})[h.id]; if(!hs) continue; const n = (hs.faites||[]).filter(id=>{ const d=h.demandes.find(x=>x.id===id); return d && !d.offrir; }).length; if(n) hs.amitie = Math.min(10, (hs.amitie||0) + 2*n); } }
  if(bati("cabane") && !etat.cabaneFoyer){ etat.cabaneFoyer = 1; annoncer("Ta cabane a maintenant une cheminée : un feu de plus à l'atelier. Et une boîte aux lettres : une lettre de plus chaque matin, qui attend un jour de plus."); } majPluie(); majChantier(); majCourrier(0); majCuisson(); majDecouvertes(); villageois();
  if(dt<120){ const notes=collecte; collecte=null; notes.forEach(dire); tick(); return; }
  const murs = ()=>ZONES.reduce((n,z)=>n+etat.zones[z.id].pots.filter(p=>p.plante && PLANTES[p.plante] && p.age>=PLANTES[p.plante].duree).length,0);
  const avant = murs();
  avancer(dt); for(const z of ZONES) etat.zones[z.id].visiteur=null;
  const prets = murs() - avant;
  const passes = []; let lg = 0;
  for(const z of ZONES){ const c = ctx(null, z.id);
    for(const d of VISITEURS){ if(d.zone!==z.id) continue; let ok=false; try{ ok=d.cond(c); }catch(e){} if(ok && Math.random() < 1-Math.exp(-dt/(d.periode*2))){ etat.visites[d.id]=(etat.visites[d.id]||0)+1; if(d.don.lunes){ const g=Math.max(1,Math.floor(d.don.lunes/2)); gagnerLunes(g); lg+=g; } passes.push(d.nom.toLowerCase()); } } }
  // parfois, quelqu'un laisse quelque chose sur le seuil
  let cadeau = "";
  if(Math.random() < 1-Math.exp(-dt/14400)){
    const r = Math.random();
    if(r<.08 && etat.graines<2){ etat.graines++; cadeau = "une graine de fleur de lune, enveloppée dans une feuille"; }
    else if(r<.4){ ajouter("miel",1); cadeau = "un petit pot de miel, sans étiquette"; }
    else if(r<.65){ ajouter("nacre",1); cadeau = "une nacre, posée bien droite sur la pierre"; }
    else if(r<.85){ const o=5+Math.floor(Math.random()*16); gagnerOr(o); cadeau = `${o} pièces d'or dans un mouchoir noué (Margot, sûrement)`; }
    else { gagnerLunes(3); cadeau = "une plume de chouette. Elle vaut 3 lunes, on ne sait pas pourquoi"; }
  }
  const lignes = [];
  if(prets>0) lignes.push(`🌱 ${prets} plante${prets>1?"s":""} ${prets>1?"sont":"est"} arrivée${prets>1?"s":""} à maturité.`);
  if(passes.length) lignes.push(`🐾 ${passes.join(", ")} ${passes.length>1?"sont passés":"est passé"} te voir${lg?` (+${lg} 🌙)`:""}.`);
  if(cadeau) lignes.push(`🎁 Sur le seuil : ${cadeau}.`);
  collecte.forEach(t=>lignes.push(t)); collecte = null;
  dernierTick = Date.now(); evenement(null); sauver(); rendre(); rendreBarre();
  if(dt>=1200 && lignes.length){
    ouvrirPanneau(`<h2>Pendant ton absence</h2><div class="corps"><p class="intro">${duree(dt)} sont passées à la lisière${dt>=43200?" (au moins)":""}.</p>${lignes.map(l=>`<div class="regle"><small class="absence">${l}</small></div>`).join("")}</div>`);
    dire("Bon retour à la lisière.");
  } else dire(lignes.length ? lignes.join(" ") : `Pendant ton absence (${duree(dt)}), tout est resté calme.`);
}
setInterval(tick, 1000);
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden){ retour(); audio.rafraichir(); MARCHE.dernierSync=0; syncMarche(); } else { sauver(); if(!etat.son.fond) audio.pause(); } });

/* ---------- la lune et le soleil ---------- */
$("luneBtn").addEventListener("click", ()=>{
  if(nuit()){
    etat.tapsLune=(etat.tapsLune||0)+1; tinter(1047);
    if(etat.tapsLune===3) dire(TEXTES.luneTrois);
    evenement({type:"lune", taps:etat.tapsLune});
  } else {
    etat.tapsSoleil=(etat.tapsSoleil||0)+1; tinter(784); dire(TEXTES.soleil);
    evenement({type:"soleil", taps:etat.tapsSoleil});
  }
  sauver();
});

/* ---------- panneaux (carnet, son) ---------- */
function ouvrirPanneau(html){
  const c = $("panneau"); c.innerHTML = `<div class="page" role="dialog"><button class="fermerHaut" id="fermerPanneau" aria-label="Fermer">✕</button>${html}</div>`;
  c.hidden=false; $("fermerPanneau").addEventListener("click",()=>{c.hidden=true;}); $("fermerPanneau").focus({preventScroll:true}); c.querySelector(".page").scrollTop=0;
  c.onclick = e=>{ if(e.target===c) c.hidden=true; };
  return c;
}
const REGLES_TEXTE = [
  ["Le temps", "Tout se passe en temps réel, en minutes et en heures, même quand l'appli est fermée (douze heures de pousse au plus sont rattrapées au retour). Le vrai lever et le vrai coucher du soleil (calculés pour la région parisienne) font l'aube, le jour, le crépuscule et la nuit ; la date décide du temps du jour (clair, nuageux, brume, pluie ou tempête), avec des chances qui changent selon la saison. La pluie et la tempête arrosent toutes seules ; la tempête fait fuir presque tous les visiteurs."],
  ["Deux monnaies", "L'or 🪙 vient du commerce : vendre au colporteur, livrer les lettres de Saint-Aubin, servir ceux qui montent te voir. Il paie les graines, les nouveaux pots et les constructions. Les lunes 🌙 viennent du lien : saluer les visiteurs, aider et gâter les habitants, trouver les secrets. Elles paient les recettes et les améliorations de l'atelier."],
  ["Semer et récolter", "Choisis une graine dans la barre, touche une place libre. Une plante prête se récolte d'un toucher et part dans le panier (onglet Comptoir). Parfois, une récolte sort en variante rare : elle vaut trois fois plus et remplit l'herbier du carnet."],
  ["Le comptoir", "Le comptoir rassemble le courrier et le panier. Anselme, le facteur, monte chaque matin dès 8 h avec quelques lettres. Chacune demande des récoltes ou des plats, avec un délai ; tant que tu as tout dans le panier, le bouton Livrer s'allume. Une lettre qui expire s'en va sans pénalité. Certains jours, quelqu'un monte en personne : il attend sur la carte, près du sentier, quelques heures, et paie le double. Les livraisons font avancer l'histoire d'Odile."],
  ["La cuisine", "À l'atelier, une recette transforme des récoltes en plat, qui se vend plus cher et que la ville commande. Les recettes s'apprennent avec des lunes."],
  ["La rosée", `Au potager, une plante arrosée pousse à pleine vitesse ; sans eau, elle pousse ${REGLES.ralentiSoif} fois moins vite, mais elle finit par y arriver. Une goutte lui donne une réserve d'eau proportionnée à sa durée (quelques minutes pour un radis, des heures pour une citrouille). La réserve de rosée se remplit lentement, d'un coup à l'aube, et deux fois plus vite sous la pluie. Sous la pluie, une averse arrose tout le monde régulièrement.`],
  ["La mare", "Les plantes d'eau n'ont jamais soif : elles poussent à la lumière, de l'aube au crépuscule, et attendent la nuit sans dommage."],
  ["Les visiteurs", "Chacun vient pour une raison précise : une plante en fleur, une heure, une météo, la taille du jardin. Il reste un moment sur le sentier ; touche-le pour le saluer, il laisse des lunes, parfois une graine rare ou une matière. Le carnet donne un indice pour ceux que tu n'as pas encore vus. Quand tu reviens après une absence, la lisière te raconte ce qui s'est passé, et quelqu'un a parfois laissé quelque chose sur le seuil."],
  ["Le son", "La lisière s'écoute : de vrais enregistrements de nature, qui suivent l'heure, la météo et le lieu (grenouilles à la mare, feu à l'atelier, le dehors étouffé quand tu es dedans). Tout se règle dans le carnet, onglet Son : volumes par famille, chaque élément à part, ambiances fixes, minuterie, lecture en arrière-plan."],
  ["Le marché", "Au comptoir, onglet Marché. Les étals de Saint-Aubin vendent les matériaux et les outils pour bâtir (planches, clous, pierre, tuiles, vitres, marteau, scie, truelle, jeune poirier) ; leurs prix bougent un peu chaque jour. Chaque marchand vient à ses jours, avec un stock limité. À force d'acheter chez lui, il propose son apprenti : tu le paies une fois, il s'installe à la lisière et produit en continu, même quand tu n'es pas là ; tu améliores son poste avec de l'or. Quand sa réserve est pleine, il se repose. Mathilde, la maraîchère, vend ce qui pousse au potager et à la mare, et garde pour toi ce qu'on te demande."],
  ["Bâtir", "Chaque bâtiment demande de l'or, des matériaux et des outils. Les outils ne s'usent pas : un marteau suffit pour toute la vie de la lisière."],
  ["Les fêtes", "Certaines dates comptent : la nuit des citrouilles, fin octobre, a sa recette, ses visiteurs et ses lettres."],
  ["Le village", "La carte est l'écran d'accueil. Pince pour zoomer ou dézoomer, touche deux fois pour passer de la vue d'ensemble à la vue rapprochée. Touche les terres pour le potager, l'étang pour la mare, une pierre plate pour bâtir. Un bâtiment coûte de l'or et se construit en jours réels, un chantier à la fois. Chaque bâtiment fini change une règle pour de bon. La cabane donne le seuil : le résumé de ce qui t'attend."],
  ["Les habitants", "Un visiteur assez fidèle, ou qui trouve ce qu'il lui faut, finit par rester au bout du sentier. Touche-le : sa fiche dit en clair ce qu'il demande, où tu en es, et si ça se valide tout seul ou s'il faut le lui offrir. Tu peux aussi lui offrir n'importe quoi du panier : des lunes et de l'amitié, le double pour ce qu'il aime. L'amitié ouvre des souvenirs dans le carnet."],
  ["Les matières et l'atelier", "Le miel vient de l'abeille, la nacre de la carpe et des lotus. À l'atelier, elles servent à fabriquer des objets permanents qui changent une règle du jeu."],
  ["Les vœux et les secrets", "Les vœux sont les objectifs longs, dans l'ordre. Les secrets n'ont aucun indice : tout ce qui est à l'écran se touche, et certaines heures sont moins ordinaires que d'autres."],
];
let onglet = "voeux";
function ouvrirCarnet(){
  const k = ctx();
  const nbV = Object.values(etat.voeuxFaits).filter(Boolean).length, nbS = Object.keys(etat.secrets).length, nbVis = Object.keys(etat.visites).length;
  let corps = "";
  if(onglet==="voeux"){
    const faits = VOEUX.filter(v=>etat.voeuxFaits[v.id]), aFaire = VOEUX.filter(v=>!etat.voeuxFaits[v.id]).slice(0,3);
    corps = `<p class="intro">La lisière a des vœux. Quand ils sont tous accomplis, elle en trouve d'autres.</p>` +
      [...faits, ...aFaire].map(v=>{ let a=0,b=1; try{ [a,b]=v.prog(k); }catch(e){} const ok=!!etat.voeuxFaits[v.id]; return `<div class="voeu ${ok?"fait":""}"><span class="coche">${ok?"✦":"·"}</span><b>${v.nom}</b><span class="prog">${b>1?Math.min(a,b)+" / "+b:(ok?"accompli":"à faire")}</span></div>`; }).join("");
  } else if(onglet==="visiteurs"){
    corps = `<p class="intro">${nbVis} sur ${VISITEURS.length} rencontrés. Chacun vient pour une raison, à un endroit.</p>` +
      ZONES.map(z=>`<h3>${z.emoji} ${z.nom}</h3>`+VISITEURS.filter(d=>d.zone===z.id).map(d=>{ const n=etat.visites[d.id]; return `<div class="entree ${n?"vu":""}"><div class="ico">${image(d)}</div><div><b>${n?d.nom:"?"}</b><small>${n?d.texte+` Vu ${n} fois.`:d.indice}</small></div></div>`; }).join("")).join("");
  } else if(onglet==="habitants"){
    corps = `<p class="intro">Ceux qui restent. Ils demandent peu, et rarement. Chaque demande satisfaite ouvre une page.</p>` +
      HABITANTS.map(h=>{ const hs=etat.habitants[h.id], d=hs&&demandeActive(h);
        if(!hs) return `<div class="entree"><div class="ico">${h.emoji}</div><div><b>?</b><small>${h.indice}</small></div></div>`;
        return `<div class="entree vu"><div class="ico">${h.emoji}</div><div><b>${h.nom}</b><small>${h.titre} ${zoneDef(h.zone).nom}.</small>` +
          `<small>Amitié ${hs.amitie||0}/10 · aime ${h.aime.map(k=>defObjet(k).nom.toLowerCase()).join(", ")}</small>` +
          (d ? `<small class="demande">Demande : ${d.but}${d.offrir?" (à lui offrir)":" (se valide toute seule)"}</small>` : `<small class="demande calme">Rien à demander pour l'instant.</small>`) +
          h.demandes.filter(x=>hs.faites.includes(x.id)).map(x=>`<small class="histoire">${x.histoire}</small>`).join("") +
          h.souvenirs.filter((x,i)=>(hs.amitie||0)>=[3,6,10][i]).map(x=>`<small class="histoire">${x}</small>`).join("") + `</div></div>`; }).join("");
  } else if(onglet==="histoire"){
    const recus = CHAPITRES.filter(ch=>etat.ville.chapitres[ch.id]);
    corps = `<p class="intro">Le fil de la Lisière : ${recus.length} lettre${recus.length>1?"s":""} sur ${CHAPITRES.length}. Les livraisons à Saint-Aubin font venir les suivantes.</p>` +
      recus.map(ch=>`<details class="regle"><summary><b>${ch.titre}</b><small>De ${ch.de}</small></summary><div class="missive">${ch.texte.split("\n\n").map(x=>`<p>${x.replace(/\n/g,"<br>")}</p>`).join("")}</div></details>`).join("") +
      (recus.length<CHAPITRES.length ? `<div class="voeu"><span class="coche">·</span><div><b>· · ·</b><small>La suite viendra avec les lettres.</small></div></div>` : "");
  } else if(onglet==="herbier"){
    const ks = Object.keys(PLANTES);
    corps = `<p class="intro">Chaque plante récoltée entre ici ; une variante rare la marque d'une étoile.</p>` +
      ks.map(k=>{ const p=PLANTES[k], hb=etat.herbier[k]; return `<div class="entree ${hb?"vu":""}"><div class="ico">${IMG?im(hb&&hb.rare?`rare-${k}`:`plante-${k}-4`,"dessin"):p.emoji}</div><div><b>${hb?p.nom:"?"}${hb&&hb.rare?" ✦":""}</b><small>${hb?`${hb.n} récolte${hb.n>1?"s":""}${hb.rare?` · ${p.rare} trouvée ${hb.rare} fois`:` · variante rare : pas encore`}`:"Pas encore récoltée."}</small></div></div>`; }).join("");
  } else if(onglet==="son"){
    const sn = etat.son, pc = v=>Math.round(v*100);
    const curseur = (id, nom, texte, v) => `<label class="curseur"><span><b>${nom}</b><small>${texte}</small></span><input type="range" min="0" max="100" step="5" value="${pc(v)}" data-vol="${id}" aria-label="${nom}"><output>${pc(v)} %</output></label>`;
    const inter = (id, nom, texte, on, attr="data-opt") => `<label class="option"><input type="checkbox" ${attr}="${id}" ${on?"checked":""}><span><b>${nom}</b><small>${texte}</small></span></label>`;
    const rm = audio.minuterieReste, mt = audio.minuterieTotal;
    corps = inter("actif","Son activé","Coupe tout d'un coup, sans perdre tes réglages.", sn.actif) +
      curseur("general","Volume général","Tout le son de la lisière.", sn.general) +
      `<h3>Mélange</h3>` +
      curseur("nature","Nature","Oiseaux, insectes, grenouilles, eau, feu, horloge.", sn.vol.nature) +
      curseur("meteo","Météo","Vent, pluie, tonnerre.", sn.vol.meteo) +
      curseur("animaux","Animaux de passage","Chouette, corneilles, pic-vert, carillon, cris des visiteurs.", sn.vol.animaux) +
      curseur("bruitages","Bruitages","Clochettes, pas, papier, marmite.", sn.vol.bruitages) +
      curseur("musique","Musique","Une boîte à musique lente : quelques accords, de petites phrases, des silences. Majeure le jour, mineure la nuit.", sn.vol.musique) +
      `<h3>Ce qu'on entend</h3><div class="elements">` + SONS.elements.map(e=>inter(e.id, e.nom, e.texte, sn.el[e.id], "data-el")).join("") + `</div>` +
      `<h3>Écoute</h3><p class="intro">Suivre la lisière, ou choisir une ambiance fixe pour se détendre, quelle que soit l'heure.</p><div class="ecoutes">` +
      SONS.ecoutes.map(e=>`<button class="choix" data-ecoute="${e.id}" aria-pressed="${sn.ecoute===e.id}">${e.nom}</button>`).join("") + `</div>` +
      inter("lieux","Le son change selon le lieu","Plus de grenouilles à la mare, le feu à l'atelier.", sn.lieux) +
      inter("realisme","Sons étouffés","Dedans, le dehors s'entend à travers les murs ; la brume assourdit tout.", sn.realisme) +
      inter("stereo","Stéréo","Les animaux viennent de la gauche ou de la droite. Plus beau au casque.", sn.stereo) +
      inter("fond","Continuer en arrière-plan","Le son continue quand tu quittes l'appli ou éteins l'écran. Selon le téléphone, Android peut le couper au bout d'un moment.", sn.fond) +
      `<h3>Minuterie</h3><p class="intro">${rm ? `Le son s'éteindra dans ${Math.ceil(rm/60000)} min, en fondu.` : "Éteindre le son en douceur au bout d'un moment."}</p><div class="ecoutes">` +
      [0,15,30,60,90].map(m=>`<button class="choix" data-minut="${m}" aria-pressed="${(m===0 && !rm) || (rm && mt===m)}">${m?m+" min":"Non"}</button>`).join("") + `</div>` +
      `<div class="ligne"><div><b>Réglages par défaut</b><small>Remet le mélange et les interrupteurs d'origine.</small></div><button id="sonDefaut">Rétablir</button></div>` +
      `<p class="intro credits">Sons : banque libre Moodist (licences CC0 et Pixabay).</p>`;
  } else if(onglet==="reglages"){
    corps = `<h3>La partie</h3><div class="ligne"><div><b>Recommencer</b><small>Efface la lisière entière. Sans retour.</small></div><button id="reset1" class="danger">Recommencer</button></div>
      <div class="ligne" id="resetConfirme" hidden><div><b>Vraiment ?</b><small>Tout sera perdu : pots, or, lunes, carnet, village, lettres.</small></div><button id="reset2" class="danger">Oui, tout effacer</button></div>
      <p class="intro" style="margin-top:12px">La Lisière, version ${VERSION_APP}. Tout reste sur cet appareil. Le son se règle dans l'onglet Son.</p>`;
  } else if(onglet==="regles"){
    corps = REGLES_TEXTE.map(([t,x])=>`<div class="regle"><b>${t}</b><small>${x}</small></div>`).join("");
  } else {
    corps = `<p class="intro">${nbS} sur ${SECRETS.length} trouvés. Aucun indice. La lisière ne les cache pas exprès, elle ne les montre pas, c'est tout.</p>` +
      SECRETS.map(s=>{ const ok=!!etat.secrets[s.id]; return `<div class="voeu ${ok?"fait":""}"><span class="coche">${ok?"✦":"?"}</span><div><b>${ok?s.nom:"· · ·"}</b>${ok?`<small>${s.texte}</small>`:""}</div></div>`; }).join("");
  }
  // le carnet est un écran à part (onglet du bas), plus une fenêtre par-dessus
  const c = $("carnet"), garde = $("contenu").scrollTop;
  c.innerHTML = `
    <div class="onglets" role="tablist">
      <button role="tab" aria-selected="${onglet==="voeux"}" data-o="voeux">Vœux ${nbV}/${VOEUX.length}</button>
      <button role="tab" aria-selected="${onglet==="visiteurs"}" data-o="visiteurs">Visiteurs ${nbVis}/${VISITEURS.length}</button>
      <button role="tab" aria-selected="${onglet==="habitants"}" data-o="habitants">Habitants ${Object.keys(etat.habitants).length}/${HABITANTS.length}</button>
      <button role="tab" aria-selected="${onglet==="secrets"}" data-o="secrets">Secrets ${nbS}/${SECRETS.length}</button>
      <button role="tab" aria-selected="${onglet==="histoire"}" data-o="histoire">Histoire</button>
      <button role="tab" aria-selected="${onglet==="herbier"}" data-o="herbier">Herbier</button>
      <button role="tab" aria-selected="${onglet==="regles"}" data-o="regles">Règles</button>
      <button role="tab" aria-selected="${onglet==="son"}" data-o="son">Son</button>
      <button role="tab" aria-selected="${onglet==="reglages"}" data-o="reglages">Réglages</button>
    </div><div class="corps">${corps}</div>`;
  $("contenu").scrollTop = ouvrirCarnet.garder ? garde : 0; ouvrirCarnet.garder = false;
  c.querySelectorAll("[data-o]").forEach(b=>b.addEventListener("click",()=>{ onglet=b.dataset.o; ouvrirCarnet(); }));
  if(onglet==="son"){ const sn=etat.son;
    const maj = ()=>{ sauver(); audio.rafraichir(); };
    c.querySelectorAll("[data-vol]").forEach(i=>i.addEventListener("input",()=>{ const v=+i.value/100; if(i.dataset.vol==="general") sn.general=v; else sn.vol[i.dataset.vol]=v; i.nextElementSibling.textContent=i.value+" %"; if(v>0 && !sn.actif){ sn.actif=true; const a=c.querySelector('[data-opt="actif"]'); if(a) a.checked=true; } maj(); }));
    c.querySelectorAll("[data-opt]").forEach(i=>i.addEventListener("change",()=>{ sn[i.dataset.opt]=i.checked; maj(); }));
    c.querySelectorAll("[data-el]").forEach(i=>i.addEventListener("change",()=>{ sn.el[i.dataset.el]=i.checked; maj(); }));
    c.querySelectorAll("[data-ecoute]").forEach(b=>b.addEventListener("click",()=>{ sn.ecoute=b.dataset.ecoute; if(!sn.actif) sn.actif=true; maj(); ouvrirCarnet.garder=true; ouvrirCarnet(); }));
    c.querySelectorAll("[data-minut]").forEach(b=>b.addEventListener("click",()=>{ audio.minuterie(+b.dataset.minut); ouvrirCarnet.garder=true; ouvrirCarnet(); }));
    $("sonDefaut").addEventListener("click",()=>{ etat.son = SON_DEFAUT(); maj(); ouvrirCarnet.garder=true; ouvrirCarnet(); });
  }
  if(onglet==="reglages"){
    $("reset1").addEventListener("click", ()=>{ $("resetConfirme").hidden=false; $("reset1").disabled=true; });
    $("reset2").addEventListener("click", ()=>{ try{ localStorage.removeItem(KEY); localStorage.removeItem("jardin-de-nuit-v3"); }catch(e){} location.reload(); }); }
}
const VERSION_APP="0.17.7";

/* ---------- son ----------
   Boucles d'ambiance (vrais enregistrements, assets/sons/*.ogg) mixées en continu selon un contexte sonore,
   sons ponctuels tirés au hasard, bruitages, et une musique générée (facultative). Tout se règle dans le carnet, onglet Son.
   Chaîne : boucle -> gain -> [dehors : filtre passe-bas (intérieur, brume)] -> général -> compresseur -> sortie
*/
const SONS = CONTENU.SONS;
const SON_MIX = 2;   // version du mélange par défaut : quand elle change, les volumes de chacun reviennent aux nouvelles valeurs
const SON_DEFAUT = () => ({mix:SON_MIX, actif:true, general:.8, vol:{nature:.3, meteo:.3, animaux:.3, bruitages:.5, musique:.6},
  el:Object.fromEntries(SONS.elements.map(e=>[e.id,true])), ecoute:"jeu", lieux:true, realisme:true, stereo:true, fond:false});
function normaliserSon(){
  const d = SON_DEFAUT(), s = etat.son || {};
  if(!Object.keys(s).length){ etat.son = d; return; }
  if(!s.vol){ // anciens réglages : trois interrupteurs
    d.actif = s.actif!==false && s.actif!==undefined ? true : !!s.actif;
    if(s.ambiance===false) d.vol.nature=0; if(s.meteo===false) d.vol.meteo=0; if(s.bruitages===false) d.vol.bruitages=0;
    etat.son = d; return;
  }
  etat.son = Object.assign(d, s, {vol:Object.assign(d.vol, s.mix===SON_MIX ? s.vol : {}), el:Object.assign(d.el, s.el), mix:SON_MIX});
}
normaliserSon();
const audio = (function(){
  let actx=null, sortie=null, general=null, dehors=null, filtre=null, dedans=null, verb=null, bruit=null, musique=null;
  const buffers={}, enCours={}, boucles={}, prochains={}, episodes={};
  let FORMAT_SON = (()=>{ try{ return new Audio().canPlayType('audio/ogg; codecs="opus"') ? "ogg" : "m4a"; }catch(e){ return "ogg"; } })(); let derniereUtil={}, minuterieFin=0, minuterieTotal=0, musiqueProchaine=0;
  function init(){
    if(actx) return;
    actx = new (window.AudioContext||window.webkitAudioContext)();
    const comp = actx.createDynamicsCompressor(); comp.threshold.value=-18; comp.ratio.value=4; comp.attack.value=.02; comp.release.value=.4;
    general = actx.createGain(); general.gain.value = etat.son.general;
    filtre = actx.createBiquadFilter(); filtre.type="lowpass"; filtre.frequency.value=20000; filtre.Q.value=.5;
    dehors = actx.createGain(); dedans = actx.createGain(); bruit = actx.createGain(); musique = actx.createGain();
    dehors.connect(filtre); filtre.connect(general); dedans.connect(general); bruit.connect(general); musique.connect(general);
    const n = actx.sampleRate*2.6, ir = actx.createBuffer(2,n,actx.sampleRate);
    for(let c=0;c<2;c++){ const d=ir.getChannelData(c); for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,3); }
    verb = actx.createConvolver(); verb.buffer = ir; const wet = actx.createGain(); wet.gain.value=.3; verb.connect(wet); wet.connect(general);
    general.connect(comp); comp.connect(actx.destination);
  }
  // chargement par XHR (fetch ne lit pas file:// dans la WebView) ; mémorisé, libéré après deux minutes sans usage
  function charger(nom){
    derniereUtil[nom]=Date.now();
    if(buffers[nom]) return Promise.resolve(buffers[nom]);
    if(enCours[nom]) return enCours[nom];
    // Ogg Opus partout ; si le navigateur ne sait pas le décoder (Safari d'iPhone), on passe au M4A (fourni par la version web)
    const essai = ext => new Promise((ok,ko)=>{ const x=new XMLHttpRequest(); x.open("GET",`sons/${nom}.${ext}`); x.responseType="arraybuffer";
      x.onload=()=>{ if(!x.response || !x.response.byteLength){ ko(); return; } actx.decodeAudioData(x.response, ok, ko); };
      x.onerror=()=>ko(); x.send(); });
    return enCours[nom] = essai(FORMAT_SON).catch(()=>{ if(FORMAT_SON==="ogg"){ FORMAT_SON="m4a"; return essai("m4a"); } throw 0; })
      .then(b=>{ buffers[nom]=b; delete enCours[nom]; return b; }, e=>{ delete enCours[nom]; throw e; });
  }
  function contexte(){
    const s = etat.son, fixe = SONS.ecoutes.find(e=>e.id===s.ecoute && e.c);
    if(fixe) return Object.assign({phase:"jour", pluie:false, dedans:false, ruche:false, cabane:false}, fixe.c);
    const lieu = s.lieux ? (ZONE==="cuisine" ? "atelier" : ZONE==="village"||zoneDef(ZONE)||ZONE==="atelier"||ZONE==="courrier" ? ZONE : "village") : "village";
    return {moment:PHASE.id, phase:PHASE.phase, temps:TEMPSID, pluie:PLUIE, lieu, dedans: lieu==="atelier"||lieu==="courrier", ruche:bati("ruche"), cabane:bati("cabane")};
  }
  const vg = g => etat.son.vol[g]||0;
  function majMix(){
    if(!actx || actx.state!=="running") return;
    const s = etat.son, c = contexte(), t = actx.currentTime, inter = c.dedans && s.realisme;
    for(const def of SONS.boucles){
      let v = 0; if(s.el[def.element]){ try{ v = Math.max(0, Math.min(1, def.vol(c)||0)); }catch(e){} v *= vg(def.groupe); }
      if(!def.dedans && inter) v *= .45;
      if(def.episodes){ episodes[def.id] = v; continue; }
      const b = boucles[def.id];
      if(v>.002 && !b){ boucles[def.id] = {g:null, cible:v, demarrage:true};
        charger(def.id).then(buf=>{ const bb=boucles[def.id]; if(!bb || !bb.demarrage) return; const src=actx.createBufferSource(); src.buffer=buf; src.loop=true;
          const g=actx.createGain(); g.gain.value=0; src.connect(g); g.connect(def.dedans?dedans:dehors); src.start(0, Math.random()*buf.duration);
          bb.src=src; bb.g=g; bb.demarrage=false; g.gain.setTargetAtTime(bb.cible, actx.currentTime, 1.2); }).catch(()=>{ delete boucles[def.id]; }); }
      else if(b){ b.cible=v; if(b.g) b.g.gain.setTargetAtTime(v, t, 1.2); derniereUtil[def.id]=Date.now();
        if(v<=.002){ b.zero = b.zero || Date.now(); if(Date.now()-b.zero>9000){ try{ b.src.stop(); }catch(e){} delete boucles[def.id]; } } else b.zero=0; }
    }
    // intérieur : dehors étouffé ; brume : un peu aussi
    const fc = inter ? 650 : (s.realisme && c.temps==="brume") ? 2200 : 20000;
    filtre.frequency.setTargetAtTime(fc, t, .8);
    // minuterie : fondu sur la dernière minute, puis silence
    let gen = s.general;
    if(minuterieFin){ const reste = minuterieFin-Date.now(); if(reste<=0){ minuterieFin=0; s.actif=false; sauver(); pause(); dire("La minuterie a éteint le son. Il se rallume dans le carnet, onglet Son."); return; } if(reste<60000) gen *= reste/60000; }
    general.gain.setTargetAtTime(gen, t, .5); bruit.gain.setTargetAtTime(vg("bruitages"), t, .3); musique.gain.setTargetAtTime(vg("musique"), t, 1);
    // libère les sons inutilisés depuis deux minutes
    for(const k in buffers) if(!boucles[k] && Date.now()-(derniereUtil[k]||0) > 120000) delete buffers[k];
  }
  // extrait d'un fichier : début tiré parmi `extraits` (ou au hasard), fondu d'entrée et de sortie, placé dans l'espace stéréo
  function extrait(def, bus, volExtra=1){
    charger(def.fichier).then(buf=>{
      const dur = Math.min(def.duree||buf.duration, buf.duration);
      const deb = def.debut!=null ? def.debut : def.extraits ? def.extraits[Math.floor(Math.random()*def.extraits.length)] : Math.random()*Math.max(0, buf.duration-dur);
      const t=actx.currentTime, src=actx.createBufferSource(); src.buffer=buf; const g=actx.createGain(), f=def.fondu || Math.min(.25, dur/4), v=(def.vol||.5)*volExtra;
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(v,t+f); g.gain.setValueAtTime(v,t+dur-f); g.gain.linearRampToValueAtTime(0,t+dur);
      let n = g; if(etat.son.stereo && actx.createStereoPanner){ const p=actx.createStereoPanner(); p.pan.value = def.pan!=null ? def.pan : (Math.random()*1.4-.7); g.connect(p); n=p; }
      src.connect(g); n.connect(bus); src.start(t, deb, dur+.05);
    }).catch(()=>{});
  }
  function ponctuels(){
    if(!actx || actx.state!=="running") return;
    const c = contexte(), now = Date.now(), hasardEntre = r => r[0] + Math.random()*(r[1]-r[0]);
    for(const def of SONS.boucles){ if(!def.episodes) continue;
      const v = episodes[def.id]||0, k = "ep-"+def.id;
      if(v<=.002){ delete prochains[k]; continue; }
      if(!prochains[k]){ prochains[k] = now + 1000*hasardEntre(def.episodes.pause)*.25; continue; }
      if(now>=prochains[k]){ const d = hasardEntre(def.episodes.duree);
        extrait({fichier:def.id, duree:d, vol:v, fondu:Math.min(3, d/3), pan:(Math.random()*.8-.4)}, def.dedans?dedans:dehors);
        prochains[k] = now + 1000*(d + hasardEntre(def.episodes.pause)); } }
    for(const p of SONS.ponctuels){
      let ok=false; try{ ok = etat.son.el[p.element] && p.quand(c); }catch(e){}
      const v = vg(p.groupe||"animaux"); if(!ok || v<=0){ delete prochains[p.id]; continue; }
      if(!prochains[p.id]){ prochains[p.id] = now + 1000*(p.toutes[0] + Math.random()*(p.toutes[1]-p.toutes[0]))*.5; continue; }
      if(now>=prochains[p.id]){ extrait(p, dehors, v); prochains[p.id] = now + 1000*(p.toutes[0] + Math.random()*(p.toutes[1]-p.toutes[0])); }
    }
  }
  // musique générée : une boîte à musique lente. Une grille de quatre accords, une basse à chaque mesure,
  // une petite phrase de deux à quatre notes prise dans la gamme, des mesures de silence. Majeur le jour, mineur la nuit.
  const hz = m => 440*Math.pow(2,(m-69)/12);
  const GRILLES = {
    jour: {temps:1.25, gamme:[72,74,76,79,81,84], accords:[[48,[60,64,67]],[45,[57,60,64]],[41,[57,60,65]],[43,[55,59,62]]]},
    nuit: {temps:1.5,  gamme:[69,72,74,76,79,81], accords:[[45,[57,60,64]],[41,[57,60,65]],[48,[55,60,64]],[43,[55,59,62]]]},
  };
  let mus = {t:0, mesure:0, grille:null, derniere:74};
  function noteMusique(f, t, v, duree=3.2, basse=false){
    const o=actx.createOscillator(), o2=actx.createOscillator(), g=actx.createGain(), g2=actx.createGain();
    o.type="sine"; o.frequency.value=f; o2.type="sine"; o2.frequency.value=f*(basse?2:3.01); g2.gain.value=basse?.18:.1;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(v,t+(basse?.04:.01)); g.gain.exponentialRampToValueAtTime(.0004,t+duree);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musique); g.connect(verb); o.start(t); o2.start(t); o.stop(t+duree+.1); o2.stop(t+duree+.1);
  }
  function majMusique(){
    if(!actx || actx.state!=="running" || vg("musique")<=0){ mus.t=0; return; }
    const c = contexte(), G = (c.phase==="nuit"||c.phase==="crepuscule") ? GRILLES.nuit : GRILLES.jour;
    if(mus.grille!==G){ mus.grille=G; mus.mesure=0; }
    if(mus.t < actx.currentTime) mus.t = actx.currentTime + .2;
    while(mus.t < actx.currentTime + 4){
      const T = G.temps, [basse, accord] = G.accords[Math.floor(mus.mesure/2) % G.accords.length], pos = mus.mesure % 16;
      const silence = pos>=14 || Math.random()<.15;          // on respire : deux mesures muettes toutes les seize, et quelques autres
      if(!silence){
        noteMusique(hz(basse), mus.t, .05, 4.5, true);
        if(Math.random()<.5) noteMusique(hz(accord[Math.floor(Math.random()*3)]), mus.t+T*2, .028, 3);
        const n = 1 + Math.floor(Math.random()*3), temps = [0,1,1.5,2,3,3.5].sort(()=>Math.random()-.5).slice(0,n).sort((a,b)=>a-b);
        for(const k of temps){
          // la mélodie avance par petits pas, et retombe sur une note de l'accord quand elle tombe sur un temps fort
          let i = G.gamme.indexOf(mus.derniere); if(i<0) i = 2;
          i = Math.max(0, Math.min(G.gamme.length-1, i + [-1,-1,1,1,2,-2,0][Math.floor(Math.random()*7)]));
          let m = G.gamme[i]; if(k%2===0){ const proche = accord.map(a=>a+12).reduce((x,y)=>Math.abs(y-m)<Math.abs(x-m)?y:x); m = proche; }
          mus.derniere = m; noteMusique(hz(m), mus.t + k*T, .06 + Math.random()*.02);
        }
      }
      mus.t += 4*T; mus.mesure++;
    }
  }
  function rafraichir(){
    const s = etat.son;
    if(!s.actif || (document.hidden && !s.fond)){ pause(); return; }
    init(); if(actx.state!=="running") actx.resume().then(majMix); else majMix();
  }
  function pause(){ if(actx && actx.state==="running") actx.suspend(); }
  function tick(){ if(!actx || !etat.son.actif) return; majMix(); ponctuels(); majMusique(); }
  function tinter(freq, delai=0){
    if(!etat.son.actif || !actx || vg("bruitages")<=0) return;
    const PENTA=[196,220,246.9,293.7,329.6,392,440,493.9,587.3,659.3,784,880,987.8,1174.7];
    const f = PENTA.reduce((a,b)=>Math.abs(b-freq)<Math.abs(a-freq)?b:a);
    const t=actx.currentTime+delai, g=actx.createGain();
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.09,t+.008); g.gain.exponentialRampToValueAtTime(.0005,t+1.6);
    const o=actx.createOscillator(); o.type="sine"; o.frequency.value=f;
    const o2=actx.createOscillator(), g2=actx.createGain(); o2.type="sine"; o2.frequency.value=f*2.76; g2.gain.setValueAtTime(.25,t); g2.gain.exponentialRampToValueAtTime(.001,t+.35);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(bruit); g.connect(verb);
    o.start(t); o2.start(t); o.stop(t+1.7); o2.stop(t+.4);
  }
  function effet(nom){ const d = SONS.effets[nom]; if(!d || !etat.son.actif || !actx || vg("bruitages")<=0) return; extrait(Object.assign({pan:0}, d), bruit); }
  function cri(id){ const d = SONS.cris[id]; if(!d || !etat.son.actif || !actx || !etat.son.el.cris || vg("animaux")<=0) return; extrait(d, dehors, vg("animaux")); }
  function minuterie(min){ minuterieTotal=min; minuterieFin = min ? Date.now()+min*60000 : 0; if(!min){ general && general.gain.setTargetAtTime(etat.son.general, actx.currentTime, .3); } }
  return {rafraichir, pause, tick, tinter, effet, cri, minuterie, get actives(){ return Object.keys(boucles).filter(k=>boucles[k].g).map(k=>k+":"+boucles[k].cible.toFixed(2)); }, get etatCtx(){ return actx && actx.state; }, get minuterieReste(){ return minuterieFin ? Math.max(0, minuterieFin-Date.now()) : 0; }, get minuterieTotal(){ return minuterieFin ? minuterieTotal : 0; }};
})();
function tinter(f,d){ audio.tinter(f,d); }
// le navigateur n'autorise le son qu'après un geste : au premier toucher, on lance ce qui est réglé
document.addEventListener("pointerdown", function premier(){ if(etat.son.actif) audio.rafraichir(); document.removeEventListener("pointerdown", premier); });
setInterval(()=>audio.tick(), 2000);
window.lisiereSon = audio;   // pour les tests
// version web : le jeu se garde hors ligne (pas dans l'APK, qui lit ses fichiers directement)
if(location.protocol==="https:" && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});

/* ---------- ciel ---------- */
const cv=$("ciel"), cx=cv.getContext("2d");
let W,H, etoiles=[], lucioles=[], gouttes=[];
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches, dpr=devicePixelRatio||1;
function tailler(){
  W=cv.width=innerWidth*dpr; H=cv.height=innerHeight*dpr;
  etoiles=Array.from({length:90},()=>({x:Math.random()*W,y:Math.random()*H*.7,r:Math.random()*1.4+.4,ph:Math.random()*6}));
  lucioles=Array.from({length:14},()=>({x:Math.random()*W,y:H*.4+Math.random()*H*.6,a:Math.random()*6,v:.3+Math.random()*.5,ph:Math.random()*6}));
  gouttes=Array.from({length:110},()=>({x:Math.random()*W,y:Math.random()*H,l:(8+Math.random()*10)*dpr,v:(9+Math.random()*6)*dpr}));
}
addEventListener("resize", tailler); tailler();
const FOND = {nuit:["#141a2e","#111522"], crepuscule:["#3d2f52","#2c2440"], aube:["#2f4070","#28345a"], jour:["#3f6fa6","#35587f"]};
function dessiner(t){
  cx.clearRect(0,0,W,H); const s=t/1000;
  const mx=W*.85, my=H*.12, r=22*dpr, ph=PHASE.phase;
  if(!IMG && (ph==="aube"||ph==="crepuscule")){
    const g=cx.createLinearGradient(0,H*.15,0,H*.6); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1, ph==="aube" ? "rgba(244,180,120,.28)" : "rgba(230,120,100,.3)");
    cx.fillStyle=g; cx.fillRect(0,0,W,H*.6);
  }
  if(IMG){ /* le bandeau de ciel est une image : rien à dessiner en haut */ }
  else if(!PLUIE && PHASE.etoiles && TEMPSID==="clair"){
    for(const e of etoiles){ cx.globalAlpha=(.4+.4*Math.sin(s*.8+e.ph))*(ph==="nuit"?1:.5); cx.fillStyle="#f1e9d6"; cx.beginPath(); cx.arc(e.x,e.y,e.r*dpr,0,7); cx.fill(); }
    cx.globalAlpha=1;
  }
  if(IMG){ /* le ciel est dans la carte */ }
  else if(PHASE.ciel==="soleil"){
    cx.shadowColor="#ffe9a8"; cx.shadowBlur=(ph==="aube"?30:50)*dpr; cx.fillStyle=ph==="aube"?"#f7c27a":"#fff1b8";
    cx.beginPath(); cx.arc(mx,my,r,0,7); cx.fill(); cx.shadowBlur=0;
  } else if(!IMG){
    cx.fillStyle="#f4d58a"; cx.beginPath(); cx.arc(mx,my,r,0,7); cx.fill();
    if(!etat.pleineLune){ const f=FOND[ph]||FOND.nuit; cx.fillStyle=(PLUIE?f[1]:f[0]); cx.beginPath(); cx.arc(mx+10*dpr,my-6*dpr,19*dpr,0,7); cx.fill(); }
  }
  if(PLUIE){
    if(!IMG){ cx.globalAlpha=.85; cx.fillStyle=PHASE.ciel==="soleil"?"#4b5a72":"#1f2538";
    [[-30,8,34],[0,14,40],[32,10,30],[-10,-14,26]].forEach(([dx,dy,rr])=>{ cx.beginPath(); cx.arc(mx+dx*dpr+Math.sin(s*.1)*6*dpr,my+dy*dpr,rr*dpr,0,7); cx.fill(); }); }
    cx.globalAlpha=.55; cx.strokeStyle="#86b8e6"; cx.lineWidth=1*dpr; cx.lineCap="round";
    for(const g of gouttes){ cx.beginPath(); cx.moveTo(g.x,g.y); cx.lineTo(g.x-g.l*.15,g.y+g.l); cx.stroke();
      if(!reduit){ g.y+=g.v; g.x-=g.v*.15; if(g.y>H){ g.y=-g.l; g.x=Math.random()*W*1.1; } } }
    cx.globalAlpha=1;
  } else if(PHASE.lucioles){
    const or = etat.secrets.jumelles;
    for(const l of lucioles){
      if(!reduit){ l.a+=(Math.random()-.5)*.3; l.x+=Math.cos(l.a)*l.v*dpr; l.y+=Math.sin(l.a)*l.v*dpr*.6; if(l.x<0)l.x=W; if(l.x>W)l.x=0; if(l.y<H*.3||l.y>H)l.y=H*.3+Math.random()*H*.5; }
      cx.globalAlpha=Math.max(0,Math.sin(s*1.5+l.ph))*.9; cx.fillStyle=or?"#f4d58a":"#d9f27a"; cx.shadowColor=cx.fillStyle; cx.shadowBlur=12*dpr;
      cx.beginPath(); cx.arc(l.x,l.y,2*dpr,0,7); cx.fill(); cx.shadowBlur=0;
    }
    cx.globalAlpha=1;
  }
  if(!reduit) requestAnimationFrame(dessiner);
}
requestAnimationFrame(dessiner);

/* ---------- hauteurs des bandeaux flottants, mesurées en direct ---------- */
(function(){ const app=document.querySelector(".app"), h=$("entete"), m=$("msg"), t=$("meteo");
  // la place du message du bas est fixe (deux lignes) : le contenu ne bouge plus quand le texte change de longueur ou s'efface
  const maj=()=>{ app.style.setProperty("--hautH", h.offsetHeight+"px"); app.style.setProperty("--hautT", t.offsetHeight+"px"); };
  maj(); if(window.ResizeObserver){ const ro=new ResizeObserver(maj); [h,m,t].forEach(e=>ro.observe(e)); } addEventListener("resize", maj); })();

/* ---------- démarrage ---------- */
rendreTitre();
(function sonder(){ const t=new Image(); t.onload=()=>{ IMG=true; document.body.classList.add("illustre"); carteFaite=false; cleVillage=""; cleAtelier=""; cleCourrier=""; potsEl.forEach(e=>e.cle=""); $("village").querySelectorAll(".visiteur,.habitant").forEach(e=>e.remove()); if(ZONE==="village") construireCarte(); else if(zoneDef(ZONE)) construirePots(zoneDef(ZONE)); rendreMeteo(); rendre(); }; t.src="img/plante-radis-1.webp"; })();
document.body.dataset.zone = ZONE;
$("ecran-zone").hidden = true; $("ecran-atelier").hidden = true; $("ecran-village").hidden = false;
construireCarte(); rendreNav(); $("contenu").classList.add("plein");
dire(TEXTES.villageVide);
retour(); rendreBarre();
})();

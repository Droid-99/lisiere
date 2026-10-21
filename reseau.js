/* ============================================================
   RÉSEAU DE LA LISIÈRE
   Parle à Supabase directement en HTTPS (pas de bibliothèque) : connexion anonyme, marché public,
   amis, cadeaux, sauvegarde en ligne. Sans configuration (config.js) ou sans réseau, tout reste local.
   ============================================================ */
const RESEAU = (function(){
  "use strict";
  const C = window.LISIERE_CONFIG || {};
  const actif = !!(C.supabaseUrl && C.supabaseCle);
  const CLE_SESSION = "lisiere-session";
  let session = null;
  try{ session = JSON.parse(localStorage.getItem(CLE_SESSION)); }catch(e){}
  const garder = s => { session = s; try{ localStorage.setItem(CLE_SESSION, JSON.stringify(s)); }catch(e){} };

  async function http(chemin, {methode="GET", corps, entetes={}, auth=true}={}){
    const h = Object.assign({"apikey": C.supabaseCle, "Content-Type":"application/json"}, entetes);
    if(auth && session) h["Authorization"] = "Bearer " + session.access_token;
    const r = await fetch(C.supabaseUrl + chemin, {method:methode, headers:h, body: corps===undefined ? undefined : JSON.stringify(corps)});
    const texte = await r.text(); let json = null; try{ json = texte ? JSON.parse(texte) : null; }catch(e){}
    if(!r.ok){ const err = new Error((json && (json.message || json.msg || json.error_description || json.error)) || ("HTTP "+r.status)); err.status = r.status; throw err; }
    return json;
  }
  // session anonyme, renouvelée avant expiration
  async function connecter(){
    if(!actif) throw new Error("hors ligne");
    if(session && session.expires_at && session.expires_at*1000 > Date.now() + 60000) return session;
    if(session && session.refresh_token){
      try{ const s = await http("/auth/v1/token?grant_type=refresh_token", {methode:"POST", corps:{refresh_token:session.refresh_token}, auth:false}); garder(s); return s; }catch(e){ if(e.status && e.status<500) session=null; else throw e; }
    }
    const s = await http("/auth/v1/signup", {methode:"POST", corps:{data:{}}, auth:false});
    garder(s); return s;
  }
  const uid = () => session && session.user && session.user.id;
  const rpc = async (nom, args={}) => { await connecter(); return http("/rest/v1/rpc/"+nom, {methode:"POST", corps:args}); };
  const lire = async (chemin) => { await connecter(); return http("/rest/v1/"+chemin); };
  const ecrire = async (table, ligne) => { await connecter(); return http("/rest/v1/"+table, {methode:"POST", corps:ligne, entetes:{"Prefer":"return=representation"}}); };
  const majLigne = async (table, filtre, val) => { await connecter(); return http("/rest/v1/"+table+"?"+filtre, {methode:"PATCH", corps:val, entetes:{"Prefer":"return=minimal"}}); };
  const supprimer = async (table, filtre) => { await connecter(); return http("/rest/v1/"+table+"?"+filtre, {methode:"DELETE"}); };

  return {
    actif, uid,
    connecter,
    inscrire: nom => rpc("inscrire", {p_nom:nom}),
    maPartie: () => rpc("ma_partie"),
    recuperer: cle => rpc("recuperer", {p_cle:cle}),
    sauvegarder: async etat => { await connecter(); return majLigne("joueurs", "uid=eq."+uid(), {sauvegarde:etat, sauve_le:new Date().toISOString()}); },
    joueurs: ids => ids.length ? lire("joueurs?select=uid,nom,code&uid=in.("+ids.map(encodeURIComponent).join(",")+")") : Promise.resolve([]),
    amis: () => lire("amis?select=ami,uid&or=(uid.eq."+uid()+",ami.eq."+uid()+")"),
    ajouterAmi: code => rpc("ajouter_ami", {p_code:code}),
    retirerAmi: id => supprimer("amis", "uid=eq."+uid()+"&ami=eq."+id),
    annonces: () => lire("annonces?select=id,vendeur,objet,qte,prix,statut,acheteur,encaissee,cree&order=cree.desc&limit=200"),
    publier: (objet, qte, prix) => ecrire("annonces", {objet, qte, prix}),
    acheter: id => rpc("acheter", {p_id:id}),
    retirer: id => rpc("retirer", {p_id:id}),
    encaisser: id => rpc("encaisser", {p_id:id}),
    cadeaux: () => lire("cadeaux?select=id,de,a,objet,qte,mot,recu,cree&order=cree.desc&limit=100"),
    offrir: (a, objet, qte, mot) => ecrire("cadeaux", {a, objet, qte, mot}),
    recevoir: id => rpc("recevoir", {p_id:id}),
  };
})();

/* ============================================================
   CONTENU DE LA LISIÈRE
   Tout ce qui se voit et se joue est ici. Le moteur (moteur.js) ne connaît
   aucun nom de zone, de plante, de visiteur ni d'objet : il lit ces listes.

   Pour ajouter quelque chose, on ajoute une entrée. Rien d'autre à modifier.

   Chaque condition reçoit un contexte `c` :
     c.etat        l'état sauvegardé (zones, lunes, matières, visites, secrets, objets…)
     c.pluie       true s'il pleut ou s'il y a tempête (décidé par la date, pour toute la journée)
     c.temps       "clair" | "nuageux" | "brume" | "pluie" | "tempete" (voir TEMPS) ; c.moment : id du moment fin (voir MOMENTS)
     c.heure       heure locale réelle (0-23) ; c.minute : minutes depuis minuit ; c.soleil : {lever, coucher} en minutes
     c.phase       "aube" | "jour" | "crepuscule" | "nuit" (voir PHASES)
     c.zone        id de la zone évaluée (pour les visiteurs) ou de la zone affichée
     c.aPlante(nom, avancement [, zone])  une plante de ce nom a dépassé cet avancement (0 à 1)
     c.nb(filtre [, zone])  nombre de pots vérifiant filtre(pot) dans la zone (ou toutes si zone="*")
     c.objet(id)   true si l'objet a été fabriqué
     c.bati(id)    true si le bâtiment du village est terminé
     c.evt         l'événement qui vient d'arriver, ou null (voir SECRETS)
   ============================================================ */

const CONTENU = {};

/* ---------- MOMENTS DU JOUR ----------
   Six moments, calés sur le vrai lever et coucher du soleil (REGLES.lieu), calculés chaque jour :
     aube : de 50 min avant le lever à 30 min après      matin : jusqu'à 11 h 30      midi : 11 h 30 à 14 h 30
     apresmidi : jusqu'à 90 min avant le coucher          soir : jusqu'à 50 min après le coucher      nuit : le reste
   `phase` est le regroupement grossier que les conditions peuvent préférer : aube | jour | crepuscule | nuit.
   ciel : "soleil" ou "lune" ; sonore : "oiseaux", "calme", "grillons" ; teinte : couleur et opacité posées sur la carte de jour.
   phrase : texte d'en-tête par temps (clair, nuageux, brume, pluie, tempete).
*/
CONTENU.MOMENTS = [
  {id:"aube", nom:"L'aube", phase:"aube", ciel:"soleil", sonore:"oiseaux", lucioles:false, etoiles:false, carte:"nuit", teinte:["#f4b478",.22],
   phrase:{clair:"La rosée est tombée, la mare s'éclaire.", nuageux:"Un ciel bas et gris, la rosée quand même.", brume:"La brume tient sur l'étang. On n'y voit pas l'autre rive.", pluie:"Aube grise. La pluie a remplacé la rosée.", tempete:"Le vent s'est levé avant le jour. Tout plie."}},
  {id:"matin", nom:"Le matin", phase:"jour", ciel:"soleil", sonore:"oiseaux", lucioles:false, etoiles:false, carte:"jour", teinte:["#fff1b8",.08],
   phrase:{clair:"Lumière rasante, herbe mouillée. Les abeilles sortent.", nuageux:"Matin couvert, doux. Les oiseaux chantent quand même.", brume:"La brume se déchire par endroits. Le soleil arrive.", pluie:"Pluie de matin, fine et régulière.", tempete:"Tempête. Les volets claquent, l'étang moutonne."}},
  {id:"midi", nom:"Midi", phase:"jour", ciel:"soleil", sonore:"calme", lucioles:false, etoiles:false, carte:"jour", teinte:["#ffffff",0],
   phrase:{clair:"Plein soleil. Tout se tait, sauf les abeilles.", nuageux:"Nuages blancs, grands et lents. Lumière égale.", brume:"Brume de chaleur sur la clairière.", pluie:"Averse de midi. Ça ne durera pas, ou si.", tempete:"Le ciel est noir en plein midi. Rentre les pots, si tu pouvais."}},
  {id:"apresmidi", nom:"L'après-midi", phase:"jour", ciel:"soleil", sonore:"oiseaux", lucioles:false, etoiles:false, carte:"jour", teinte:["#f4c27a",.08],
   phrase:{clair:"Tiède et lent. La mare pousse, la coccinelle dort.", nuageux:"Ciel couvert, air lourd. Il se prépare quelque chose, ou rien.", brume:"Une brume légère, qui vient de l'étang.", pluie:"Pluie d'après-midi, la terre boit.", tempete:"Tempête d'après-midi. Le bois gronde."}},
  {id:"soir", nom:"Le soir", phase:"crepuscule", ciel:"lune", sonore:"calme", lucioles:true, etoiles:true, carte:"nuit", teinte:["#e07a5a",.22],
   phrase:{clair:"Les premières lucioles, la mare s'endort.", nuageux:"Soir gris. Pas de lucioles, mais les grenouilles.", brume:"La brume remonte de l'étang avec le soir.", pluie:"Soir de pluie. L'eau fait des ronds dans le noir.", tempete:"Le vent redouble avec la nuit."}},
  {id:"nuit", nom:"La nuit", phase:"nuit", ciel:"lune", sonore:"grillons", lucioles:true, etoiles:true, carte:"nuit", teinte:["#141a2e",0],
   phrase:{clair:"Nuit claire. Croissant de lune.", nuageux:"Nuit couverte, sans lune. Les lucioles brillent plus.", brume:"Nuit de brume. Les sons portent loin.", pluie:"Il pleut cette nuit. La terre boit toute seule, et d'autres bêtes sortent.", tempete:"Nuit de tempête. Rien ne sort, sauf ce qui n'a pas le choix."},
   phrasePleine:"Nuit claire. Pleine lune."},
];

/* ---------- TEMPS ----------
   Un temps par jour, tiré de la date (le même toute la journée, pour tout le monde), avec des poids par saison.
   pluie : la terre est arrosée toute seule (averses) ; visites : multiplicateur sur la fréquence des visiteurs ;
   seuls : s'il est renseigné, seuls ces visiteurs sortent.
*/
CONTENU.TEMPS = [
  {id:"clair",   nom:"Clair",   pluie:false, visites:1,   poids:{hiver:30, printemps:45, ete:55, automne:38}},
  {id:"nuageux", nom:"Nuageux", pluie:false, visites:.9,  poids:{hiver:30, printemps:25, ete:20, automne:28}},
  {id:"brume",   nom:"Brume",   pluie:false, visites:.8,  poids:{hiver:15, printemps:10, ete:5,  automne:14}},
  {id:"pluie",   nom:"Pluie",   pluie:true,  visites:.8,  poids:{hiver:20, printemps:15, ete:10, automne:15}},
  {id:"tempete", nom:"Tempête", pluie:true,  visites:.3,  poids:{hiver:5,  printemps:5,  ete:10, automne:5}, seuls:["canard","grenouille","escargot"]},
];

/* ---------- ZONES ----------
   Chaque zone a ses pots, ses graines, son sentier. `type` choisit le dessin du pot ("terre" ou "eau").
   `rosee` : la zone utilise la réserve de rosée. Une zone sans rosée a des plantes à besoin "lumiere" ou "pluie".
   `ouvrir` : condition pour que l'onglet apparaisse (null = toujours).
*/
CONTENU.ZONES = [
  {id:"potager", nom:"Potager", emoji:"🌱", type:"terre", colonnes:3, nbPots:12, prixPot:[0,0,0,0,10,20,35,60,100,160,250,400], rosee:true,
   graines:["radis","tulipe","lavande","citrouille","champignon"], ouvrir:null,
   sentierCalme:"Le sentier est calme. Les visiteurs viennent selon ce qui pousse, et selon l'heure.",
   sentierPluie:"La pluie tambourine sur le sentier. Certains aiment ça.",
   vide:"terre libre", verrou:"🔒", msgOuvrir:"Un pot de plus. La rosée du matin sera plus généreuse."},
  {id:"mare", nom:"Mare", emoji:"💧", type:"eau", colonnes:3, nbPots:8, prixPot:[0,0,15,30,60,120,200,320], rosee:false,
   graines:["nenuphar","roseau","iris","lotus"], ouvrir:c=>c.bati("cabane") || c.nb(p=>p.ouvert,"potager")>=6,
   sentierCalme:"La berge est calme. Ce qui vit ici vient le jour, surtout.",
   sentierPluie:"La pluie fait des ronds sur l'eau. La mare aime ça.",
   vide:"eau libre", verrou:"🔒", msgOuvrir:"Un coin d'eau de plus. La mare s'agrandit."},
];

/* ---------- PLANTES ----------
   zone   : où elle se sème
   duree  : secondes de pousse quand son besoin est satisfait
   besoin : "rosee" (par défaut : une goutte lui donne `soif` secondes d'eau, puis elle ralentit)
            "pluie"   (ne se sème que sous la pluie, n'a jamais soif)
            "lumiere" (ne pousse qu'à l'aube et le jour, jamais soif ; la nuit elle attend)
   prix   : en or (0 = gratuit, null = pas en vente, obtenue autrement)
   valeur : or que le colporteur en donne ; les lettres de la ville paient davantage
   rare   : nom de la variante rare (chance à chaque récolte, trois fois la valeur)
   matiere : {id, proba} matière rare laissée parfois à la récolte
   g      : genre grammatical ; art : dessin (quatre stades) ; graine : se sème avec une graine rare
*/
CONTENU.PLANTES = {
  /* durées en secondes : minutes et heures réelles. Le jeu s'ouvre quelques fois par jour, pas en continu. */
  radis:      {zone:"potager", nom:"Radis",         g:"m", emoji:"🌱", duree:600,   prix:0,    rare:"Radis doré", valeur:3,   soif:360,   art:"radis"},        // 10 min
  tulipe:     {zone:"potager", nom:"Tulipe",        g:"f", emoji:"🌷", duree:2400,  prix:5,    rare:"Tulipe perroquet", valeur:12,  soif:1200,  art:"tulipe"},       // 40 min
  lavande:    {zone:"potager", nom:"Lavande",       g:"f", emoji:"🪻", duree:7200,  prix:15,   rare:"Lavande blanche", valeur:36,  soif:3600,  art:"lavande"},      // 2 h
  citrouille: {zone:"potager", nom:"Citrouille",    g:"f", emoji:"🎃", duree:28800, prix:40,   rare:"Citrouille bleue", valeur:100, soif:14400, art:"citrouille"},   // 8 h
  champignon: {zone:"potager", nom:"Champignon",    g:"m", emoji:"🍄", duree:1800,  prix:3,    rare:"Cèpe d'automne", valeur:15,  soif:0,     art:"champi", besoin:"pluie"}, // 30 min
  lunefleur:  {zone:"potager", nom:"Fleur de lune", g:"f", emoji:"🌼", duree:21600, prix:null, rare:"Fleur de lune double", valeur:120, soif:10800, art:"lune", graine:true},      // 6 h
  nenuphar:   {zone:"mare", nom:"Nénuphar",   g:"m", emoji:"🪷", duree:1800,  prix:0,  rare:"Nénuphar blanc", valeur:5,   art:"nenuphar", besoin:"lumiere"},   // 30 min de jour
  roseau:     {zone:"mare", nom:"Roseau",     g:"m", emoji:"🌾", duree:7200,  prix:10, rare:"Roseau de soie", valeur:25,  art:"roseau",   besoin:"lumiere"},   // 2 h de jour
  iris:       {zone:"mare", nom:"Iris d'eau", g:"m", emoji:"🪻", duree:18000, prix:30, rare:"Iris blanc", valeur:70,  art:"iris",     besoin:"lumiere"},   // 5 h de jour
  lotus:      {zone:"mare", nom:"Lotus",      g:"m", emoji:"🌸", duree:43200, prix:80, rare:"Lotus bleu", valeur:200, art:"lotus",    besoin:"lumiere", matiere:{id:"nacre", proba:.5}}, // 12 h de jour, soit deux jours
};

/* ---------- MATIÈRES RARES ----------
   Obtenues en saluant certains visiteurs ou en récoltant certaines plantes. Servent à l'atelier.
*/
CONTENU.MATIERES = {
  miel:  {nom:"Miel",  emoji:"🍯", texte:"Laissé par l'abeille quand on la salue."},
  nacre: {nom:"Nacre", emoji:"🐚", texte:"Trouvée dans la vase de la mare, sous les lotus, ou apportée par la carpe."},
  /* matériaux de chantier et outils : achetés aux étals du marché (ou livrés par abonnement) */
  bois:   {nom:"Planche",  g:"f", emoji:"🪵", chantier:true, texte:"Des planches de chêne, sciées par Firmin."},
  clous:  {nom:"Clou",     g:"m", emoji:"🔩", chantier:true, texte:"Des clous forgés, vendus au poids par Mme Loiseau."},
  pierre: {nom:"Pierre",   g:"f", emoji:"🪨", chantier:true, texte:"De la pierre de taille, montée de la carrière par Gaspard."},
  tuiles: {nom:"Tuile",    g:"f", emoji:"🧱", chantier:true, texte:"Des tuiles de terre cuite, encore un peu tièdes du four."},
  verre:  {nom:"Vitre",    g:"f", emoji:"🪟", chantier:true, texte:"Des vitres soufflées, une à une. Mme Loiseau les emballe dans du journal."},
  arbre:  {nom:"Jeune poirier", g:"m", emoji:"🌳", chantier:true, texte:"Un jeune arbre en motte, de chez Rose la pépiniériste."},
  marteau:{nom:"Marteau",  g:"m", emoji:"🔨", outil:true, texte:"Il en faut un pour bâtir quoi que ce soit."},
  scie:   {nom:"Scie",     g:"f", emoji:"🪚", outil:true, texte:"Pour tout ce qui est en bois."},
  truelle:{nom:"Truelle",  g:"f", emoji:"🧰", outil:true, texte:"Pour tout ce qui est en pierre."},
};

/* ---------- VISITEURS ----------
   zone    : berge ou sentier où il se montre
   emoji   : son image ; ou `svg` : un dessin inline (viewBox 0 0 100 100) quand aucun emoji ne convient
   periode : temps moyen (s) avant qu'il se montre quand sa condition est vraie
   don     : lunes données quand on le salue ; graine = probabilité de laisser une graine de fleur de lune ;
             matiere = {id, proba} matière rare laissée parfois
   indice  : texte du carnet tant qu'il n'a pas été vu ; texte : une fois vu
*/
CONTENU.VISITEURS = [
  {id:"papillon", zone:"potager", nom:"Papillon de nuit", emoji:"🦋", periode:120, don:{lunes:2},
   cond:c=>!c.pluie && (c.phase==="nuit"||c.phase==="crepuscule") && c.aPlante("lavande",.5),
   indice:"Quelque chose de parfumé l'attire, par nuit sèche.",
   texte:"Il tourne autour de la lavande, se pose, repart. Il ne sort jamais sous la pluie."},
  {id:"escargot", zone:"potager", nom:"Escargot", emoji:"🐌", periode:150, don:{lunes:1},
   cond:c=>c.pluie || c.temps==="brume" || c.phase==="aube" || c.nb(p=>p.plante && p.eau>0 && p.eau<10)>0,
   indice:"Il aime la terre humide, et l'heure où elle l'est.",
   texte:"Il arrive après la rosée ou avec la pluie, quand la terre est fraîche. Pas pressé. Jamais."},
  {id:"grenouille", zone:"potager", nom:"Grenouille", emoji:"🐸", periode:110, don:{lunes:2},
   cond:c=>c.pluie && c.nb(p=>p.plante)>0,
   indice:"Elle n'aime que les jours mouillés.",
   texte:"Elle ne vient au potager que sous la pluie, et chante dès qu'il y a quelque chose de planté. Un seul coassement, puis elle écoute."},
  {id:"herisson", zone:"potager", nom:"Hérisson", emoji:"🦔", periode:180, don:{lunes:3},
   cond:c=>(c.phase==="nuit"||c.phase==="crepuscule") && c.aPlante("radis",1),
   indice:"Un légume mûr sous terre l'intéresse, une fois la nuit tombée.",
   texte:"Un radis mûr le fait sortir des feuilles mortes. Il renifle tout, puis s'en va satisfait."},
  {id:"chat", zone:"potager", nom:"Chat de passage", emoji:"🐈", periode:240, don:{lunes:1, graine:.05},
   cond:c=>c.nb(p=>p.plante)>=4,
   indice:"Il faut un jardin déjà bien occupé.",
   texte:"Il ne vient pas pour les plantes mais pour le jardinier. Il laisse, très rarement, tomber une graine qu'il transportait dans sa fourrure."},
  {id:"hibou", zone:"potager", nom:"Hibou", emoji:"🦉", periode:300, don:{lunes:6},
   cond:c=>!c.pluie && c.aPlante("citrouille",.6) && (c.heure>=22 || c.heure<6),
   indice:"Il ne sort que tard, par nuit claire, près de quelque chose de gros et orange.",
   texte:"Il ne se montre que la nuit profonde et sèche, perché au-dessus des citrouilles. Il hulule deux fois avant de partir."},
  {id:"renard", zone:"potager", nom:"Renard", emoji:"🦊", periode:420, don:{lunes:3, graine:.3},
   cond:c=>(c.phase==="nuit"||c.phase==="aube") && c.nb(p=>p.ouvert)>=9,
   indice:"Il faut un très grand jardin, et une heure où personne ne regarde.",
   texte:"Un grand jardin attire les curieux. Le renard ne vole rien : il laisse parfois une graine de fleur de lune, et personne ne sait pourquoi."},
  {id:"abeille", zone:"potager", nom:"Abeille", emoji:"🐝", periode:90, don:{lunes:2, matiere:{id:"miel", proba:.6}},
   cond:c=>c.phase==="jour" && !c.pluie && (c.aPlante("tulipe",.5)||c.aPlante("lavande",.5)),
   indice:"Elle travaille le jour, quand quelque chose est en fleur.",
   texte:"Elle fait le tour des fleurs ouvertes sans en oublier une, puis repart chargée. Elle laisse souvent un peu de miel pour la peine."},
  {id:"merle", zone:"potager", nom:"Merle", emoji:"🐦", periode:120, don:{lunes:2},
   cond:c=>(c.phase==="aube"||c.phase==="jour") && c.nb(p=>p.plante)>=2,
   indice:"Il chante dès que le ciel pâlit, s'il y a de quoi fouiller.",
   texte:"Il arrive avec le premier gris du matin, fouille la terre des pots, chante une phrase et s'en va. Le même, chaque fois."},
  {id:"coccinelle", zone:"potager", nom:"Coccinelle", emoji:"🐞", periode:160, don:{lunes:3},
   cond:c=>c.phase==="jour" && c.temps==="clair" && c.nb(p=>p.plante)>=3,
   indice:"Elle aime le soleil et un jardin déjà garni.",
   texte:"Elle se pose sur une feuille, replie ses ailes avec soin, et reste là. On dit qu'elle porte chance. Elle porte surtout un beau rouge."},
  {id:"chauvesouris", zone:"potager", nom:"Chauve-souris", emoji:"🦇", periode:140, don:{lunes:3},
   cond:c=>c.phase==="crepuscule" && !c.pluie && c.nb(p=>p.plante)>=2,
   indice:"Elle ne se montre qu'entre chien et loup.",
   texte:"Elle sort au crépuscule, jamais avant, jamais après. Elle traverse le jardin trois fois en zigzag, puis la nuit l'avale."},
  {id:"chatnoir", zone:"potager", nom:"Chat noir", emoji:"🐈‍⬛", periode:200, don:{lunes:4},
   cond:c=>c.fete==="citrouilles" && (c.phase==="nuit"||c.phase==="crepuscule") && c.aPlante("citrouille",.5),
   indice:"Il ne vient qu'à la saison des citrouilles, quand il fait noir.",
   texte:"Il ne vient qu'aux alentours de la nuit des citrouilles. Il s'assoit à côté de la plus grosse et attend qu'on la creuse. Il a l'air de savoir comment ça se passe."},
  /* mare */
  {id:"libellule", zone:"mare", nom:"Libellule", periode:90, don:{lunes:2},
   svg:`<g fill="none" stroke-linecap="round"><path d="M50 30 v52" stroke="#4fb3c9" stroke-width="7"/><path d="M50 36 v44" stroke="#2a7d93" stroke-width="2" stroke-dasharray="4 5"/><circle cx="50" cy="26" r="8" fill="#3a9bb5" stroke="none"/><circle cx="46" cy="24" r="3" fill="#0d2a33" stroke="none"/><circle cx="54" cy="24" r="3" fill="#0d2a33" stroke="none"/><ellipse cx="29" cy="40" rx="20" ry="7" fill="rgba(200,235,245,.55)" stroke="#bfe6f0" stroke-width="1.5" transform="rotate(-18 29 40)"/><ellipse cx="71" cy="40" rx="20" ry="7" fill="rgba(200,235,245,.55)" stroke="#bfe6f0" stroke-width="1.5" transform="rotate(18 71 40)"/><ellipse cx="31" cy="54" rx="18" ry="6" fill="rgba(200,235,245,.45)" stroke="#bfe6f0" stroke-width="1.5" transform="rotate(8 31 54)"/><ellipse cx="69" cy="54" rx="18" ry="6" fill="rgba(200,235,245,.45)" stroke="#bfe6f0" stroke-width="1.5" transform="rotate(-8 69 54)"/></g>`,
   cond:c=>c.phase==="jour" && !c.pluie && c.aPlante("nenuphar",.5),
   indice:"Elle vole au-dessus de ce qui flotte, au soleil.",
   texte:"Elle reste immobile en l'air, puis change de place d'un coup, comme si elle avait oublié quelque chose. Bleue, puis verte, selon la lumière."},
  {id:"carpe", zone:"mare", nom:"Carpe", emoji:"🐟", periode:150, don:{lunes:3, matiere:{id:"nacre", proba:.4}},
   cond:c=>c.nb(p=>p.plante)>=3,
   indice:"Il lui faut de l'ombre sur l'eau.",
   texte:"On ne la voit que quand elle le veut : un dos qui affleure sous les feuilles, un rond, puis rien. Elle remonte parfois une nacre du fond."},
  {id:"canard", zone:"mare", nom:"Canard", emoji:"🦆", periode:120, don:{lunes:2},
   cond:c=>c.pluie && (c.phase==="jour"||c.phase==="aube"),
   indice:"Il aime les jours où tout le monde reste dedans.",
   texte:"Il arrive sous la pluie, l'air ravi, et fait le tour de la mare comme s'il en était le propriétaire. Il repart quand ça s'arrête."},
  {id:"triton", zone:"mare", nom:"Triton", emoji:"🦎", periode:200, don:{lunes:4},
   cond:c=>c.phase==="nuit" && c.aPlante("roseau",.5),
   indice:"Il se cache dans les tiges, et ne sort que dans le noir.",
   texte:"Petit dragon de mare. Il sort la nuit, entre les roseaux, et s'en retourne au fond dès que le ciel pâlit."},
  {id:"heron", zone:"mare", nom:"Héron", periode:360, don:{lunes:8},
   svg:`<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M52 60 q-22 0 -20 -16 q4 -12 22 -10 q14 2 12 16 q-2 10 -14 10z" fill="#aeb9c9"/><path d="M60 40 q4 -16 -2 -24 q-6 -6 -12 -2" stroke="#aeb9c9" stroke-width="6"/><circle cx="44" cy="14" r="7" fill="#cfd8e4"/><circle cx="42" cy="13" r="1.8" fill="#1b2430"/><path d="M38 15 l-16 3 l16 2z" fill="#e8b25a"/><path d="M50 14 q8 -2 12 2" stroke="#2b3444" stroke-width="2.5"/><path d="M48 60 v26 M56 60 v26" stroke="#e8b25a" stroke-width="2.5"/><path d="M44 86 h8 M52 86 h8" stroke="#e8b25a" stroke-width="2.5"/><path d="M30 92 q20 -6 40 0" stroke="#5f93c7" stroke-width="2" opacity=".7"/></g>`,
   cond:c=>(c.phase==="aube" || c.temps==="brume") && !c.pluie && c.nb(p=>p.ouvert)>=6,
   indice:"Il ne vient qu'à l'heure grise, ou dans la brume, sur une grande mare.",
   texte:"Il se tient sur une patte au bord de l'eau, si immobile qu'on le prend pour un roseau. Puis il s'envole lentement, et la mare paraît plus petite."},
];

/* ---------- HABITANTS ----------
   Un visiteur qui finit par rester. Il apparaît en bout de sentier de sa zone quand `cond` est vraie.
   indice   : comment le faire rester (montré dans le carnet tant qu'il n'est pas là)
   premiere : secondes avant sa première demande ; delai : secondes entre deux demandes
   aime     : ce qu'il préfère recevoir (double de lunes et d'amitié quand on le lui offre)
   souvenirs: trois lignes, ouvertes à 3, 6 et 10 d'amitié
   demandes : dans l'ordre. Chacune :
     texte   : ce qu'il dit (poétique) ; but : la condition en clair
     offrir  : {objet: n} si elle se satisfait en donnant depuis le panier ; sinon cond(c) se valide toute seule
     prog(c) : [fait, total] pour la barre de progression (facultatif)
     don en lunes, histoire (fragment ouvert dans le carnet)
*/
CONTENU.HABITANTS = [
  {id:"chat", zone:"potager", nom:"Le chat", emoji:"🐈", titre:"Il dort.", cond:c=>!!c.etat.secrets.adopte,
   indice:"Un visiteur fidèle finit par rester.",
   sentier:"Le chat dort au bout du sentier. Les autres viennent selon ce qui pousse.",
   premiere:600, delai:7200, aime:["lavande","poire","tisane"],
   souvenirs:["Il s'est assis sur tes pieds. Il fait ça aux gens qu'il a classés.","Il t'a apporté une feuille morte, très sérieusement, et l'a posée devant la porte.","Il ronronne quand tu arrives. Pas quand tu pars. Il a ses principes."],
   demandes:[
     {id:"lavande", texte:"Il voudrait de la lavande pour sa sieste.", but:"Lui offrir 1 lavande", offrir:{lavande:1}, don:6,
      histoire:"Il s'est couché dans la lavande et n'a plus bougé jusqu'au soir. En se relevant, il sentait la lavande. Il a eu l'air de trouver ça normal."},
     {id:"poisson", texte:"Il regarde la mare depuis une heure. Il voudrait y voir un poisson.", but:"Saluer la carpe une fois, à la mare", cond:c=>(c.etat.visites.carpe||0)>0, prog:c=>[Math.min(1,c.etat.visites.carpe||0),1], don:8,
      histoire:"La carpe est remontée, il a plongé une patte, elle est redescendue. Il a regardé sa patte mouillée longtemps. Il n'a pas réessayé, mais il revient chaque jour vérifier qu'elle est encore là."},
     {id:"banc", texte:"Il voudrait un endroit en hauteur pour surveiller.", but:"Fabriquer le banc à l'atelier (5 miels)", cond:c=>c.objet("banc"), don:10,
      histoire:"Il a pris le banc le soir même. Depuis, il y dort la moitié de la journée et surveille l'autre moitié. On ne sait pas ce qu'il surveille. Lui non plus, sans doute."},
   ]},
  {id:"merle", zone:"potager", nom:"Le merle", emoji:"🐦", titre:"Il niche.", cond:c=>c.objet("nichoir"),
   indice:"Il lui faut un endroit où nicher.",
   sentier:"Le merle a pris le nichoir. Il chante à l'aube, pour tout le monde.",
   premiere:900, delai:7200, aime:["radis","poire","tarte"],
   souvenirs:["Il a ajouté une note à sa phrase du matin. Une seule. Elle est pour toi, sans doute.","Il t'a suivi jusqu'à la mare en sautillant, à bonne distance, pour voir.","Il s'est posé sur le manche de l'arrosoir. Il n'en a jamais eu besoin, mais il aime y être."],
   demandes:[
     {id:"vers", texte:"Il cherche des vers dans la terre retournée.", but:"Avoir 3 radis en terre en même temps (mûrs ou non)", cond:c=>c.nb(p=>p.plante==="radis","potager")>=3, prog:c=>[Math.min(3,c.nb(p=>p.plante==="radis","potager")),3], don:5,
      histoire:"Il a retourné la terre des trois pots avec méthode, sans abîmer un radis. Il a trouvé ce qu'il cherchait. Il a chanté un peu plus longtemps que d'habitude ce matin-là."},
     {id:"aube", texte:"Il voudrait que tu sois là quand il chante.", but:"Ouvrir le jeu à l'aube (autour du lever du soleil)", cond:c=>c.phase==="aube", don:8,
      histoire:"Tu étais là. Il a chanté sa phrase, la même que tous les matins, mais tournée vers toi. Puis il a recommencé, un ton plus haut, comme pour vérifier que tu avais bien écouté."},
     {id:"pluie", texte:"Il voudrait regarder la pluie tomber depuis le nichoir.", but:"Ouvrir le jeu un jour de pluie", cond:c=>c.pluie, don:6,
      histoire:"Il est resté à l'entrée du nichoir toute l'averse, la tête penchée. Les merles aiment la pluie : elle fait sortir les vers. Mais là, il ne cherchait rien. Il regardait."},
   ]},
  {id:"herisson", zone:"potager", nom:"Le hérisson", emoji:"🦔", titre:"Il hiberne presque.", cond:c=>(c.etat.visites.herisson||0)>=6,
   indice:"À force de le saluer, il pourrait rester.",
   sentier:"Le hérisson a son tas de feuilles au bout du sentier. Il ronfle, un peu.",
   premiere:900, delai:7200, aime:["champignon","poire","citrouille"],
   souvenirs:["Il a dormi contre ta botte. Tu n'as pas bougé pendant une heure.","Il t'a montré où il range ses glands. C'est un secret, maintenant c'est le vôtre.","Il vient te voir même le jour, en clignant des yeux. C'est un gros effort pour un hérisson."],
   demandes:[
     {id:"citrouille", texte:"Il voudrait un abri plus grand, rond et orange.", but:"Lui offrir 1 citrouille", offrir:{citrouille:1}, don:7,
      histoire:"Il a fait le tour de la citrouille, a trouvé le creux entre deux côtes, et s'y est installé comme si elle avait poussé pour ça. Ce qui est peut-être le cas."},
     {id:"nuit", texte:"Il voudrait que tu viennes le voir à son heure.", but:"Ouvrir le jeu la nuit", cond:c=>c.phase==="nuit", don:6,
      histoire:"La nuit, il est quelqu'un d'autre : rapide, curieux, bruyant dans les feuilles. Il t'a reniflé les pieds, a décidé que ça allait, et a continué sa ronde."},
     {id:"champignon", texte:"Il voudrait un champignon, et il sait qu'il n'en pousse que sous la pluie.", but:"Lui offrir 1 champignon (il ne se sème que les jours de pluie)", offrir:{champignon:1}, don:9,
      histoire:"Tu lui as laissé le champignon. Il l'a mangé lentement, par le bord, en fermant les yeux. Les hérissons mangent les yeux fermés quand c'est bon."},
   ]},
  {id:"carpe", zone:"mare", nom:"La carpe", emoji:"🐟", titre:"Elle reste au fond.", cond:c=>(c.etat.visites.carpe||0)>=5,
   indice:"Une mare où l'on revient souvent finit par être un chez-soi.",
   sentier:"La carpe a élu domicile sous les feuilles. Un rond, de temps en temps.",
   premiere:900, delai:7200, aime:["nenuphar","lotus","lunefleur"],
   souvenirs:["Elle remonte quand ton ombre passe sur l'eau. Pas pour les autres.","Elle a laissé une nacre sur la pierre plate. Puis une deuxième, pour être sûre.","Elle a fait le tour complet de la mare devant toi, lentement. Une visite guidée."],
   demandes:[
     {id:"ombre", texte:"Elle voudrait plus d'ombre sur l'eau.", but:"Avoir 3 nénuphars mûrs en même temps dans la mare, sans les récolter", cond:c=>c.nb(p=>p.plante==="nenuphar" && p.age>=CONTENU.PLANTES.nenuphar.duree,"mare")>=3, prog:c=>[Math.min(3,c.nb(p=>p.plante==="nenuphar" && p.age>=CONTENU.PLANTES.nenuphar.duree,"mare")),3], don:6,
      histoire:"Sous les trois feuilles, l'eau est noire et fraîche. Elle y reste des heures. On ne la voit plus qu'à l'ombre qu'elle fait sur le fond, quand le soleil passe entre deux feuilles."},
     {id:"lotus", texte:"Elle voudrait voir un lotus ouvert, depuis dessous.", but:"Avoir un lotus mûr dans la mare (12 h de jour)", cond:c=>c.aPlante("lotus",1,"mare"), prog:c=>[Math.round(100*Math.min(1,Math.max(0,...c.etat.zones.mare.pots.filter(p=>p.plante==="lotus").map(p=>p.age/CONTENU.PLANTES.lotus.duree)))),100], don:10,
      histoire:"Elle s'est placée juste sous le lotus et a regardé la lumière rose à travers les pétales. Les poissons ne voient pas les couleurs comme nous. Mais celle-là, elle l'a regardée longtemps."},
     {id:"ronds", texte:"Elle voudrait que la pluie fasse des ronds sur l'eau, avec toi au bord.", but:"Être à la mare un jour de pluie", cond:c=>c.pluie && c.zone==="mare", don:8,
      histoire:"Chaque goutte fait un rond, chaque rond la fait remonter d'un centimètre. Tu étais au bord. Elle est restée en surface tout le temps de l'averse, ce qu'elle ne fait jamais."},
   ]},
];

/* ---------- DENRÉES ----------
   Ce qui va dans le panier sans être une plante : fruits, plats cuisinés. Les plantes récoltées y vont aussi.
   valeur : or que le colporteur en donne.
*/
CONTENU.DENREES = {
  poire:    {img:true, nom:"Poire",               g:"f", emoji:"🍐", valeur:10},
  botte:    {img:true, nom:"Botte de radis",      g:"f", emoji:"🥗", valeur:20},
  bouquet:  {img:true, nom:"Bouquet des champs",  g:"m", emoji:"💐", valeur:80},
  tisane:   {img:true, nom:"Tisane de lavande",   g:"f", emoji:"🍵", valeur:110},
  tourte:   {img:true, nom:"Tourte forestière",   g:"f", emoji:"🥧", valeur:60},
  the:      {img:true, nom:"Thé de nénuphar",     g:"m", emoji:"🫖", valeur:24},
  soupe:    {img:true, nom:"Soupe de citrouille", g:"f", emoji:"🍲", valeur:160},
  tarte:    {img:true, nom:"Tarte aux poires",    g:"f", emoji:"🥮", valeur:70},
  couronne: {img:true, nom:"Couronne d'automne",  g:"f", emoji:"🍂", valeur:200},
  sirop:    {img:true, nom:"Sirop de lotus",      g:"m", emoji:"🧉", valeur:340},
  lanterne: {img:true, nom:"Lanterne de citrouille", g:"f", emoji:"🎃", valeur:150},
  sachet:   {nom:"Sachet de lavande",   g:"m", emoji:"👝", valeur:90},
  bougie:   {nom:"Bougie de cire",      g:"f", emoji:"🕯️", valeur:65},
  mielavande:{nom:"Miel de lavande",    g:"m", emoji:"🍯", valeur:95},
  corbeille:{nom:"Panier de roseau",    g:"m", emoji:"🧺", valeur:120},
  epices:   {nom:"Pain d'épices",       g:"m", emoji:"🍞", valeur:95},
  encre:    {nom:"Encre d'iris",        g:"f", emoji:"🖋️", valeur:190},
  thesoir:  {nom:"Thé du soir",         g:"m", emoji:"🍵", valeur:180},
  veloute:  {nom:"Velouté des bois",    g:"m", emoji:"🥣", valeur:210},
  marche:   {nom:"Corbeille du marché", g:"f", emoji:"🛍️", valeur:240},
  gelee:    {nom:"Gelée de fleur de lune", g:"f", emoji:"🫙", valeur:330},
  parfum:   {nom:"Parfum de la mare",   g:"m", emoji:"🧴", valeur:450},
  festin:   {nom:"Festin de la Lisière", g:"m", emoji:"🍽️", valeur:720},
};

/* ---------- RECETTES (atelier, cuisine) ----------
   ingr      : {objet: n} pris dans le panier (plantes, denrées, plats) ou dans les matières (miel, nacre)
   prix      : lunes pour l'apprendre (0 : connue d'emblée) ; fete : seulement pendant cet événement, apprise d'office
   cuisson   : secondes réelles sur le feu (un seul feu, deux avec l'amélioration « Second feu »)
   decouverte(c) : quand la recette apparaît au carnet de cuisine (avant, on n'en voit que l'indice)
   c.vu(plante) : nombre de récoltes de cette plante ; c.amitie(habitant) ; c.chap(id) : lettre de l'histoire reçue
*/
CONTENU.RECETTES = [
  {id:"botte",    ingr:{radis:5}, prix:0, cuisson:300,
   texte:"Cinq radis liés d'un brin de raphia. Basile en met sur toutes ses tables."},
  {id:"bouquet",  ingr:{tulipe:3, lavande:1}, prix:20, cuisson:600,
   indice:"Margot en parlera quand elle te connaîtra un peu.", decouverte:c=>c.chap("margot"),
   texte:"Trois tulipes, une lavande pour tenir l'ensemble. Margot en veut toujours un sur son comptoir."},
  {id:"the",      ingr:{nenuphar:3}, prix:15, cuisson:1200,
   indice:"Il faut une mare, et quelque chose qui flotte.", decouverte:c=>c.vu("nenuphar")>=1,
   texte:"Les feuilles séchées au soleil, infusées longtemps. Ça a un goût d'eau calme."},
  {id:"tourte",   ingr:{champignon:2, radis:2}, prix:25, cuisson:2700,
   indice:"Il faudrait avoir cueilli quelque chose qui ne pousse que sous la pluie.", decouverte:c=>c.vu("champignon")>=1,
   texte:"Une pâte, deux champignons, deux radis, et le four de la cabane."},
  {id:"sachet",   ingr:{lavande:2}, prix:25, cuisson:1200,
   indice:"À force de récolter la même fleur parfumée, on finit par en garder.", decouverte:c=>c.vu("lavande")>=5,
   texte:"De la lavande séchée cousue dans un carré de lin. Pour les armoires, et pour ceux qui dorment mal."},
  {id:"bougie",   ingr:{miel:3}, prix:30, cuisson:1800,
   indice:"Quand on a plus de miel qu'on n'en mange.", decouverte:c=>(c.etat.matieres.miel||0)>=4 || c.bati("ruche"),
   texte:"La cire fondue doucement, une mèche de coton. Elle sent le miel en brûlant."},
  {id:"tisane",   ingr:{lavande:2, miel:1}, prix:18, cuisson:1800,
   indice:"Une amie d'Odile connaît sa recette.", decouverte:c=>c.chap("ruelle"),
   texte:"Lavande séchée et une cuillère de miel. Mme Ruelle dit que c'était la recette d'Odile."},
  {id:"mielavande", ingr:{miel:2, lavande:1}, prix:40, cuisson:3600,
   indice:"Il faudrait des ruches à côté des fleurs.", decouverte:c=>c.bati("ruche"),
   texte:"Le miel tiédi avec des fleurs de lavande, puis filtré. Il garde la couleur de l'été."},
  {id:"corbeille", ingr:{roseau:4}, prix:45, cuisson:3600,
   indice:"Les tiges de la mare se tressent, quand on en a assez coupé.", decouverte:c=>c.vu("roseau")>=3,
   texte:"Quatre brassées de roseaux, tressées en rond. Ça ne sert à rien de précis, donc à tout."},
  {id:"tarte",    ingr:{poire:3, miel:1}, prix:50, cuisson:3600,
   indice:"Il faudrait un arbre fruitier à la lisière.", decouverte:c=>c.bati("poirier"),
   texte:"Des poires du poirier, du miel des ruches. Tout vient d'ici."},
  {id:"soupe",    ingr:{citrouille:1, radis:3}, prix:60, cuisson:5400,
   indice:"Quelqu'un qui dort dans une citrouille connaît la recette.", decouverte:c=>c.amitie("herisson")>=3 || c.vu("citrouille")>=3,
   texte:"Une citrouille entière pour une marmite. Elle tient chaud jusqu'au lendemain."},
  {id:"epices",   ingr:{miel:2, poire:2}, prix:60, cuisson:5400,
   indice:"Margot a une recette d'hiver ; il lui faut des poires et du miel d'ici.", decouverte:c=>c.chap("margot") && c.bati("poirier") && c.bati("ruche"),
   texte:"La recette de Margot, qui la tient de sa grand-mère, qui la tenait d'Odile. Ou l'inverse."},
  {id:"couronne", ingr:{roseau:2, lavande:2, miel:1}, prix:70, cuisson:3600,
   indice:"L'instituteur en accroche une à la porte de l'école.", decouverte:c=>c.chap("lebrun"),
   texte:"Des roseaux tressés, de la lavande, des feuilles rousses ramassées au bord du bois, et un peu de miel pour que tout tienne. On l'accroche aux portes quand les jours raccourcissent."},
  {id:"encre",    ingr:{iris:2, nacre:1}, prix:80, cuisson:7200,
   indice:"Une vieille encre se fait avec des racines d'iris. L'instituteur le sait.", decouverte:c=>c.chap("lebrun") && c.vu("iris")>=1,
   texte:"Les racines d'iris broyées, un peu de nacre pilée pour l'éclat. Une encre bleu-violet que M. Lebrun réserve aux bulletins."},
  {id:"thesoir",  ingr:{the:1, lavande:1, miel:1}, prix:90, cuisson:2700,
   indice:"Celle qui soigne le village a un mélange pour dormir.", decouverte:c=>c.chap("mare"),
   texte:"Le thé de nénuphar, une pincée de lavande, le miel à la fin. Camille le prescrit sans ordonnance."},
  {id:"veloute",  ingr:{champignon:3, citrouille:1}, prix:100, cuisson:7200,
   indice:"Le hérisson, quand il te fera vraiment confiance.", decouverte:c=>c.amitie("herisson")>=6,
   texte:"Champignons et citrouille, longtemps, à feu doux. Le hérisson surveille la marmite sans rien dire."},
  {id:"sirop",    ingr:{lotus:1, miel:2}, prix:140, cuisson:7200,
   indice:"La pharmacienne connaît une recette au lotus.", decouverte:c=>c.chap("mare") && c.vu("lotus")>=1,
   texte:"Le lotus confit dans le miel. Camille en fait des gouttes contre la mélancolie. Elle ne garantit rien."},
  {id:"marche",   ingr:{botte:1, bouquet:1, tarte:1}, prix:110, cuisson:1800,
   indice:"Quand toute la ville te connaîtra, on te demandera un panier complet.", decouverte:c=>c.etat.ville.livrees>=10,
   texte:"Une botte, un bouquet, une tarte, dans un panier avec un torchon à carreaux. Le samedi, à Saint-Aubin, c'est comme ça."},
  {id:"gelee",    ingr:{lunefleur:1, miel:2}, prix:160, cuisson:10800,
   indice:"Il faudrait avoir vu s'ouvrir une fleur qui luit la nuit.", decouverte:c=>c.vu("lunefleur")>=1,
   texte:"La fleur de lune cuite dans le miel jusqu'à devenir une gelée pâle, qui luit un peu dans le noir du placard."},
  {id:"parfum",   ingr:{iris:1, lotus:1, nacre:2}, prix:200, cuisson:14400,
   indice:"La mare a un parfum. Il faudrait connaître toutes ses fleurs, même les rares.", decouverte:c=>c.vu("lotus")>=3 && c.vu("iris")>=3 && ((c.etat.herbier.lotus||{}).rare||0)+((c.etat.herbier.iris||{}).rare||0)>=1,
   texte:"L'iris pour le fond, le lotus pour le cœur, la nacre pour que ça tienne. Une goutte suffit pour sentir la mare un matin d'été."},
  {id:"festin",   ingr:{soupe:1, tarte:1, couronne:1}, prix:250, cuisson:14400,
   indice:"Pour la fête de la Lisière, si elle a lieu un jour.", decouverte:c=>c.chap("fete"),
   texte:"La soupe, la tarte, la couronne au milieu de la table. De quoi nourrir le conseil municipal, qui l'a voté."},
  {id:"lanterne", ingr:{citrouille:1, miel:1}, prix:0, cuisson:1800, fete:"citrouilles",
   texte:"Une citrouille évidée, une bougie de cire d'abeille dedans. Pour la nuit des citrouilles."},
];

/* ---------- AMÉLIORATIONS (atelier, payées en lunes) ----------
   niveaux : prix en lunes de chaque niveau ; effet(n) : effets au niveau n (mêmes clés que fx, plus
   vitesse:{zone:multiplicateur}, rare:chance ajoutée, lettres:lettres en plus par jour)
*/
CONTENU.AMELIORATIONS = [
  {id:"terre",  nom:"Terre de bruyère", emoji:"🪴", niveaux:[15,40,90],
   texte:"Le potager pousse plus vite : +15 % par niveau.", effet:n=>({vitesse:{potager:1+.15*n}})},
  {id:"eau",    nom:"Eau claire", emoji:"💧", niveaux:[20,50,110],
   texte:"La mare pousse plus vite : +15 % par niveau.", effet:n=>({vitesse:{mare:1+.15*n}})},
  {id:"coupelle", nom:"Coupelles de rosée", emoji:"🥣", niveaux:[12,35],
   texte:"Une goutte de rosée en plus dans la réserve, par niveau.", effet:n=>({roseeMax:n})},
  {id:"oeil",   nom:"Œil de jardinier", emoji:"🔍", niveaux:[25,60,120],
   texte:"Plus de chances qu'une récolte sorte en variante rare : +4 points par niveau.", effet:n=>({rare:.04*n})},
  {id:"the",    nom:"Thé pour les visiteurs", emoji:"🫖", niveaux:[15,40],
   texte:"Les visiteurs restent plus longtemps sur le sentier : +30 % par niveau.", effet:n=>({dureeVisite:1+.3*n})},
  {id:"feu",    nom:"Un feu de plus", emoji:"🔥", niveaux:[80],
   texte:"Un feu de plus dans le poêle : un plat de plus peut cuire en même temps.", effet:n=>({feux:n})},
  {id:"boite",  nom:"Boîte aux lettres peinte", emoji:"📮", niveaux:[20,50],
   texte:"Anselme laisse une lettre de plus chaque matin, par niveau.", effet:n=>({lettres:n})},
];

/* ---------- LA VILLE : Saint-Aubin-des-Bois ----------
   Les gens de la ville écrivent (le facteur passe chaque matin) ou viennent en personne à la clairière.
   des(c)    : à partir de quand il écrit (chapitre atteint, événement…)
   envies    : ce qu'il peut demander : [objet, min, max] ; un objet n'est demandé que s'il peut s'obtenir
   raisons   : la fin de la lettre, tirée au hasard ; paroles : ce qu'il dit quand il vient en personne
   Récompense : 1,5 fois la valeur des objets, plus un peu ; en personne, il paie le double.
*/
CONTENU.VILLE = [
  {id:"margot", g:"f", nom:"Margot", metier:"la boulangère", emoji:"🥖", des:c=>true,
   envies:[["radis",3,6],["tulipe",2,4],["bouquet",1,2],["tarte",1,2],["botte",1,2],["epices",1,1],["marche",1,1]],
   raisons:["C'est pour la vitrine.","Mes clients les réclament.","Odile m'en faisait toujours, à cette saison.","Je vous garde un pain, en échange. Si Anselme ne le mange pas."],
   paroles:["Je suis montée à pied. Ça fait du bien, on ne dirait pas.","Vous avez la même façon qu'elle de regarder la terre avant de répondre.","Je ne reste pas, j'ai une fournée. Bon, cinq minutes."]},
  {id:"basile", g:"m", nom:"Basile", metier:"l'aubergiste", emoji:"🍲", des:c=>c.chapitre>=1,
   envies:[["radis",5,10],["champignon",2,4],["citrouille",1,2],["soupe",1,2],["tourte",1,2],["botte",2,3],["veloute",1,1]],
   raisons:["J'ai une noce samedi.","La salle est pleine depuis que les chasseurs sont revenus.","Mes clients ne savent pas d'où ça vient, mais ils reviennent.","Il me faut ça pour le plat du jour."],
   paroles:["Belle cuisine qu'on ferait avec ce que vous avez là.","Je suis venu voir d'où sortent mes radis. C'est bien ce que je pensais : de la terre.","Odile ne voulait jamais venir manger à l'auberge. Elle disait qu'elle mangeait mieux chez elle. Elle avait raison, ça m'énervait."]},
  {id:"ruelle", g:"f", nom:"Mme Ruelle", metier:"l'amie d'Odile", emoji:"🧶", des:c=>c.chapitre>=2,
   envies:[["lavande",1,3],["tisane",1,2],["tulipe",2,3],["lunefleur",1,1],["iris",1,2],["sachet",1,2],["thesoir",1,1]],
   raisons:["Pour ma table de nuit, comme avant.","Je n'en ai plus besoin, mais j'en ai envie, ce qui est mieux.","Elle me les apportait le jeudi. On est jeudi quelque part."],
   paroles:["Elle s'asseyait là, exactement. Non, un peu plus à gauche.","Vous avez remis les terres en état. Elle aurait fait semblant de ne pas le remarquer.","Je viens, je repars. À mon âge, une visite, c'est un voyage."]},
  {id:"lebrun", g:"m", nom:"M. Lebrun", metier:"l'instituteur", emoji:"📚", des:c=>c.chapitre>=4,
   envies:[["citrouille",1,2],["champignon",1,3],["roseau",2,4],["nenuphar",2,3],["lavande",1,2],["encre",1,1],["corbeille",1,1]],
   raisons:["C'est pour la leçon de choses de jeudi.","Les enfants veulent savoir comment c'est, en vrai.","Odile faisait la classe dehors. Je n'ose pas, alors j'apporte dehors dedans."],
   paroles:["Les enfants m'ont demandé si vous existiez vraiment. Je vais pouvoir répondre.","Comment s'appelle cette herbe-là ? Je note. Je note tout.","Elle m'a appris le nom des arbres quand j'avais huit ans. Je les ai tous oubliés sauf un."]},
  {id:"camille", g:"f", nom:"Camille", metier:"la pharmacienne", emoji:"🌿", des:c=>c.chapitre>=5,
   envies:[["lavande",2,3],["iris",1,2],["nenuphar",2,4],["tisane",1,2],["sirop",1,1],["lotus",1,1],["mielavande",1,2],["thesoir",1,1],["parfum",1,1]],
   raisons:["Pour les remèdes d'hiver.","Les vieilles recettes marchent mieux que les nouvelles, quand on y croit.","Mme Ruelle dort mal. Je ne lui dis pas que c'est vous."],
   paroles:["Il y a ici de quoi soigner la moitié du village. L'autre moitié n'est pas malade.","Je sens la lavande d'ici. Ou c'est le chat.","Odile savait tout ça. Elle ne l'écrivait nulle part. Vous devriez."]},
  {id:"maire", g:"m", nom:"M. Grandpré", metier:"le maire", emoji:"🎩", des:c=>c.chapitre>=6,
   envies:[["citrouille",2,3],["couronne",1,2],["lotus",1,2],["bouquet",2,3],["soupe",2,3],["festin",1,1],["gelee",1,1]],
   raisons:["Pour la réception de la mairie.","Le conseil municipal veut voir ce que produit la parcelle.","C'est une commande officielle. Il y aura un tampon."],
   paroles:["Je passais. Par hasard. Avec mon écharpe.","C'est plus grand que sur le cadastre.","Je ne dis pas que c'est joli. Je constate que ça l'est."]},
  {id:"enfants", g:"pl", nom:"Pia et Tom", metier:"les enfants de l'école", emoji:"🎃", des:c=>c.fete==="citrouilles",
   envies:[["citrouille",1,2],["lanterne",1,2],["bougie",1,2]],
   raisons:["C'est pour la nuit des citrouilles. Il en faut une par fenêtre.","Tom dit que les vôtres sont les plus grosses. Pia dit que c'est pas vrai. Il faut vérifier.","Maître Lebrun a dit qu'on pouvait vous écrire. Alors on vous écrit."],
   paroles:["On est venus à vélo ! Enfin Pia à vélo et moi derrière.","C'est vrai qu'il y a un hérisson ? On peut le voir ? On sera très calmes.","Vous aurez peur, la nuit des citrouilles ? Nous non. Un peu."]},
];

/* ---------- LE FIL : chapitres ----------
   Une lettre par chapitre, dans l'ordre. cond(c) : quand elle arrive (c.etat.ville.livrees = lettres livrées).
   don : {or, lunes, recette, graines, matieres:{id:n}} offert avec la lettre.
*/
CONTENU.CHAPITRES = [
  {id:"notaire", titre:"La clairière", de:"Maître Fauvel, notaire", cond:c=>true, don:{},
   texte:"Madame, Monsieur,\n\nConformément aux volontés de Mme Odile Vasseur, votre grand-tante, la parcelle dite « la Lisière » vous revient : une clairière, des terres, un étang, et ce qui voudra bien y pousser.\n\nMme Vasseur fournissait le village de Saint-Aubin-des-Bois en fleurs et en légumes. Plusieurs habitants m'ont demandé si cela continuerait. Je leur ai répondu de vous écrire. Le facteur, Anselme, monte chaque matin.\n\nJe n'ai pas d'autres instructions, sinon une phrase qu'elle a tenu à faire inscrire au bas de l'acte : « Qu'on ne se presse pas. »\n\nMaître Fauvel"},
  {id:"margot", titre:"La terre, c'est la preuve", de:"Margot, la boulangère", cond:c=>c.etat.ville.livrees>=3, don:{or:15},
   texte:"Bonjour,\n\nVos radis sont arrivés avec de la terre encore dessus. Odile faisait pareil. Elle disait que la terre, c'est la preuve.\n\nJ'en ai parlé à Basile, à l'auberge. Il va vous écrire, il écrit mal, ne vous vexez pas. Il a bon cœur et une grande marmite.\n\nJe vous glisse quelques pièces avec cette lettre, pour les graines. Ne dites pas non, c'est déjà dans l'enveloppe.\n\nMargot"},
  {id:"ruelle", titre:"Une amie d'Odile", de:"Mme Ruelle", cond:c=>c.etat.ville.livrees>=6, don:{recette:"tisane"},
   texte:"Cher petit,\n\nVous ne me connaissez pas. J'ai connu Odile quarante et un ans, dont trente à l'école où nous faisions la classe, elle aux grands, moi aux petits.\n\nUn printemps, elle a rendu les clés de sa classe, acheté cette clairière dont personne ne voulait, et elle y est montée vivre. Tout le village a cru qu'elle était triste. Elle ne l'était pas. Elle ne s'est jamais donné la peine de le dire.\n\nJe vous recopie sa tisane de lavande, elle me la faisait le jeudi. Et puis : elle parlait d'une boîte, sous le plancher d'une cabane qu'elle n'a jamais eu le temps de construire. Je ne sais pas ce que ça veut dire. Vous saurez peut-être.\n\nAvec mon amitié, déjà,\nGeneviève Ruelle"},
  {id:"boite", titre:"La boîte en fer", de:"Odile", cond:c=>c.bati("cabane") && !!c.etat.boiteTrouvee, don:{mysteres:2},
   texte:"Sous la troisième planche, une boîte à biscuits. Dedans, une enveloppe à ton nom, écrite il y a longtemps.\n\n« Si tu lis ça, c'est que tu as bâti la cabane, donc que tu es resté plus d'un jour. C'est le plus difficile. Après, la clairière s'occupe du reste.\n\nJe n'ai jamais construit cette cabane. J'ai dormi trois étés sous une bâche en me disant : l'an prochain. J'ai fini par comprendre que je n'en avais pas envie. Je voulais entendre la pluie sans toit. Toi, tu as un toit. C'est bien aussi. Chacun sa pluie.\n\nIl y a deux graines dans la boîte. Je ne sais plus ce que c'est. Sème-les, tu verras.\n\nOdile »"},
  {id:"lebrun", titre:"La leçon de choses", de:"M. Lebrun, l'instituteur", cond:c=>c.etat.ville.livrees>=12, don:{lunes:10},
   texte:"Bonjour,\n\nJe suis le maître de l'école de Saint-Aubin, depuis que Mme Vasseur est partie. Les enfants n'ont jamais connu Mme Vasseur, mais ils connaissent son nom : il est gravé sous le préau, avec une date et le mot « tilleul ». Personne ne sait pourquoi.\n\nLes enfants voudraient voir ce qui pousse chez vous. Je n'ose pas les emmener, la route est longue. Je vous écrirai pour des commandes, si vous le permettez. Ce sera pour la classe.\n\nP.-S. : Le tilleul est l'arbre dont j'ai retenu le nom.\n\nAdrien Lebrun"},
  {id:"mare", titre:"Ce que sait la mare", de:"Odile", cond:c=>c.bati("lavoir") || (c.etat.ville.livrees>=16 && c.nb(p=>p.ouvert,"mare")>=4), don:{matieres:{nacre:2}},
   texte:"La carpe a remonté quelque chose : une petite bouteille bouchée à la cire, et dedans, un papier roulé.\n\n« Cette mare n'est pas profonde. J'y ai mis les pieds le premier jour pour vérifier, et la carpe m'a regardée comme on regarde quelqu'un qui entre sans frapper. Je me suis excusée. Depuis, je frappe, c'est-à-dire que je m'assois au bord et j'attends qu'elle remonte.\n\nTout ici marche comme ça. On ne prend rien. On attend que ça vienne, et ça vient, ou pas, et les deux sont bien.\n\nCamille, à la pharmacie, te demandera des plantes. Elle a l'air sévère. C'est de la timidité.\n\nO. »"},
  {id:"projet", titre:"Les Hauts de la Lisière", de:"M. Grandpré, maire de Saint-Aubin", cond:c=>c.etat.ville.livrees>=20, don:{},
   texte:"Madame, Monsieur,\n\nLe conseil municipal étudie un projet de valorisation des parcelles en bordure du bois communal, dont la vôtre. Un promoteur propose d'y bâtir douze maisons, sous le nom provisoire des « Hauts de la Lisière ».\n\nRien n'est décidé. Le conseil a toutefois rappelé qu'une parcelle qui contribue à la vie du village n'a pas vocation à être « valorisée » autrement. Je vous laisse apprécier.\n\nJe vous adresserai quelques commandes, à titre d'observation.\n\nVeuillez agréer, etc.\nHubert Grandpré, maire"},
  {id:"petition", titre:"Saint-Aubin écrit", de:"Mme Ruelle", cond:c=>c.etat.ville.livrees>=25, don:{lunes:15},
   texte:"Cher petit,\n\nIl faut que je vous raconte. Basile a posé une feuille sur son comptoir, avec écrit dessus : « Pour que la Lisière reste la Lisière ». Margot l'a signée la première, puis tout le monde, puis des gens qui n'ont jamais mis les pieds chez vous, puis le chien de Basile (une patte, c'est accepté).\n\nM. Lebrun l'a fait signer aux enfants. Camille l'a signée en latin, on ne sait pas pourquoi.\n\nLe maire a dit qu'il viendrait voir par lui-même. Il dit qu'il veut « une preuve ». Margot dit que la terre, c'est la preuve.\n\nGeneviève"},
  {id:"fete", titre:"La fête de la Lisière", de:"M. Grandpré, maire", cond:c=>c.etat.ville.livrees>=30, don:{or:200, lunes:30},
   texte:"Madame, Monsieur,\n\nJe suis monté. J'ai vu les terres, la mare, les ruches et un hérisson qui m'a reniflé les chaussures avec une insistance que je n'ai pas appréciée.\n\nLe projet des « Hauts de la Lisière » est abandonné. Le conseil a voté, à l'unanimité moins une voix (la mienne, par principe ; je l'ai regretté aussitôt).\n\nLe conseil a aussi voté une fête, chaque année, à la clairière. Vous n'avez rien à organiser. Les gens viendront, s'assiéront, et repartiront. C'est, paraît-il, ce qu'Odile aurait voulu.\n\nHubert Grandpré"},
  {id:"derniere", titre:"La dernière lettre", de:"Odile", cond:c=>c.etat.ville.livrees>=35, don:{lunes:20},
   texte:"Celle-ci était glissée dans le carnet d'Odile, que Mme Ruelle a fini par retrouver chez elle, entre deux livres, et qu'elle t'a fait porter par Anselme.\n\n« J'ai passé trente ans à apprendre aux enfants le nom des choses. Le tilleul, la mésange, l'iris. Ici, j'ai appris autre chose : à les attendre.\n\nLes gens ont cru que je partais. Je ne partais pas, j'arrivais. Une lisière, c'est l'endroit où deux mondes se touchent sans se mélanger : le bois et le pré, la ville et la clairière. On peut y vivre. On peut même y être utile.\n\nJe te la laisse. Ne la garde pas pour toi.\n\nOdile »\n\nLa suite s'écrira avec toi."},
];

/* ---------- ÉVÉNEMENTS DATÉS ----------
   du / au : [mois, jour] (inclus). Pendant l'événement, c.fete vaut son id : visiteurs, gens de la ville,
   recettes (fete) et secrets peuvent en dépendre. phrase : ajoutée à la ligne du temps. carte : décor ajouté.
*/
CONTENU.EVENEMENTS = [
  {id:"citrouilles", nom:"La nuit des citrouilles", du:[10,20], au:[11,2], carte:"citrouilles",
   phrase:"Saint-Aubin prépare la nuit des citrouilles.", phraseNuit:"Les citrouilles veillent à la lisière.",
   annonce:"La nuit des citrouilles approche, le 31. Les enfants de l'école vont écrire. Une recette de lanterne t'attend à l'atelier."},
];

/* ---------- ATELIER : OBJETS ----------
   cout   : matières nécessaires
   effets : lus par le moteur :
     dureeVisite : multiplicateur du temps que les visiteurs restent
     bonusLunes  : lunes en plus à chaque salut
     periode     : {idVisiteur: multiplicateur} sur la période d'apparition
     roseeMax    : gouttes de rosée en plus
*/
CONTENU.OBJETS = [
  {id:"lanterne", nom:"Lanterne", emoji:"🏮", cout:{miel:3, nacre:1},
   texte:"Une lanterne au bout du sentier. Les visiteurs restent plus longtemps, et les papillons viennent deux fois plus.",
   effets:{dureeVisite:1.8, periode:{papillon:.5}}},
  {id:"banc", nom:"Banc", emoji:"🪑", cout:{miel:5},
   texte:"Un banc entre le potager et la mare. Chaque visiteur salué laisse une lune de plus, parce qu'on a pris le temps.",
   effets:{bonusLunes:1}},
  {id:"nichoir", nom:"Nichoir", emoji:"🏠", cout:{miel:2, nacre:2},
   texte:"Un nichoir dans le vieux poirier. Le merle s'y installe pour de bon.",
   effets:{}},
  {id:"tonneau", nom:"Tonneau de pluie", emoji:"🛢️", cout:{nacre:3},
   texte:"Un tonneau sous la gouttière. La réserve de rosée gagne deux gouttes.",
   effets:{roseeMax:2}},
];

/* ---------- VILLAGE : BÂTIMENTS ----------
   Le village est l'écran d'accueil : une carte immense et presque vide. Chaque bâtiment a un emplacement
   fixe (x, y en pourcentage de la carte), coûte de l'or et des matériaux (materiaux), demande des outils (outils) et se construit en jours réels, un chantier à la fois.
   effets : mêmes clés que les objets, plus :
     potsGratuits : {zone:[indices]} pots ouverts sans payer    regenRosee : multiplicateur du temps entre deux gouttes
     pluieToujours : les plantes de pluie se sèment par tous temps    aubeLunes : lunes offertes chaque aube
     aubeMatiere : {id, n} matière offerte chaque aube
   histoire : ligne du carnet une fois terminé. ix, iy : position sur la carte illustrée (x, y sur le dessin de repli).
*/
CONTENU.BATIMENTS = [
  {id:"cabane", nom:"La cabane", emoji:"🛖", x:50, y:56, ix:50, iy:58, prix:150, materiaux:{bois:10, clous:6}, outils:["marteau","scie"], jours:1,
   texte:"Une cabane de planches au centre de la clairière, à toi. Sa cheminée te donne un feu de plus pour cuisiner. Anselme dépose une lettre de plus chaque matin dans sa boîte, et les lettres y attendent un jour de plus. La mare s'ouvre à qui a un toit.",
   effets:{feux:1, lettres:1, dureeLettres:24}, histoire:"La première nuit dans la cabane, il a plu sur le toit de bardeaux. Tu n'as rien fait d'autre qu'écouter."},
  {id:"panneau", nom:"Le panneau d'affichage", emoji:"🪧", x:78, y:84, ix:78, iy:84, prix:200, materiaux:{bois:4, clous:4}, outils:["marteau"], jours:1,
   texte:"Un panneau de bois au bord du sentier, où l'on punaise des mots. Une fois planté, la carte affiche en haut ce qui est prêt au potager et à la mare, les demandes, les chantiers, les lettres et la cabane.",
   effets:{seuil:true}, histoire:"Le premier mot punaisé dessus, c'est toi qui l'as écrit : « radis, mercredi ». Le lendemain, quelqu'un avait ajouté en dessous : « bravo »."},
  {id:"puits", nom:"Le puits", emoji:"🪣", x:36, y:62, ix:38, iy:50, prix:400, materiaux:{pierre:12, bois:3}, outils:["marteau","truelle"], jours:2,
   texte:"Un puits de pierre près des terres. La réserve de rosée gagne trois gouttes.",
   effets:{roseeMax:3}, histoire:"L'eau du puits est froide même en plein été. Le chat y boit en équilibre sur la margelle, ce qui n'inquiète que toi."},
  {id:"ruche", nom:"Les ruches", emoji:"🐝", x:24, y:48, ix:20, iy:56, prix:600, materiaux:{bois:8, clous:4}, outils:["marteau","scie"], jours:3,
   texte:"Trois ruches de paille au bord des terres. L'abeille s'installe, et chaque aube laisse un pot de miel.",
   effets:{aubeMatiere:{id:"miel", n:1}}, histoire:"Le premier miel avait le goût de la lavande. Le deuxième, de la tulipe. Les abeilles tiennent un journal que personne ne lit, sauf au goût."},
  {id:"lavoir", nom:"Le lavoir", emoji:"🏚️", x:70, y:50, ix:70, iy:54, prix:1000, materiaux:{pierre:16, tuiles:6, bois:4}, outils:["marteau","truelle"], jours:3,
   texte:"Un lavoir de pierre au bord de l'étang. Les deux derniers coins d'eau de la mare s'ouvrent sans rien payer.",
   effets:{potsGratuits:{mare:[6,7]}}, histoire:"Personne n'y lave rien. Mais la pierre plate est tiède le soir, et la grenouille a décidé que c'était à elle."},
  {id:"lanterne", nom:"Les lampions du chemin", emoji:"🏮", x:50, y:78, ix:56, iy:78, prix:1200, materiaux:{verre:2, clous:6, bois:2}, outils:["marteau"], jours:2,
   texte:"Une rangée de lampions de papier tendus sur des piquets, le long du sentier. Les visiteurs restent plus longtemps ; ceux de la nuit viennent plus souvent.",
   effets:{dureeVisite:1.5, periode:{papillon:.6, hibou:.7, chauvesouris:.7, triton:.7}}, histoire:"On les allume au crépuscule, un par un. On ne sait pas qui les éteint à l'aube. On a cessé de se poser la question."},
  {id:"banc", nom:"Le muret de pierre", emoji:"🧱", x:60, y:66, ix:62, iy:66, prix:1500, materiaux:{pierre:10}, outils:["marteau","truelle"], jours:2,
   texte:"Un muret de pierres sèches, bas et moussu, entre les terres et l'étang. Les bêtes s'y posent au soleil : chaque visiteur salué laisse deux lunes de plus.",
   effets:{bonusLunes:2}, histoire:"Un muret qui ne sépare rien : d'un côté les sillons, de l'autre l'eau. Le lézard l'a adopté le premier jour. On s'y assoit sans raison. C'est la seule bonne raison."},
  {id:"moulin", nom:"Le moulin", emoji:"🌬️", x:18, y:30, ix:16, iy:70, prix:2000, materiaux:{bois:20, clous:12, tuiles:4}, outils:["marteau","scie"], jours:4,
   texte:"Un petit moulin de bois sur la butte. Il tire l'eau : la rosée revient deux fois plus vite.",
   effets:{regenRosee:.5}, histoire:"Ses ailes tournent même sans vent. Le hérisson a une théorie. Il ne l'a jamais exposée en entier."},
  {id:"serre", nom:"La serre", emoji:"🪟", x:34, y:40, ix:30, iy:72, prix:2500, materiaux:{verre:12, bois:6, clous:8}, outils:["marteau","scie"], jours:5,
   texte:"Une serre de verre et de fer. Ce qui ne pousse que sous la pluie s'y sème par tous les temps.",
   effets:{pluieToujours:true}, histoire:"Dedans, il fait toujours le même temps : celui d'un matin d'avril. On y entre quand le reste de l'année est trop long."},
  {id:"poirier", nom:"Le poirier", emoji:"🍐", x:78, y:30, ix:84, iy:70, prix:3500, materiaux:{arbre:1}, outils:[], jours:6,
   texte:"Un poirier planté à la lisière. Le premier arbre du verger à venir. Chaque aube, il laisse trois poires dans le panier.",
   effets:{aubeDenree:{id:"poire", n:3}}, histoire:"Un arbre met six jours à se décider et des années à donner. Celui-ci donne dès le septième matin, par politesse."},
  {id:"portail", nom:"Le portail", emoji:"🚪", x:58, y:12, ix:52, iy:27, prix:4500, materiaux:{bois:14, clous:8, pierre:4}, outils:["marteau","scie"], jours:4,
   texte:"Un portail de bois ouvert sur le bois, qui ne ferme rien. Le renard l'emprunte deux fois plus souvent.",
   effets:{periode:{renard:.5}}, histoire:"Un portail sans clôture. Les visiteurs passent à côté. Le renard passe dedans, toujours, et s'arrête un instant au milieu, comme à une frontière."},
];

/* ---------- LES ÉTALS DU MARCHÉ ----------
   Des gens de Saint-Aubin tiennent étal au marché : matériaux et outils pour bâtir. Hors ligne, toujours là.
   vend : [objet (une matière), prix de base en or, stock par jour (null = illimité), max : on n'en possède jamais plus (outils)]
   Le prix varie un peu chaque jour (±15 %), le stock se refait chaque matin.
   jours : les jours où il tient étal (0 = dimanche, 1 = lundi…) ; les autres jours, l'étal est fermé.
   fidelite : nombre d'achats chez lui avant qu'il propose d'envoyer un apprenti (« tu es un client fidèle… »)
   apprenti : il s'installe à la lisière et produit en continu, même en ton absence, directement dans ton stock.
              On le paie une fois (installation), puis on améliore son poste avec de l'or. Quand la réserve est pleine, il se repose.
              ix, iy : sa place sur la carte illustrée (comme les bâtiments) ; image img/poste-<id du marchand>.webp
              niveaux : [{par : unités par heure, reserve : stock au-delà duquel il s'arrête, prix : or pour atteindre ce niveau}]
*/
/* ---------- LA RELIURE (dans la cabane) ----------
   Les animaux rapportent parfois un livre abandonné dans le bois (souvent un livre d'Odile, dispersé du temps de sa bâche).
   Chaque livre arrive avec un à trois défauts ; chaque défaut se répare à son atelier, avec un peu de récolte et du temps.
   Couture, presse et bassine demandent tes mains : une seule à la fois. Le séchoir, lui, travaille seul, en même temps.
   Réparé, le livre rejoint l'étagère et se lit ; certains cachent un don (recette, graine, lunes).
   suite : les carnets d'Odile arrivent dans l'ordre. */
CONTENU.DEFAUTS_LIVRE = {
  decousu:    {atelier:"La table de couture", emoji:"🧵", nom:"Reliure décousue", geste:"Recoudre au fil de roseau", besoin:{roseau:2}, duree:2*3600},
  mouille:    {atelier:"Le séchoir, près de la cheminée", emoji:"🔥", passif:true, nom:"Pages gondolées par l'eau", geste:"Faire sécher près de la cheminée", besoin:{}, duree:4*3600},
  couverture: {atelier:"La presse à coller", emoji:"🗜️", nom:"Couverture arrachée", geste:"Recoller sur de fines planches", besoin:{bois:1, miel:1}, duree:3*3600},
  tache:      {atelier:"La bassine de lavande", emoji:"🪻", nom:"Pages tachées", geste:"Nettoyer à l'eau de lavande", besoin:{lavande:1}, duree:3600},
};
CONTENU.AMELIO_CABANE = [
  {id:"etageres", nom:"Des étagères", prix:120, materiaux:{bois:6, clous:4}, outils:["marteau"], effet:"Les bêtes apportent des livres deux fois plus souvent : elles ont vu qu'il y avait de la place."},
  {id:"presse", nom:"Une presse à relier", prix:300, materiaux:{bois:4, pierre:4, clous:4}, outils:["marteau"], effet:"Les réparations vont deux fois plus vite."},
  {id:"lampe", nom:"Une lampe de travail", prix:250, materiaux:{verre:2, clous:2}, outils:[], effet:"On travaille aussi la nuit (sans elle, les ateliers se reposent quand le soleil est couché)."},
  {id:"etabli2", nom:"Un grand séchoir", prix:500, materiaux:{bois:8, clous:6}, outils:["scie","marteau"], effet:"Le séchoir accueille trois livres à la fois."},
];
CONTENU.LIVRES = [
  {id:"herbier", titre:"Le Petit Herbier des chemins", genre:"Herbier", couleur:"#6f8a4e", premier:true,
   texte:"Un herbier d'écolier, des fleurs pressées entre des pages quadrillées. Dans la marge, une écriture penchée a ajouté au crayon : « Une plante sur vingt-cinq, à peu près, sort autrement que les autres. Plus pâle, plus double, plus bleue. Ne pas chercher à la provoquer : la garder quand elle vient. » Sous une violette séchée, la même main : « Odile, 1971. Cueillie trop tôt. Pardon. »"},
  {id:"conte-renard", titre:"Contes de la forêt de Bréau", genre:"Conte", couleur:"#8a4e3a", don:{lunes:3},
   texte:"Le renard voulait la lune. Il a essayé de l'attraper dans l'étang, mais elle se cassait en morceaux chaque fois qu'il y mettait la patte. Alors il s'est assis et il a attendu que l'eau se calme. La lune est revenue, entière. Le renard a compris qu'on ne prend pas la lune : on la laisse se poser. Depuis, les renards s'assoient au bord des mares, les nuits claires, et ne touchent à rien."},
  {id:"cuisine-veloute", titre:"Cahier de cuisine, écriture penchée", genre:"Cuisine", couleur:"#b0703a", don:{recette:"veloute"},
   texte:"Des recettes recopiées à la main, des taches de gras, des quantités barrées et corrigées. L'une d'elles est entourée deux fois : un velouté des bois, « pour les soirs où l'on rentre trempé ». Au bas de la page : « Ne pas saler avant d'avoir goûté. Personne ne m'a jamais écoutée là-dessus. »"},
  {id:"almanach", titre:"Almanach de l'année 1987", genre:"Almanach", couleur:"#4e6a8a",
   texte:"Lever du soleil, phases de la lune, dictons. « Rosée du matin, journée sans chagrin. » « Quand il pleut, la terre boit pour toi : la rosée revient deux fois plus vite. » Quelqu'un a coché à l'encre tous les jours de pluie de l'été. Il y en a beaucoup. À côté du 14 août, un seul mot : « enfin »."},
  {id:"lecons", titre:"Leçons de choses, cours moyen", genre:"Manuel", couleur:"#7a6a9a", don:{lunes:2},
   texte:"Le manuel de l'école de Saint-Aubin, tamponné « Classe de Mme Vasseur ». La germination du haricot, le cycle de l'eau, les oiseaux de nos jardins. Dans la marge du chapitre sur les saisons, au crayon rouge, Odile a écrit pour elle-même : « On leur apprend que tout revient. On oublie de leur dire que ça revient un peu autrement. C'est ça qui est beau. »"},
  {id:"etangs", titre:"Le Livre des étangs", genre:"Herbier", couleur:"#3f7a7a",
   texte:"Planches en couleur des plantes d'eau. Le nénuphar, qui fleurit vite. Le roseau, patient. L'iris d'eau. Le lotus, qui demande une demi-journée entière et le rend au centuple. Une note au crayon sous le lotus : « Le bleu existe. Je l'ai vu une fois. Une seule. Je n'ai rien dit à personne, de peur qu'on ne me croie pas. »"},
  {id:"bache-1", titre:"Carnet de bâche, premier été", genre:"Carnet d'Odile", couleur:"#5a4a3a", suite:1,
   texte:"« Première nuit. Une bâche verte tendue entre deux frênes, un duvet, une lampe. Il a fait froid. Un hérisson est passé trois fois, comme un gardien qui fait sa ronde. Je ne sais pas ce que je fais ici. Je sais seulement que je ne voulais plus être ailleurs. Demain, je retourne la terre près du chemin. On verra bien ce qui accepte de pousser. »"},
  {id:"bache-2", titre:"Carnet de bâche, deuxième été", genre:"Carnet d'Odile", couleur:"#5a4a3a", suite:2,
   texte:"« Les radis ont levé avant moi ce matin. Margot, la petite de la boulangerie, est montée avec sa mère. Elle a mangé un radis plein de terre et elle a dit que c'était le meilleur du monde. Sa mère a fait la grimace. Moi, j'ai pensé que c'était la plus belle critique qu'on m'ait jamais faite. La bâche fuit. Je mets une casserole dessous. Elle sonne comme une cloche quand il pleut. »"},
  {id:"bache-3", titre:"Carnet de bâche, troisième été", genre:"Carnet d'Odile", couleur:"#5a4a3a", suite:3, don:{graine:1},
   texte:"« Dernier été sous la bâche, je crois. Je n'ai plus l'âge de dormir par terre, et je n'ai jamais eu celui de construire une cabane. Je laisse ça à quelqu'un d'autre. J'ai glissé une graine entre ces deux pages, la plus belle que j'aie trouvée. Si quelqu'un lit ça un jour, qu'il la plante un soir de lune. » Entre les pages, une graine pâle, intacte."},
  {id:"champignons", titre:"Petit traité des champignons", genre:"Herbier", couleur:"#7a5a3a",
   texte:"Les comestibles, les douteux, les mortels, avec des têtes de mort dessinées à l'encre. En face du cèpe : « Ne pousse que sous la pluie, et n'a jamais soif. Le cèpe d'automne, le vrai, se mérite : il faut beaucoup de pluie et un peu de chance. » Quelqu'un a ajouté, d'une autre main : « Et ne pas le dire aux voisins. »"},
  {id:"encrier", titre:"Recettes de l'encrier", genre:"Cuisine", couleur:"#3a4a7a", don:{recette:"encre"},
   texte:"Un mince cahier d'instituteur : comment faire de l'encre avec ce que l'on trouve. Noix, sureau, et une page entière sur l'iris d'eau, « qui donne un violet que les enfants préfèrent au bleu de l'économat ». En bas : « Testée en classe. Taches sur trois tabliers. Aucun regret. »"},
  {id:"chouette", titre:"La Chouette qui comptait", genre:"Conte", couleur:"#4a4a6a", don:{lunes:2},
   texte:"Il était une chouette qui comptait tout : les étoiles, les feuilles, les souris, les années. Elle n'arrivait jamais au bout et ça la rendait triste. Un soir, un vieux hibou lui a demandé ce qu'elle ferait du nombre, une fois trouvé. Elle n'a pas su répondre. Alors elle a arrêté de compter et elle a regardé. Il paraît qu'elle voit mieux, depuis."},
  {id:"the", titre:"Le Thé des longues soirées", genre:"Cuisine", couleur:"#8a6a4a", don:{recette:"thesoir"},
   texte:"Un livret publicitaire d'une herboristerie disparue, « Maison Cardon, plantes et simples ». Mélanges pour dormir, pour digérer, pour se consoler. Le thé du soir y est décrit avec un sérieux de notaire. Quelqu'un a souligné : « à boire assis, sans rien faire d'autre ». Et ajouté : « impossible, mais on essaie »."},
  {id:"guide", titre:"Guide du promeneur, Saint-Aubin et ses bois", genre:"Guide", couleur:"#5a7a5a", don:{lunes:2},
   texte:"Un guide jauni, avec une carte dépliante qui ne se replie plus. « Saint-Aubin-des-Bois, son église, sa boulangerie déjà réputée, ses sentiers. » La clairière y figure, sans nom, juste un cercle vert au bord du bois. Au crayon, quelqu'un l'a entourée trois fois et a écrit à côté : « ici ».",},
  {id:"poemes", titre:"Poèmes d'un hiver", genre:"Poésie", couleur:"#6a7a8a",
   texte:"Un recueil sans nom d'auteur, tiré à peu d'exemplaires. Un poème est marqué d'une feuille de frêne séchée :\n« Il a neigé sur la clairière,\nl'étang a mis son manteau gris.\nRien ne pousse, tout espère.\nLa terre dort. Elle a compris. »"},
  {id:"graines", titre:"Le Livre des graines", genre:"Herbier", couleur:"#9a8a4a", don:{graine:1},
   texte:"Un catalogue de semencier, avec des sachets dessinés. Les pages du milieu sont collées l'une à l'autre ; en les décollant, une graine de fleur de lune tombe sur l'établi. À côté de la fleur de lune, une note : « La double existe. Deux corolles l'une dans l'autre. Elle ne vient pas sur commande, elle vient quand elle veut. »"},
  {id:"heron", titre:"Le Héron patient", genre:"Conte", couleur:"#5a6a7a", don:{lunes:3},
   texte:"Un héron se tenait sur une patte au milieu de l'étang depuis si longtemps que les grenouilles l'avaient pris pour un piquet. Elles s'asseyaient sur ses pattes, elles y faisaient la sieste. Le héron avait très faim. Mais il les trouvait si tranquilles qu'il n'a pas eu le cœur de les déranger. Il a pêché ailleurs, ce jour-là. C'est une histoire pour les enfants qui ne tiennent pas en place."},
  {id:"oiseaux", titre:"Registre des oiseaux de la lisière", genre:"Carnet", couleur:"#6a5a7a",
   texte:"Des colonnes tracées à la règle : date, heure, espèce, remarque. « Merle, 6 h 10, chante faux. » « Hibou, 23 h, m'a regardée écrire. » « Merle, 6 h 12, chante toujours faux, je commence à l'aimer. » Les dernières pages sont vides. La toute dernière ligne dit seulement : « à continuer »."},
  {id:"garde", titre:"Journal d'un garde forestier", genre:"Carnet", couleur:"#4a5a3a",
   texte:"Tournées dans le bois communal, coupes, chablis. Une page parle de la clairière : « La vieille institutrice est encore là-haut sous sa bâche. Je lui ai proposé de l'aide pour monter des planches. Elle a dit non, merci, que c'était au prochain de le faire. J'ai pas compris. J'ai laissé les planches quand même, sous le frêne. »"},
  {id:"relieur", titre:"Manuel du parfait relieur", genre:"Manuel", couleur:"#7a3a3a", don:{lunes:4},
   texte:"Coudre, encoller, presser, attendre. Surtout attendre. « Un livre recousu à la hâte se défait à la première lecture. Un livre que l'on a laissé sécher une nuit de plus dure cent ans. » Sur la page de garde, un ex-libris : « Ce livre appartient à quiconque le répare. »"},
];

CONTENU.ETALS = [
  /* la nuit, de 21 h à 4 h, les étals sont vides ; sauf un. Il ne veut pas d'or : il veut des lunes. */
  {id:"etranger", nom:"L'étranger capuché", metier:"on ne sait pas d'où", emoji:"🧥", nuit:true, jours:[0,1,2,3,4,5,6], monnaie:"lunes",
   phrase:"Je ne reste pas. Prends ou laisse. L'or ne m'intéresse pas ; la lune, si.",
   vend:[["mystere",25,1],["graine",40,1],["nacre",8,2],["miel",6,2]]},
  {id:"firmin", nom:"Firmin", metier:"le menuisier", emoji:"🪚", jours:[2,4,6],
   phrase:"Du chêne de la scierie, sec depuis deux hivers. Je le scie à la demande, mais pas trop vite.",
   vend:[["bois",8,8],["scie",60,null,1]], fidelite:12,
   apprenti:{nom:"Le coin du bûcheron", ix:15, iy:26, qui:"Lucien, l'apprenti de Firmin", emoji:"🪓", objet:"bois",
     proposition:"Tu m'en prends tellement que je pourrais t'envoyer Lucien, mon apprenti. Il s'installe au bord du bois et il coupe pour toi. Tu le paies une fois, après il se débrouille.",
     texte:"Lucien coupe et débite au bord du bois, à son rythme. Il chante faux, mais le hérisson n'a pas l'air de s'en plaindre.",
     niveaux:[{par:.5, reserve:8, prix:220},{par:1, reserve:14, prix:180},{par:1.6, reserve:22, prix:420},{par:2.5, reserve:32, prix:900}]}},
  {id:"loiseau", nom:"Mme Loiseau", metier:"la quincaillière", emoji:"🔨", jours:[1,3,5],
   phrase:"Marteaux, clous, vitres. Si ça se cloue ou si ça se casse, j'en ai.",
   vend:[["marteau",40,null,1],["truelle",50,null,1],["clous",3,24],["verre",25,3]], fidelite:20,
   apprenti:{nom:"La petite forge", ix:30, iy:87, qui:"Jeanne, l'apprentie de Mme Loiseau", emoji:"⚒️", objet:"clous",
     proposition:"Vous revenez si souvent que je vais finir par vous envoyer Jeanne. Elle forgera vos clous sur place. Vous payez la forge une fois, et c'est tout.",
     texte:"Jeanne tape sur l'enclume avec une régularité d'horloge. Le merle a appris le rythme.",
     niveaux:[{par:1.5, reserve:20, prix:180},{par:3, reserve:36, prix:160},{par:5, reserve:60, prix:380},{par:8, reserve:90, prix:800}]}},
  {id:"gaspard", nom:"Gaspard", metier:"le carrier", emoji:"🪨", jours:[3,6],
   phrase:"La pierre de la colline. Lourde, mais elle tiendra plus longtemps que nous.",
   vend:[["pierre",10,6],["tuiles",12,5]], fidelite:10,
   apprenti:{nom:"La petite carrière", ix:88, iy:25, qui:"Mathis, l'apprenti de Gaspard", emoji:"⛏️", objet:"pierre",
     proposition:"T'as pris assez de pierre pour bâtir un mur. Y a un banc de roche derrière ton étang : je t'envoie Mathis, il te la taille sur place. Tu paies l'installation, et voilà.",
     texte:"Mathis taille la pierre derrière l'étang. Le soir, il empile ce qu'il a fait et s'assoit dessus pour regarder la mare.",
     niveaux:[{par:.4, reserve:6, prix:260},{par:.8, reserve:12, prix:220},{par:1.3, reserve:18, prix:480},{par:2, reserve:26, prix:1000}]}},
  {id:"mathilde", nom:"Mathilde", metier:"la maraîchère", emoji:"🥕", jours:[1,3,5,6], maraichere:true,
   phrase:"Ce qui pousse chez moi et ce qui flotte dans mon étang. Si tu cherches quelque chose qu'on t'a demandé, regarde : j'en ai souvent pris pour toi.",
   vend:[]},
  {id:"rose", nom:"Rose", metier:"la pépiniériste", emoji:"🌳", jours:[0],
   phrase:"Des arbres en motte et quelques graines qu'on ne trouve pas ailleurs. Je n'en ai pas beaucoup, je ne les force pas.",
   vend:[["arbre",380,1],["graine",260,1]]},
];

/* ---------- VŒUX ----------
   Objectifs longs, dans l'ordre. prog(c) renvoie [fait, total].
   Le carnet montre les vœux accomplis et les trois suivants ; on en ajoute à la fin quand il n'en reste plus.
*/
CONTENU.VOEUX = [
  {id:"pots",    nom:"Ouvrir les douze pots du potager",      prog:c=>[c.nb(p=>p.ouvert,"potager"),12]},
  {id:"mare",    nom:"Ouvrir la mare",                        prog:c=>[c.nb(p=>p.ouvert,"potager")>=6?1:0,1]},
  {id:"lune",    nom:"Faire fleurir une fleur de lune",       prog:c=>[c.etat.lunesFleuries>0?1:0,1]},
  {id:"objet",   nom:"Fabriquer un premier objet à l'atelier", prog:c=>[Object.keys(c.etat.objets).length>0?1:0,1]},
  {id:"habitant", nom:"Qu'un visiteur reste pour de bon",       prog:c=>[Object.keys(c.etat.habitants||{}).length>0?1:0,1]},
  {id:"cabane",  nom:"Bâtir la cabane",                        prog:c=>[c.bati("cabane")?1:0,1]},
  {id:"village", nom:"Bâtir tout le village",                  prog:c=>[Object.keys(c.etat.village.batis).length, CONTENU.BATIMENTS.length]},
  {id:"histoires", nom:"Ouvrir toutes les histoires des habitants", prog:c=>[Object.values(c.etat.habitants||{}).reduce((n,h)=>n+(h.faites||[]).length,0), CONTENU.HABITANTS.reduce((n,h)=>n+h.demandes.length,0)]},
  {id:"carnet",  nom:"Rencontrer tous les visiteurs",         prog:c=>[Object.keys(c.etat.visites).length, CONTENU.VISITEURS.length]},
  {id:"cent",    nom:"Cent récoltes",                         prog:c=>[Math.min(100,c.etat.recoltes),100]},
  {id:"marepleine", nom:"Les huit coins d'eau fleuris en même temps", prog:c=>[c.nb(p=>p.plante && p.age>=CONTENU.PLANTES[p.plante].duree,"mare"),8]},
  {id:"atelier", nom:"Fabriquer tous les objets",             prog:c=>[Object.keys(c.etat.objets).length, CONTENU.OBJETS.length]},
  {id:"complet", nom:"Douze plantes mûres au potager en même temps, dont une fleur de lune", prog:c=>[c.etat.pleineLune?1:0,1]},
  {id:"secrets", nom:"Trouver tous les secrets",              prog:c=>[Object.keys(c.etat.secrets).length, CONTENU.SECRETS.length]},
  {id:"lettres", nom:"Livrer dix lettres de la ville",        prog:c=>[Math.min(10,c.etat.ville.livrees),10]},
  {id:"recettes", nom:"Connaître cinq recettes",              prog:c=>[Math.min(5,Object.keys(c.etat.recettes).length),5]},
  {id:"cuisine", nom:"Connaître toutes les recettes de l'année", prog:c=>[CONTENU.RECETTES.filter(r=>!r.fete && c.etat.recettes[r.id]).length, CONTENU.RECETTES.filter(r=>!r.fete).length]},
  {id:"rares",   nom:"Récolter trois variantes rares",        prog:c=>[Math.min(3,c.etat.rares||0),3]},
  {id:"mille",   nom:"Mille pièces d'or gagnées en tout",     prog:c=>[Math.min(1000,c.etat.orTotal||0),1000]},
  {id:"herbier", nom:"Remplir l'herbier, variantes rares comprises", prog:c=>[Object.keys(CONTENU.PLANTES).filter(k=>(c.etat.herbier[k]||{}).rare).length, Object.keys(CONTENU.PLANTES).length]},
  {id:"fete",    nom:"Que la Lisière ait sa fête",            prog:c=>[c.etat.ville.chapitres.fete?1:0,1]},
];

/* ---------- SECRETS ----------
   Jamais d'indice. `test(c)` est évalué à chaque événement et à chaque seconde.
   c.evt vaut null (tick) ou : {type:"recolte", plante, pot, zone} / {type:"salut", visiteur, fois} /
   {type:"lune", taps} / {type:"soleil", taps} / {type:"fleur", plante, zone} / {type:"objet", id}
*/
CONTENU.SECRETS = [
  {id:"lune", nom:"La lune te rend ton regard", don:7,
   test:c=>c.evt && c.evt.type==="lune" && c.evt.taps>=7,
   texte:"Tu l'as touchée sept fois. Elle a cligné."},
  {id:"champi", nom:"Celui qui ne boit que la pluie", don:5,
   test:c=>c.evt && c.evt.type==="recolte" && c.evt.plante==="champignon",
   texte:"Le champignon n'est semé que les jours de pluie, et il n'a jamais soif."},
  {id:"loup", nom:"L'heure du loup", don:9,
   test:c=>c.heure===3,
   texte:"Tu étais à la lisière entre trois et quatre heures du matin. Personne d'autre ne l'était."},
  {id:"jumelles", nom:"Les jumelles", don:12,
   test:c=>c.nb(p=>p.plante==="lunefleur" && p.age>=CONTENU.PLANTES.lunefleur.duree,"potager")>=2,
   texte:"Deux fleurs de lune ouvertes la même nuit. Les lucioles sont devenues dorées."},
  {id:"resistant", nom:"Le résistant", don:6,
   test:c=>c.evt && c.evt.type==="recolte" && (CONTENU.PLANTES[c.evt.plante].besoin||"rosee")==="rosee" && c.evt.pot.sec/CONTENU.PLANTES[c.evt.plante].duree>=.85,
   texte:"Une plante a poussé presque sans eau jusqu'au bout. Elle était plus petite, mais elle y est arrivée."},
  {id:"adopte", nom:"Adopté", don:5,
   test:c=>c.evt && c.evt.type==="salut" && c.evt.visiteur==="chat" && c.evt.fois>=5,
   texte:"Le chat a été salué cinq fois. Il ne part plus. Il dort au bout du sentier."},
  {id:"premierrayon", nom:"Le premier rayon", don:8,
   test:c=>c.soleil && c.minute>=c.soleil.lever && c.minute<c.soleil.lever+10,
   texte:"Tu étais là dans les dix minutes qui ont suivi le lever du soleil. Tout était encore gris, puis plus."},
  {id:"soleil", nom:"On ne regarde pas le soleil", don:4,
   test:c=>c.evt && c.evt.type==="soleil" && c.evt.taps>=3,
   texte:"Tu l'as quand même fait. Trois fois. La lisière n'a rien dit, mais elle a noté."},
  {id:"pleinelune", nom:"La pleine lune", don:20,
   test:c=>c.nb(p=>p.plante && p.age>=CONTENU.PLANTES[p.plante].duree,"potager")===12 && c.nb(p=>p.plante==="lunefleur","potager")>0,
   texte:"Douze plantes ouvertes en même temps, et une fleur de lune parmi elles. La lune est devenue pleine, et le restera."},
  {id:"miroir", nom:"Le miroir", don:10,
   test:c=>c.phase==="nuit" && !c.pluie && c.nb(p=>p.plante==="lotus" && p.age>=CONTENU.PLANTES.lotus.duree,"mare")>0 && c.nb(p=>p.plante==="lunefleur" && p.age>=CONTENU.PLANTES.lunefleur.duree,"potager")>0,
   texte:"Un lotus ouvert sur l'eau, une fleur de lune ouverte sur la terre, la même nuit claire. L'une reflétait l'autre."},
  {id:"frontiere", nom:"La frontière", don:15,
   test:c=>c.bati("portail") && c.evt && c.evt.type==="salut" && c.evt.visiteur==="renard" && c.phase==="aube",
   texte:"Le renard, à l'aube, sous le portail. Il a attendu que tu le voies avant de passer de l'autre côté. Il n'y a pas d'autre côté. Il y est allé quand même."},
  {id:"tempete", nom:"Le jardinier qui reste", don:10,
   test:c=>c.temps==="tempete" && c.zone!=="village",
   texte:"Tempête, et tu étais dans les pots quand même. Rien n'a cassé. Les plantes s'en souviendront, à leur façon."},
  {id:"nuitmare", nom:"Ce qui attend", don:6,
   test:c=>c.phase==="nuit" && c.zone==="mare" && c.nb(p=>p.plante && p.age<CONTENU.PLANTES[p.plante].duree,"mare")>=4,
   texte:"Tu as regardé la mare la nuit, quand rien n'y pousse. Quatre plantes attendaient la lumière, sans impatience. Tu as appris quelque chose."},
  {id:"citrouilles", nom:"La nuit des citrouilles", don:15,
   test:c=>c.fete==="citrouilles" && new Date().getMonth()===9 && new Date().getDate()===31 && (c.phase==="nuit"||c.phase==="crepuscule") && ((c.etat.panier.lanterne||0)>0 || c.aPlante("citrouille",1,"potager")),
   texte:"Le 31 au soir, une citrouille à la lisière. Toutes les fenêtres de Saint-Aubin se sont allumées en même temps, en bas, dans la vallée. Tu ne les avais jamais vues d'ici."},
];

/* ---------- SONS ----------
   Vrais enregistrements (banque libre Moodist : CC0 et licence Pixabay), dans assets/sons/<fichier>.ogg.
   Le moteur calcule toutes les deux secondes le volume de chaque boucle à partir d'un contexte sonore c :
     c.moment (aube, matin, midi, apresmidi, soir, nuit), c.phase, c.temps (clair, nuageux, brume, pluie, tempete),
     c.pluie, c.lieu (village, potager, mare, atelier, courrier), c.dedans (atelier et courrier), c.ruche (ruches bâties)
   boucles   : vol(c) de 0 à 1, multiplié par le volume de son groupe (nature, meteo) ; element : interrupteur des réglages
               dedans:true = son d'intérieur, jamais étouffé
   episodes  : {duree:[min,max], pause:[min,max]} en secondes : la boucle n'est pas continue, on en joue des passages
               pris au hasard dans un long enregistrement, séparés de silences (moins répétitif)
   ponctuels : joués de temps en temps quand quand(c) est vrai, toutes les [min, max] secondes ; extraits : débuts possibles
   effets    : bruitages du jeu (groupe bruitages) ; cris : un extrait quand un visiteur arrive
   ecoutes   : ambiances fixes proposées dans les réglages, à la place de l'heure et de la météo réelles
*/
const sonJour = c => c.phase==="jour" || c.phase==="aube";
CONTENU.SONS = {
  elements:[
    {id:"oiseaux",  nom:"Oiseaux",            texte:"Le chœur du matin, plus discret l'après-midi."},
    {id:"insectes", nom:"Insectes",           texte:"Grillons le soir et la nuit, abeilles à midi (davantage avec les ruches)."},
    {id:"grenouilles", nom:"Grenouilles",     texte:"Surtout à la mare, le soir et sous la pluie."},
    {id:"loin",     nom:"Oiseaux au loin",    texte:"Corneilles, pic-vert : de temps en temps, quelque part."},
    {id:"nocturnes", nom:"Chouette",          texte:"Elle hulule la nuit, quand il ne pleut pas."},
    {id:"vent",     nom:"Vent",               texte:"Dans les feuilles par beau temps, plus fort quand le ciel se couvre."},
    {id:"pluie",    nom:"Pluie",              texte:"Sur les feuilles dehors, sur la vitre dedans."},
    {id:"tonnerre", nom:"Tonnerre",           texte:"Les jours de tempête, et parfois au loin sous la pluie."},
    {id:"eau",      nom:"Eau de la mare",     texte:"Gouttes et clapotis au bord de l'eau."},
    {id:"feu",      nom:"Feu de l'atelier",   texte:"Le poêle qui crépite à l'atelier et au comptoir."},
    {id:"horloge",  nom:"Horloge",            texte:"Le tic-tac de l'atelier."},
    {id:"carillon", nom:"Carillon",           texte:"Accroché à la cabane, il tinte quand le vent se lève."},
    {id:"cris",     nom:"Cris des visiteurs", texte:"Chaque visiteur s'annonce à sa façon en arrivant."},
  ],
  boucles:[
    {id:"oiseaux", element:"oiseaux", groupe:"nature", episodes:{duree:[7,18], pause:[25,80]},
     vol:c=>({aube:.9, matin:.8, midi:.35, apresmidi:.55, soir:.12, nuit:0}[c.moment]||0) * ({clair:1, nuageux:.8, brume:.6, pluie:.25, tempete:0}[c.temps]) * (c.lieu==="mare"?.7:1)},
    {id:"grillons", element:"insectes", groupe:"nature",
     vol:c=>({soir:.4, nuit:.5}[c.moment]||0) * ({clair:1, nuageux:.9, brume:.7, pluie:.25, tempete:0}[c.temps])},
    {id:"abeilles", element:"insectes", groupe:"nature", episodes:{duree:[5,12], pause:[40,120]},
     vol:c=>(c.moment==="midi"||c.moment==="apresmidi") && (c.temps==="clair"||c.temps==="nuageux") ? (.18 + (c.ruche?.3:0)) * (c.lieu==="potager"?1.3:c.lieu==="mare"?.5:1) : 0},
    {id:"grenouilles", element:"grenouilles", groupe:"nature", episodes:{duree:[5,14], pause:[30,90]},
     vol:c=>{ const soir = c.moment==="soir"||c.moment==="nuit"; const base = soir ? (c.lieu==="mare"?.8:.25) : c.pluie ? (c.lieu==="mare"?.5:.15) : 0; return base * (c.temps==="tempete"?.3:1); }},
    {id:"feuillage", element:"vent", groupe:"meteo",
     vol:c=>c.temps==="tempete" ? 0 : (sonJour(c)?.22:.15) * ({clair:1, nuageux:1.5, brume:.6, pluie:.8}[c.temps])},
    {id:"vent", element:"vent", groupe:"meteo",
     vol:c=>({clair:0, nuageux:.25, brume:.15, pluie:.2, tempete:.45}[c.temps])},
    {id:"ventfort", element:"vent", groupe:"meteo", vol:c=>c.temps==="tempete" ? .85 : 0},
    {id:"pluie", element:"pluie", groupe:"meteo", vol:c=>c.temps==="pluie" ? .8 : c.temps==="tempete" ? .45 : 0},
    {id:"pluiefeuilles", element:"pluie", groupe:"meteo", vol:c=>c.pluie ? (c.lieu==="mare"?.35:.6) : 0},
    {id:"averse", element:"pluie", groupe:"meteo", vol:c=>c.temps==="tempete" ? .8 : 0},
    {id:"vitre", element:"pluie", groupe:"meteo", dedans:true, vol:c=>c.dedans && c.pluie ? .7 : 0},
    {id:"gouttes", element:"eau", groupe:"nature", vol:c=>(c.lieu==="mare"?.45:0) * (c.pluie?.5:1)},
    {id:"feu", element:"feu", groupe:"nature", dedans:true, vol:c=>c.lieu==="atelier"?.75:c.lieu==="courrier"?.45:0},
    {id:"horloge", element:"horloge", groupe:"nature", dedans:true, vol:c=>c.dedans ? .18 : 0},
  ],
  ponctuels:[
    {id:"chouette", element:"nocturnes", fichier:"chouette", extraits:[3.1, 9.6], duree:3.6, vol:.4, toutes:[240,600], quand:c=>c.moment==="nuit" && !c.pluie},
    {id:"corneilles", element:"loin", fichier:"corneilles", duree:5, vol:.18, toutes:[360,900], quand:c=>(c.moment==="matin"||c.moment==="apresmidi") && c.temps!=="tempete"},
    {id:"pic", element:"loin", fichier:"pic", extraits:[0, 5.2, 7.7, 12.6], duree:2.5, vol:.25, toutes:[360,900], quand:c=>(c.moment==="aube"||c.moment==="matin") && !c.pluie},
    {id:"tonnerre", element:"tonnerre", groupe:"meteo", fichier:"tonnerre", extraits:[.7, 21.1, 41.7], duree:15, vol:.8, toutes:[45,140], quand:c=>c.temps==="tempete"},
    {id:"tonnerreloin", element:"tonnerre", groupe:"meteo", fichier:"tonnerre", extraits:[.7, 21.1, 41.7], duree:12, vol:.25, toutes:[600,1500], quand:c=>c.temps==="pluie"},
    {id:"carillon", element:"carillon", fichier:"carillon", duree:6, vol:.18, toutes:[300,800], quand:c=>c.cabane && (c.temps==="nuageux"||c.temps==="tempete"||c.temps==="pluie")},
  ],
  effets:{
    papier:  {fichier:"papier", extraits:[.7, 2.2, 3.8, 5.4, 7.0, 9.3, 10.9, 12.5, 14.7], duree:1.3, vol:.7},
    pas:     {fichier:"pas", extraits:[.3, 2.7, 5.5, 8.9, 10.5], duree:1.6, vol:.35},
    mijote:  {fichier:"mijote", duree:3.5, vol:.6},
    bol:     {fichier:"bol", debut:0, duree:9, vol:.6},
    ronron:  {fichier:"ronron", duree:5, vol:.8},
  },
  cris:{
    hibou:{fichier:"chouette", extraits:[3.1, 9.6], duree:3.6, vol:.6}, chouette:{fichier:"chouette", extraits:[3.1], duree:3.6, vol:.6},
    abeille:{fichier:"abeilles", duree:3, vol:.6}, grenouille:{fichier:"grenouilles", duree:3, vol:.7},
    merle:{fichier:"oiseaux", duree:3, vol:.6}, coccinelle:{fichier:"oiseaux", duree:2, vol:.3},
    chat:{fichier:"ronron", duree:3, vol:.7}, chatnoir:{fichier:"ronron", duree:3, vol:.7},
    pic:{fichier:"pic", extraits:[0], duree:2.5, vol:.5}, canard:{fichier:"grenouilles", duree:2, vol:.4},
    carpe:{fichier:"gouttes", duree:2.5, vol:.7}, heron:{fichier:"corneilles", duree:2, vol:.3},
    renard:{fichier:"pas", extraits:[.3, 5.5], duree:1.6, vol:.6}, herisson:{fichier:"pas", extraits:[2.7, 8.9], duree:1.6, vol:.6},
  },
  ecoutes:[
    {id:"jeu",     nom:"Suivre la lisière",           texte:"L'heure, la météo et le lieu réels du jeu."},
    {id:"matin",   nom:"Matin au potager",            c:{moment:"matin", phase:"jour", temps:"clair", pluie:false, lieu:"potager", ruche:true, cabane:true}},
    {id:"midi",    nom:"Midi, les abeilles",          c:{moment:"midi", phase:"jour", temps:"clair", pluie:false, lieu:"potager", ruche:true, cabane:true}},
    {id:"pluie",   nom:"Pluie sur les feuilles",      c:{moment:"apresmidi", phase:"jour", temps:"pluie", pluie:true, lieu:"potager", cabane:true}},
    {id:"nuitmare", nom:"Nuit à la mare",             c:{moment:"nuit", phase:"nuit", temps:"clair", pluie:false, lieu:"mare"}},
    {id:"tempete", nom:"Tempête",                     c:{moment:"apresmidi", phase:"jour", temps:"tempete", pluie:true, lieu:"village", cabane:true}},
    {id:"feu",     nom:"Coin du feu, dehors il pleut", c:{moment:"soir", phase:"crepuscule", temps:"pluie", pluie:true, lieu:"atelier", dedans:true}},
  ],
};

/* ---------- TEXTES D'AMBIANCE ---------- */
CONTENU.TEXTES = {
  titre:        "La Lisière",
  titrePleine:  "La Lisière, pleine lune",
  luneTrois:    "La lune ne dit rien. Elle regarde.",
  soleil:       "On ne regarde pas le soleil.",
  roseeAube:    "L'aube. La rosée est tombée : réserve pleine.",
  atelierIntro: "La cuisine transforme les récoltes, les améliorations se paient en lunes, et ce que les visiteurs laissent devient des objets.",
  courrierIntro:"Anselme monte chaque matin avec les lettres de Saint-Aubin. Ce que tu récoltes attend dans le panier : livre-le, offre-le aux habitants, ou vends-le au colporteur.",
  villageVide:  "Une clairière à la lisière du bois. Des terres, un étang, et de la place. Touche les terres ou l'étang pour y aller ; touche une pierre plate pour bâtir.",
  chantierUn:   "Un seul chantier à la fois : la lisière n'a qu'une paire de bras.",
};

/* ---------- DESSINS ----------
   Quatre stades par plante, en SVG dans un viewBox 0 0 100 100. Le sol est à y=92.
*/
const L = "var(--leaf)", L2 = "var(--leaf2)";
CONTENU.ART = {
  radis: [
    `<path d="M50 92 v-14" stroke="${L}" stroke-width="3"/><ellipse cx="44" cy="76" rx="6" ry="3" fill="${L}"/><ellipse cx="56" cy="76" rx="6" ry="3" fill="${L}"/>`,
    `<path d="M50 92 v-26" stroke="${L}" stroke-width="3"/><path d="M50 72 q-16 -4 -14 -18 q12 2 14 18z M50 66 q16 -4 14 -18 q-12 2 -14 18z" fill="${L}"/>`,
    `<path d="M50 92 v-30" stroke="${L}" stroke-width="3"/><path d="M50 70 q-18 -6 -16 -22 q14 2 16 22z M50 62 q18 -6 16 -22 q-14 2 -16 22z M50 78 q-10 -8 -6 -18 q8 6 6 18z" fill="${L}"/><circle cx="50" cy="90" r="6" fill="#e8907a"/>`,
    `<path d="M50 86 v-28" stroke="${L}" stroke-width="3"/><path d="M50 66 q-20 -6 -18 -24 q16 2 18 24z M50 58 q20 -6 18 -24 q-16 2 -18 24z M50 74 q-12 -10 -8 -22 q10 8 8 22z M50 74 q12 -10 8 -22 q-10 8 -8 22z" fill="${L}"/><circle cx="50" cy="88" r="11" fill="#e8907a"/><path d="M50 99 v4" stroke="#f1e9d6" stroke-width="2"/>`,
  ],
  tulipe: [
    `<path d="M50 92 v-16" stroke="${L}" stroke-width="3"/><path d="M50 84 q-8 -2 -8 -12 q8 2 8 12z" fill="${L}"/>`,
    `<path d="M50 92 v-36" stroke="${L}" stroke-width="3"/><path d="M50 82 q-10 -2 -10 -22 q10 2 10 22z M50 76 q10 -2 10 -22 q-10 2 -10 22z" fill="${L}"/>`,
    `<path d="M50 92 v-52" stroke="${L}" stroke-width="3"/><path d="M50 82 q-11 -2 -11 -26 q11 2 11 26z M50 76 q11 -2 11 -26 q-11 2 -11 26z" fill="${L}"/><path d="M44 42 q6 -14 12 0 v6 q-6 4 -12 0z" fill="#c98aa8"/>`,
    `<path d="M50 92 v-56" stroke="${L}" stroke-width="3"/><path d="M50 84 q-12 -2 -12 -28 q12 2 12 28z M50 78 q12 -2 12 -28 q-12 2 -12 28z" fill="${L}"/><path d="M38 38 q0 -16 12 -18 q12 2 12 18 l0 4 q-12 10 -24 0z" fill="#f0a6c0"/><path d="M50 20 l-4 10 l4 -4 l4 4z" fill="#f7c6d8"/>`,
  ],
  lavande: [
    `<path d="M50 92 v-12 M44 92 v-8 M56 92 v-10" stroke="${L2}" stroke-width="2.5"/>`,
    `<path d="M50 92 v-30 M42 92 v-22 M58 92 v-26" stroke="${L2}" stroke-width="2.5"/><path d="M40 80 l-8 -4 M60 76 l8 -4 M50 70 l-6 -4" stroke="${L2}" stroke-width="2"/>`,
    `<path d="M50 92 v-44 M40 92 v-36 M60 92 v-40" stroke="${L2}" stroke-width="2.5"/>${[[50,40],[40,50],[60,46]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="3" ry="7" fill="#9f88cf"/>`).join("")}`,
    `<path d="M50 92 v-52 M38 92 v-42 M62 92 v-46 M44 92 v-38 M56 92 v-40" stroke="${L2}" stroke-width="2.5"/>${[[50,32],[38,42],[62,38],[44,46],[56,44]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="3.5" ry="9" fill="#b7a3e3"/><ellipse cx="${x}" cy="${y-6}" rx="2.5" ry="4" fill="#cfbff0"/>`).join("")}`,
  ],
  citrouille: [
    `<path d="M50 92 q-6 -10 0 -16" stroke="${L}" stroke-width="3" fill="none"/><path d="M50 78 q-9 -4 -8 -12 q8 2 8 12z" fill="${L}"/>`,
    `<path d="M50 92 q-14 -14 -4 -30" stroke="${L}" stroke-width="3" fill="none"/><path d="M46 68 q-14 -6 -10 -20 q12 4 10 20z M48 80 q14 -4 12 -16 q-12 2 -12 16z" fill="${L}"/><circle cx="60" cy="86" r="4" fill="${L}"/>`,
    `<path d="M50 92 q-20 -16 -8 -36" stroke="${L}" stroke-width="3" fill="none"/><path d="M44 62 q-16 -8 -12 -24 q14 4 12 24z M46 76 q16 -4 14 -18 q-14 2 -14 18z" fill="${L}"/><circle cx="58" cy="84" r="9" fill="#9fb86a"/>`,
    `<path d="M30 70 q-10 -24 10 -30" stroke="${L}" stroke-width="3" fill="none"/><path d="M26 56 q-14 -8 -10 -24 q14 4 10 24z" fill="${L}"/><ellipse cx="56" cy="80" rx="24" ry="17" fill="#e6a35c"/><path d="M44 64 q-6 16 0 32 M56 63 v34 M68 64 q6 16 0 32" stroke="#c7813e" stroke-width="2" fill="none"/><rect x="53" y="56" width="6" height="9" rx="2" fill="${L2}"/>`,
  ],
  champi: [
    `<circle cx="50" cy="90" r="3" fill="#d9c8b0"/><circle cx="42" cy="92" r="2" fill="#d9c8b0"/>`,
    `<rect x="46" y="76" width="8" height="16" rx="3" fill="#e9dcc7"/><ellipse cx="50" cy="76" rx="9" ry="5" fill="#c97b5a"/>`,
    `<rect x="45" y="66" width="10" height="26" rx="4" fill="#e9dcc7"/><ellipse cx="50" cy="66" rx="15" ry="9" fill="#c97b5a"/><circle cx="44" cy="63" r="2" fill="#f3e9d8"/><circle cx="55" cy="66" r="1.6" fill="#f3e9d8"/>`,
    `<rect x="44" y="58" width="12" height="34" rx="5" fill="#e9dcc7"/><ellipse cx="50" cy="58" rx="22" ry="13" fill="#c97b5a"/><circle cx="40" cy="54" r="3" fill="#f3e9d8"/><circle cx="56" cy="58" r="2.4" fill="#f3e9d8"/><circle cx="49" cy="48" r="2" fill="#f3e9d8"/><rect x="66" y="80" width="7" height="12" rx="3" fill="#e9dcc7"/><ellipse cx="69.5" cy="80" rx="9" ry="5" fill="#c97b5a"/>`,
  ],
  lune: [
    `<path d="M50 92 v-14" stroke="${L}" stroke-width="3"/><circle cx="50" cy="76" r="3" fill="var(--moon)"/>`,
    `<path d="M50 92 v-34" stroke="${L}" stroke-width="3"/><path d="M50 80 q-10 0 -12 -14 q10 2 12 14z M50 72 q10 0 12 -14 q-10 2 -12 14z" fill="${L}"/><circle cx="50" cy="56" r="4" fill="var(--moon)"/>`,
    `<path d="M50 92 v-48" stroke="${L}" stroke-width="3"/><path d="M50 80 q-12 0 -14 -16 q12 2 14 16z M50 72 q12 0 14 -16 q-12 2 -14 16z" fill="${L}"/><circle cx="50" cy="42" r="8" fill="var(--moon)" opacity=".7"/><circle cx="50" cy="42" r="4" fill="#fff6d6"/>`,
    `<path d="M50 92 v-52" stroke="${L}" stroke-width="3"/><path d="M50 82 q-12 0 -14 -16 q12 2 14 16z M50 74 q12 0 14 -16 q-12 2 -14 16z" fill="${L}"/><circle cx="50" cy="36" r="16" fill="var(--moon)" opacity=".25"/>${[0,60,120,180,240,300].map(a=>`<ellipse cx="50" cy="26" rx="4" ry="10" fill="#fff0bd" transform="rotate(${a} 50 36)"/>`).join("")}<circle cx="50" cy="36" r="5" fill="var(--moon)"/>`,
  ],
};

/* mare : l'eau est à y=92 ; les dessins s'appuient dessus */
const W1 = "#86b8e6", W2 = "#5f93c7";
Object.assign(CONTENU.ART, {
  nenuphar: [
    `<ellipse cx="50" cy="90" rx="8" ry="3" fill="${L2}"/>`,
    `<path d="M50 90 m-14 0 a14 5 0 1 0 28 0 a14 5 0 1 0 -28 0z M50 90 l12 -3" fill="${L}" stroke="${L2}" stroke-width="1"/>`,
    `<path d="M50 90 m-18 0 a18 6 0 1 0 36 0 a18 6 0 1 0 -36 0z" fill="${L}"/><path d="M50 90 l14 -4 l2 3z" fill="${W1}"/><circle cx="50" cy="82" r="4" fill="#f0a6c0"/>`,
    `<path d="M50 90 m-20 0 a20 7 0 1 0 40 0 a20 7 0 1 0 -40 0z" fill="${L}"/><path d="M50 90 l16 -5 l2 3z" fill="${W1}"/><path d="M50 84 l-9 -3 l5 -8 l4 6 l4 -6 l5 8z" fill="#f7c6d8"/><path d="M50 84 l-5 -2 l3 -6 l2 4 l2 -4 l3 6z" fill="#f0a6c0"/><circle cx="50" cy="80" r="2" fill="var(--moon)"/>`,
  ],
  roseau: [
    `<path d="M50 92 v-14 M56 92 v-10" stroke="${L2}" stroke-width="2.5"/>`,
    `<path d="M50 92 v-36 M56 92 v-28 M44 92 v-24" stroke="${L2}" stroke-width="2.5"/>`,
    `<path d="M50 92 v-52 M58 92 v-42 M42 92 v-38" stroke="${L2}" stroke-width="2.5"/><rect x="48" y="30" width="4" height="12" rx="2" fill="#8a6a4a"/>`,
    `<path d="M50 92 v-60 M60 92 v-50 M40 92 v-46 M54 92 v-36" stroke="${L2}" stroke-width="2.5"/><rect x="48" y="22" width="4.5" height="14" rx="2" fill="#8a6a4a"/><rect x="58" y="32" width="4" height="12" rx="2" fill="#8a6a4a"/><rect x="38" y="36" width="4" height="11" rx="2" fill="#8a6a4a"/>`,
  ],
  iris: [
    `<path d="M50 92 v-16 M46 92 v-12" stroke="${L2}" stroke-width="2.5"/>`,
    `<path d="M50 92 v-40 M44 92 v-30 M56 92 v-26" stroke="${L2}" stroke-width="2.5"/><path d="M44 62 l-4 -6 M56 66 l4 -6" stroke="${L2}" stroke-width="2"/>`,
    `<path d="M50 92 v-54 M44 92 v-40 M56 92 v-36" stroke="${L2}" stroke-width="2.5"/><path d="M50 38 q-6 -8 0 -12 q6 4 0 12z" fill="#7d6fc9"/>`,
    `<path d="M50 92 v-58 M43 92 v-44 M57 92 v-40" stroke="${L2}" stroke-width="2.5"/><path d="M50 34 q-10 -4 -10 -14 q10 2 10 14z M50 34 q10 -4 10 -14 q-10 2 -10 14z M50 34 q-8 6 -12 2 q4 -8 12 -2z M50 34 q8 6 12 2 q-4 -8 -12 -2z" fill="#9f88cf"/><path d="M50 36 l-3 -8 l3 -4 l3 4z" fill="var(--moon)"/>`,
  ],
  lotus: [
    `<ellipse cx="50" cy="90" rx="9" ry="3" fill="${L}"/>`,
    `<path d="M50 90 m-16 0 a16 5 0 1 0 32 0 a16 5 0 1 0 -32 0z" fill="${L}"/><path d="M50 90 v-14" stroke="${L2}" stroke-width="2.5"/><ellipse cx="50" cy="74" rx="4" ry="6" fill="#d98aa8"/>`,
    `<path d="M50 90 m-18 0 a18 6 0 1 0 36 0 a18 6 0 1 0 -36 0z" fill="${L}"/><path d="M50 90 v-26" stroke="${L2}" stroke-width="2.5"/><path d="M50 64 q-8 -2 -8 -12 q8 2 8 12z M50 64 q8 -2 8 -12 q-8 2 -8 12z" fill="#e8a0bd"/><ellipse cx="50" cy="56" rx="3" ry="7" fill="#f3c4d6"/>`,
    `<path d="M50 90 m-20 0 a20 7 0 1 0 40 0 a20 7 0 1 0 -40 0z" fill="${L}"/><path d="M50 90 v-34" stroke="${L2}" stroke-width="2.5"/>${[-50,-25,0,25,50].map(a=>`<ellipse cx="50" cy="44" rx="4.5" ry="12" fill="#f0a6c0" transform="rotate(${a} 50 56)"/>`).join("")}${[-30,0,30].map(a=>`<ellipse cx="50" cy="46" rx="3.5" ry="10" fill="#f7d0de" transform="rotate(${a} 50 56)"/>`).join("")}<circle cx="50" cy="52" r="3.5" fill="var(--moon)"/>`,
  ],
});

/* ---------- RÉGLAGES ---------- */
CONTENU.REGLES = {
  lieu: {lat:48.86, lon:2.35},   // Paris : sert au lever et au coucher du soleil
  aubeAvant:50, aubeApres:30, crepAvant:30, crepApres:50,   // minutes autour du lever et du coucher
  ralentiSoif: 3,        // la pousse est divisée par ce facteur quand la plante a soif
  regenRosee: 480,       // secondes par goutte (8 min ; moitié sous la pluie) ; à l'aube, la réserve se remplit d'un coup
  dureeVisite: 90,       // secondes qu'un visiteur reste sur le sentier
  averse: 900,           // sous la pluie, toutes les plantes assoiffées sont abreuvées à cet intervalle (15 min)
  roseeMax: c=>2+Math.floor(c.nb(p=>p.ouvert,"potager")/4),
  saison: date=>{ const m=date.getMonth(); return m<=1||m===11 ? "hiver" : m<=4 ? "printemps" : m<=7 ? "ete" : "automne"; },
  temps: date=>{        // le temps du jour, tiré de la date avec les poids de la saison ; le même toute la journée
    const s=`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
    let h=2166136261; for(const ch of s){ h^=ch.charCodeAt(0); h=Math.imul(h,16777619)>>>0; }
    h^=h>>>13; h=Math.imul(h,0x5bd1e995)>>>0; h=(h^(h>>>15))>>>0;
    const saison = CONTENU.REGLES.saison(date), total = CONTENU.TEMPS.reduce((n,t)=>n+t.poids[saison],0);
    let r = h % total; for(const t of CONTENU.TEMPS){ r -= t.poids[saison]; if(r<0) return t.id; }
    return "clair";
  },
};

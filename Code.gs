// ================================================================
//  TANGO & VOUS — Apps Script unifié
//  Version : 2.0 — Avril 2026
// ================================================================
//  Actions GET  : ping | getEleve | getAdminData
//                 getPublications | getAgendaExtra
//  Actions POST : pointageManuel | reservationCP | inscriptionStage
//                 updateStatutCP | validerAttente | creerEleve
//                 activerEleve | desactiverEleve | pointerEssai
//                 envoyerEmailsEssaiJ1 | sauvegarderPublication
//                 publierPublication | supprimerPublication
// ================================================================
//  DÉCLENCHEURS (Apps Script → Déclencheurs) :
//    • declencheurEmailsEssai → Quotidien 9h-10h
//    • declencheurNouvelleS   → Annuel · 1er septembre · 8h-9h
// ================================================================

// ── Onglets Google Sheets ──────────────────────────────────────
const SHEET_ELEVES       = 'Élèves';
const SHEET_PRESENCES    = 'Présences';
const SHEET_CP           = 'Cours Particuliers';
const SHEET_STAGES       = 'Stages';
const SHEET_ESSAI        = 'Inscriptions';
const SHEET_PUBLICATIONS = 'Publications';
const SHEET_AGENDA       = 'Agenda';

// ── Lignes de départ ──────────────────────────────────────────
const ELEVES_START_ROW    = 5;
const PRESENCES_START_ROW = 6;

// ── Colonnes onglet Élèves (index 0-based) ────────────────────
// A=ID B=Nom C=Niveau D=DateAchat E=Expiration F=Utilisés
// G=Restants H=StatutCarte I=Notes J=Actions K=Email
// L=StatutEleve  M=Source
const COL = {
  ID:0, NOM:1, NIVEAU:2, DATE_ACHAT:3, EXPIRATION:4,
  UTILISES:5, RESTANTS:6, STATUT_CARTE:7,
  NOTES:8, ACTIONS:9, EMAIL:10,
  STATUT_ELEVE:11,
  SOURCE:12,
};

const STATUT = {
  EN_ATTENTE:'En attente', ACTIF:'Actif',
  INACTIF:'Inactif', SUSPENDU:'Suspendu',
};

// ── Admins ────────────────────────────────────────────────────
const ADMIN_EMAILS = [
  'tangoetvous@gmail.com',
  'florencia@tangoetvous.com',
  'jeremy@tangoetvous.com',
];

// ── URLs ──────────────────────────────────────────────────────
const URL_PWA     = 'https://USERNAME.github.io/tango-et-vous-app';
const EMAIL_CONTACT = 'tangoetvous@gmail.com';
const NOM_ECOLE     = 'Tango & Vous';
const URL_SITE      = 'https://www.tangoetvous.com';

// ── Dates stages ──────────────────────────────────────────────
const DATES_STAGES_LABELS = {
  '2025-09-19':'Samedi 19 Septembre 2025','2025-10-03':'Samedi 3 Octobre 2025',
  '2025-11-07':'Samedi 7 Novembre 2025', '2025-12-05':'Samedi 5 Décembre 2025',
  '2026-01-30':'Samedi 30 Janvier 2026', '2026-02-27':'Samedi 27 Février 2026',
  '2026-03-13':'Samedi 13 Mars 2026',    '2026-04-24':'Samedi 24 Avril 2026',
  '2026-05-22':'Samedi 22 Mai 2026',     '2026-06-19':'Samedi 19 Juin 2026',
};

// ================================================================
// GET
// ================================================================
function doGet(e) {
  const out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    const p = e.parameter, a = (p.action||'').trim();
    let r;
    switch(a) {
      case 'ping':            r = {ok:true,ts:new Date().toISOString(),version:'2.0'}; break;
      case 'getEleve':        r = getEleveByEmail(p.email||''); break;
      case 'getAdminData':    r = getAdminData(p.email||''); break;
      case 'getPublications': r = getPublications(); break;
      case 'getAgendaExtra':  r = getAgendaExtra(); break;
      default:                r = {error:'Action GET inconnue : '+a};
    }
    out.setContent(JSON.stringify(r));
  } catch(err) { out.setContent(JSON.stringify({error:err.message})); }
  return out;
}

// ================================================================
// POST
// ================================================================
function doPost(e) {
  const out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    const b = JSON.parse(e.postData.contents||'{}'), a = (b.action||'').trim();
    let r;
    switch(a) {
      case 'pointageManuel':         r = ajouterPresenceManuelle(b); break;
      case 'pointerEssai':           r = pointerEssaiGs(b); break;
      case 'envoyerEmailsEssaiJ1':   r = envoyerEmailsEssaiJ1(b); break;
      case 'reservationCP':          r = traiterReservationCP(b); break;
      case 'updateStatutCP':         r = updateStatutCP(b); break;
      case 'inscriptionStage':       r = traiterInscriptionStage(b); break;
      case 'validerAttente':         r = validerAttenteStage(b); break;
      case 'creerEleve':             r = creerEleve(b); break;
      case 'activerEleve':           r = activerEleve(b); break;
      case 'desactiverEleve':        r = desactiverEleve(b); break;
      case 'sauvegarderPublication': r = sauvegarderPublication(b); break;
      case 'publierPublication':     r = publierPublication(b); break;
      case 'supprimerPublication':   r = supprimerPublication(b); break;
      default:                       r = {error:'Action POST inconnue : '+a};
    }
    out.setContent(JSON.stringify(r));
  } catch(err) { out.setContent(JSON.stringify({error:err.message})); }
  return out;
}

// ================================================================
// ÉLÈVE — getEleveByEmail
// Vérifie le statut : seuls les Actifs peuvent se connecter
// ================================================================
function getEleveByEmail(email) {
  if (!email) throw new Error('Email requis');
  email = email.trim().toLowerCase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const se = _getSheet(ss, SHEET_ELEVES);
  const sp = _getSheet(ss, SHEET_PRESENCES);
  const lr = se.getLastRow();
  if (lr < ELEVES_START_ROW) return {error:'not_found',email};
  const data = se.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues();
  const row  = data.find(r=>(r[COL.EMAIL]||'').toString().trim().toLowerCase()===email);
  if (!row) return {error:'not_found',email};
  const st = (row[COL.STATUT_ELEVE]||STATUT.EN_ATTENTE).toString().trim();
  if (st !== STATUT.ACTIF) return {
    error:'not_active', statut:st,
    message: st===STATUT.EN_ATTENTE
      ? 'Votre compte est en cours de validation. Vous recevrez un email dès qu\'il sera activé.'
      : 'Votre accès est suspendu. Contactez-nous si vous pensez que c\'est une erreur.',
  };
  return {
    eleve:{id:row[COL.ID],nom:row[COL.NOM],niveau:row[COL.NIVEAU],email,statut:st},
    carte:{
      coursUtilises:Number(row[COL.UTILISES])||0,
      coursRestants:Number(row[COL.RESTANTS])||0,
      dateAchat:    _fmtDate(row[COL.DATE_ACHAT]),
      dateExpiration:_fmtDate(row[COL.EXPIRATION]),
      statut:(row[COL.STATUT_CARTE]||'').toString(),
    },
    presences:_getPresences(sp, row[COL.ID]),
  };
}

// ================================================================
// ÉLÈVE — creerEleve
// Crée un profil "En attente" si l'email n'existe pas déjà
// Sources : essai | inscription | stage | cours_particulier | manuel
// ================================================================
function creerEleve(body) {
  const {nom,email,niveau,source,notes} = body;
  if (!nom||!email) throw new Error('nom et email requis');
  const emailNorm = email.trim().toLowerCase();
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const sheet     = _getSheet(ss, SHEET_ELEVES);
  const lr        = sheet.getLastRow();

  // Vérifier doublon
  if (lr >= ELEVES_START_ROW) {
    const data = sheet.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues();
    const exist = data.find(r=>(r[COL.EMAIL]||'').toString().trim().toLowerCase()===emailNorm);
    if (exist) return {ok:true,action:'already_exists',id:exist[COL.ID]};
  }

  const newId  = _genId(sheet);
  const newRow = new Array(13).fill('');
  newRow[COL.ID]           = newId;
  newRow[COL.NOM]          = nom.trim();
  newRow[COL.NIVEAU]       = niveau||'';
  newRow[COL.NOTES]        = notes||'';
  newRow[COL.EMAIL]        = emailNorm;
  newRow[COL.STATUT_ELEVE] = STATUT.EN_ATTENTE;
  newRow[COL.SOURCE]       = source||'manuel';
  sheet.appendRow(newRow);

  _notifNouvelEleve({nom:nom.trim(),email:emailNorm,niveau:niveau||'',source:source||'manuel'});
  return {ok:true,action:'created',id:newId};
}

// ================================================================
// ÉLÈVE — activerEleve
// Passe à "Actif" + envoie l'email de bienvenue PWA
// ================================================================
function activerEleve(body) {
  const {id,email} = body;
  if (!id&&!email) throw new Error('id ou email requis');
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _getSheet(ss, SHEET_ELEVES);
  const lr    = sheet.getLastRow();
  if (lr < ELEVES_START_ROW) throw new Error('Aucun élève');
  const data  = sheet.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues();
  const idx   = data.findIndex(r=>
    (id    && r[COL.ID].toString()===id.toString()) ||
    (email && (r[COL.EMAIL]||'').toString().trim().toLowerCase()===email.trim().toLowerCase())
  );
  if (idx<0) throw new Error('Élève introuvable');
  const rn = idx+ELEVES_START_ROW;
  sheet.getRange(rn, COL.STATUT_ELEVE+1).setValue(STATUT.ACTIF);
  const nom   = data[idx][COL.NOM];
  const mail  = (data[idx][COL.EMAIL]||'').toString().trim();
  const niv   = data[idx][COL.NIVEAU]||'';
  if (mail) _emailBienvenueActivation(nom, mail, niv);
  return {ok:true,nom,email:mail};
}

// ================================================================
// ÉLÈVE — desactiverEleve
// ================================================================
function desactiverEleve(body) {
  const {id,email,statut} = body;
  if (!id&&!email) throw new Error('id ou email requis');
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _getSheet(ss, SHEET_ELEVES);
  const lr    = sheet.getLastRow();
  if (lr < ELEVES_START_ROW) throw new Error('Aucun élève');
  const data  = sheet.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues();
  const idx   = data.findIndex(r=>
    (id    && r[COL.ID].toString()===id.toString()) ||
    (email && (r[COL.EMAIL]||'').toString().trim().toLowerCase()===email.trim().toLowerCase())
  );
  if (idx<0) throw new Error('Élève introuvable');
  const nst = statut||STATUT.INACTIF;
  sheet.getRange(idx+ELEVES_START_ROW, COL.STATUT_ELEVE+1).setValue(nst);
  return {ok:true,statut:nst};
}

// ================================================================
// DÉCLENCHEUR — Nouvelle saison (1er septembre)
// ================================================================
function declencheurNouvelleS() {
  const today = new Date();
  if (today.getMonth()!==8||today.getDate()!==1) return;
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _getSheet(ss, SHEET_ELEVES);
  const lr    = sheet.getLastRow();
  if (lr < ELEVES_START_ROW) return;
  const data  = sheet.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues();
  let count   = 0;
  const noms  = [];
  data.forEach((r,i)=>{
    if ((r[COL.STATUT_ELEVE]||'').toString().trim()===STATUT.ACTIF) {
      sheet.getRange(i+ELEVES_START_ROW, COL.STATUT_ELEVE+1).setValue(STATUT.INACTIF);
      count++; if (r[COL.NOM]) noms.push(r[COL.NOM]);
    }
  });
  if (!count) return;
  const annee = today.getFullYear();
  const saison = annee+'-'+(annee+1);
  const sujet  = `${NOM_ECOLE} — Nouvelle saison ${saison} : ${count} élèves désactivés`;
  const corps  = _emailWrap(`Nouvelle saison ${saison}`, `
    <p style="font-size:14px;color:#ccc;line-height:1.8;margin-bottom:16px;">
      Le déclencheur automatique vient de s'exécuter.<br/>
      <strong style="color:#D4AF37;">${count} élève${count>1?'s ont été désactivés':' a été désactivé'}</strong>
      pour le début de la nouvelle saison.
    </p>
    <div style="background:#0f0d00;border:2px solid #3a2d00;border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;color:#ccc;line-height:2;">
      → Dashboard admin → onglet <strong style="color:#D4AF37;">Élèves</strong><br/>
      → Filtrer par <strong>"Inactif"</strong> pour voir les élèves à réactiver<br/>
      → Activer au fur et à mesure les réinscriptions
    </div>
    <p style="font-size:12px;color:#888;">
      Élèves désactivés : ${noms.slice(0,20).join(', ')}${noms.length>20?'…':''}
    </p>
    <div style="text-align:center;margin-top:20px;color:#D4AF37;">
      Bonne saison ${saison} !<br/><strong>Système ${NOM_ECOLE}</strong>
    </div>`);
  ADMIN_EMAILS.forEach(a=>{ try { MailApp.sendEmail({to:a,subject:sujet,htmlBody:corps}); } catch(e){} });
}

// ================================================================
// ADMIN — getAdminData
// ================================================================
function getAdminData(email) {
  if (!email) throw new Error('Email requis');
  email = email.trim().toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) throw new Error('Accès refusé');
  const cartes    = _getCartesAdmin();
  return {
    cartes,
    enAttente:         cartes.filter(c=>c.statutEleve===STATUT.EN_ATTENTE),
    actifs:            cartes.filter(c=>c.statutEleve===STATUT.ACTIF),
    inactifs:          cartes.filter(c=>c.statutEleve===STATUT.INACTIF),
    coursParticuliers: _getCPAdmin(),
    stages:            _getStagesAdmin(),
    coursEssai:        _getEssaiAdmin(),
    publications:      _getPublicationsAdmin(),
    stats:{
      total:     cartes.length,
      actifs:    cartes.filter(c=>c.statutEleve===STATUT.ACTIF).length,
      enAttente: cartes.filter(c=>c.statutEleve===STATUT.EN_ATTENTE).length,
      inactifs:  cartes.filter(c=>c.statutEleve===STATUT.INACTIF).length,
    },
  };
}

// ================================================================
// PRÉSENCES
// ================================================================
function ajouterPresenceManuelle(body) {
  const {eleveId,date,niveau,note} = body;
  if (!eleveId||!date||!niveau) throw new Error('eleveId, date et niveau requis');
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const sp   = _getSheet(ss, SHEET_PRESENCES);
  const se   = _getSheet(ss, SHEET_ELEVES);
  const nom  = _getNomEleve(se, eleveId);
  const nr   = Math.max(sp.getLastRow(), PRESENCES_START_ROW-1)+1;
  const hora = Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd HH:mm');
  sp.getRange(nr,1).setValue(hora);  sp.getRange(nr,2).setValue(eleveId);
  sp.getRange(nr,3).setValue(nom);   sp.getRange(nr,4).setValue(new Date(date));
  sp.getRange(nr,4).setNumberFormat('dd/MM/yyyy');
  sp.getRange(nr,5).setValue(niveau);
  sp.getRange(nr,6).setFormula(`=IF(B${nr}="","",IF(COUNTIFS($B$${PRESENCES_START_ROW}:B${nr},B${nr},$D$${PRESENCES_START_ROW}:D${nr},D${nr},$E$${PRESENCES_START_ROW}:E${nr},E${nr})>1,"OUI","NON"))`);
  sp.getRange(nr,7).setValue(note||'Ajout manuel (admin)');
  return {ok:true,message:`Présence ajoutée pour ${nom} le ${date}`};
}

// ================================================================
// COURS PARTICULIERS
// ================================================================
function traiterReservationCP(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s    = ss.getSheetByName(SHEET_CP);
  if (!s) {
    s = ss.insertSheet(SHEET_CP);
    const h = ['Horodatage','ID Élève','Prénom','Nom','Email','Téléphone','Niveau',
      'Professeur','Durée','Lieu','Lieu (détail)','Objectif(s)','Remarque',
      'Disponibilités','Urgence','Source','Statut'];
    const hr = s.getRange(1,1,1,h.length); hr.setValues([h]);
    hr.setBackground('#D4AF37').setFontColor('#000').setFontWeight('bold');
    s.setFrozenRows(1);
  }
  const now = Utilities.formatDate(new Date(),'Europe/Paris','dd/MM/yyyy HH:mm');
  s.appendRow([now,body.eleveId||'',body.prenom||'',body.nom||'',body.email||'',
    body.tel||'',body.niveauEleve||'',body.prof||'',body.duree||'',body.lieu||'',
    body.lieuDetail||'',body.objectifs||'',body.remarque||'',body.dispoTexte||'',
    body.urgence||'',body.source||'wix','Nouvelle']);
  if (body.email) creerEleve({
    nom:(body.prenom||'')+' '+(body.nom||''),email:body.email,
    niveau:body.niveauEleve||'',source:'cours_particulier',
    notes:'Via formulaire cours particulier',
  });
  _notifCP(body,now); _confirmCP(body);
  return {ok:true};
}

function updateStatutCP(body) {
  const {id,statut} = body;
  if (!id||!statut) throw new Error('id et statut requis');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = _getSheet(ss,SHEET_CP);
  const rn = parseInt((id||'').replace('CP',''),10)-1+2;
  if (isNaN(rn)||rn>s.getLastRow()) throw new Error('Demande introuvable');
  s.getRange(rn,17).setValue(statut);
  return {ok:true};
}

// ================================================================
// STAGES
// ================================================================
function traiterInscriptionStage(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s    = ss.getSheetByName(SHEET_STAGES);
  if (!s) {
    s = ss.insertSheet(SHEET_STAGES);
    const h = ['Horodatage','Prénom','Nom','Email','Rôle','Niveau','Situation',
      'Date','Slots','Type confirmation','Source','Partenaire','Rôle partenaire',
      'Email partenaire','Prix inscrit','Prix partenaire','Remarque'];
    const hr = s.getRange(1,1,1,h.length); hr.setValues([h]);
    hr.setBackground('#D4AF37').setFontColor('#000').setFontWeight('bold');
    s.setFrozenRows(1);
  }
  const now  = Utilities.formatDate(new Date(),'Europe/Paris','dd/MM/yyyy HH:mm');
  (body.inscriptionsParDate||[]).forEach(d=>{
    s.appendRow([now,body.prenom||'',body.nom||'',body.email||'',body.role||'',
      body.niveau||'',body.situation||'',d.date||'',d.stagesInscrit||'',
      body.typeConfirmation||'confirme',body.source||'wix',
      body.pPrenom&&body.pNom?body.pPrenom+' '+body.pNom:'',
      body.rolePartenaire||'',body.pEmail||'',d.prixInscrit||0,d.prixPartenaire||0,body.remarque||'']);
  });
  if (body.email) creerEleve({
    nom:(body.prenom||'')+' '+(body.nom||''),email:body.email,
    niveau:body.niveau||'',source:'stage',notes:'Via formulaire stage',
  });
  _confirmStage(body);
  return {ok:true};
}

function validerAttenteStage(body) {
  const {date} = body;
  if (!date) throw new Error('date requise');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = _getSheet(ss,SHEET_STAGES);
  const lr = s.getLastRow();
  if (lr<2) return {ok:true,message:'0 ligne'};
  const data = s.getRange(2,1,lr-1,17).getValues();
  let count  = 0;
  data.forEach((r,i)=>{
    if (_fmtDate(r[7])!==date||(r[9]||'').toString().toLowerCase()!=='attente') return;
    s.getRange(i+2,10).setValue('confirme'); count++;
    const em = (r[3]||'').toString().trim();
    if (em) MailApp.sendEmail({to:em,replyTo:EMAIL_CONTACT,
      subject:NOM_ECOLE+' — Stage confirmé !',
      htmlBody:_tplConfirmAttenteStage((r[1]||'').toString(),date)});
  });
  return {ok:true,message:`${count} confirmée(s)`};
}

// ================================================================
// POINTAGE COURS D'ESSAI
// ================================================================
function pointerEssaiGs(body) {
  const {email,date,ville,niveau,present} = body;
  if (!email||!date) throw new Error('email et date requis');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = _getSheet(ss,SHEET_ESSAI);
  const lr = s.getLastRow();
  if (lr<2) return {ok:true};
  const data = s.getRange(2,1,lr-1,12).getValues();
  data.forEach((r,i)=>{
    if ((r[3]||'').toString().trim().toLowerCase()===email.toLowerCase()&&_fmtDate(r[7])===date)
      s.getRange(i+2,12).setValue(present);
  });
  if (email) {
    const row   = data.find(r=>(r[3]||'').toString().trim().toLowerCase()===email.toLowerCase());
    const prenom = row ? row[1]||'' : '';
    creerEleve({nom:prenom,email,niveau:niveau||'',source:'cours_essai',notes:'Via cours d\'essai du '+date});
  }
  return {ok:true};
}

function envoyerEmailsEssaiJ1(body) {
  const {date,ville,niveau,presents,absents} = body;
  let ps=0,as=0;
  const nl  = niveau==='debutant'?'Débutant':'Intermédiaire & Avancé';
  const vl  = ville==='paris'?'Paris':'Vincennes';
  const df  = _fmtDateFr(date);
  const ui  = URL_SITE+'/l-ecole-de-tango-argentin/demande-inscription-cours-tango';
  const ue  = URL_SITE+'/l-ecole-de-tango-argentin';
  (presents||[]).forEach(p=>{ if (!p.email) return;
    MailApp.sendEmail({to:p.email,replyTo:EMAIL_CONTACT,
      subject:NOM_ECOLE+' — Suite à votre cours d\'essai',
      htmlBody:_tplEssaiPresent(p,df,nl,vl,ui)}); ps++; });
  (absents||[]).forEach(p=>{ if (!p.email) return;
    MailApp.sendEmail({to:p.email,replyTo:EMAIL_CONTACT,
      subject:NOM_ECOLE+' — Votre cours d\'essai du '+df,
      htmlBody:_tplEssaiAbsent(p,df,nl,vl,ue)}); as++; });
  return {ok:true,presentsSent:ps,absentsSent:as};
}

function declencheurEmailsEssai() {
  const hier = new Date(); hier.setDate(hier.getDate()-1);
  const hs   = _fmtDate(hier);
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const s    = ss.getSheetByName(SHEET_ESSAI);
  if (!s||s.getLastRow()<2) return;
  const data = s.getRange(2,1,s.getLastRow()-1,12).getValues();
  const grp  = {};
  data.filter(r=>r[0]).forEach(r=>{
    if (_fmtDate(r[7])!==hs) return;
    const k=(r[7]+'|'+(r[5]||'')+'|'+(r[6]||''));
    if (!grp[k]) grp[k]={date:_fmtDate(r[7]),ville:r[5]||'',niveau:r[6]||'',presents:[],absents:[]};
    const p={prenom:r[1]||'',nom:r[2]||'',email:(r[3]||'').toString(),role:r[8]||''};
    if (r[11]===true||r[11]==='TRUE') grp[k].presents.push(p);
    else if (r[11]===false||r[11]==='FALSE') grp[k].absents.push(p);
  });
  Object.values(grp).forEach(g=>{ if(g.presents.length+g.absents.length>0) envoyerEmailsEssaiJ1(g); });
}

// ================================================================
// PUBLICATIONS
// ================================================================
function getPublications() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = ss.getSheetByName(SHEET_PUBLICATIONS);
  if (!s||s.getLastRow()<2) return {publications:[]};
  const now = new Date();
  return {publications: s.getRange(2,1,s.getLastRow()-1,10).getValues()
    .filter(r=>r[0])
    .map(r=>({id:r[0].toString(),cat:r[1]||'actu',titre:r[2]||'',extrait:r[3]||'',
      contenu:r[4]||'',image:r[5]||'',video:r[6]||'',
      dateProgrammee:_fmtDateTime(r[7]),publiee:r[8]===true||r[8]==='TRUE',
      dateCreation:_fmtDateTime(r[9])}))
    .filter(p=>p.publiee||(p.dateProgrammee&&new Date(p.dateProgrammee)<=now))
    .sort((a,b)=>(b.dateProgrammee||'').localeCompare(a.dateProgrammee||''))};
}

function _getPublicationsAdmin() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = ss.getSheetByName(SHEET_PUBLICATIONS);
  if (!s||s.getLastRow()<2) return [];
  return s.getRange(2,1,s.getLastRow()-1,10).getValues()
    .filter(r=>r[0])
    .map(r=>({id:r[0].toString(),cat:r[1]||'actu',titre:r[2]||'',extrait:r[3]||'',
      image:r[5]||'',video:r[6]||'',dateProgrammee:_fmtDateTime(r[7]),
      publiee:r[8]===true||r[8]==='TRUE'}))
    .sort((a,b)=>(b.dateProgrammee||'').localeCompare(a.dateProgrammee||''));
}

function sauvegarderPublication(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s    = ss.getSheetByName(SHEET_PUBLICATIONS);
  if (!s) {
    s = ss.insertSheet(SHEET_PUBLICATIONS);
    const h=['ID','Catégorie','Titre','Extrait','Contenu','Image','Vidéo','Date programmée','Publiée','Date création'];
    const hr=s.getRange(1,1,1,h.length); hr.setValues([h]);
    hr.setBackground('#D4AF37').setFontColor('#000').setFontWeight('bold'); s.setFrozenRows(1);
  }
  const now = new Date(), pub = body.publiee===true||body.publiee==='true';
  if (body.id) {
    const lr = s.getLastRow();
    if (lr>=2) {
      const ids = s.getRange(2,1,lr-1,1).getValues();
      const idx = ids.findIndex(r=>r[0].toString()===body.id.toString());
      if (idx>=0) {
        s.getRange(idx+2,1,1,9).setValues([[body.id,body.cat||'actu',body.titre||'',body.extrait||'',
          body.contenu||'',body.image||'',body.video||'',
          body.dateProgrammee?new Date(body.dateProgrammee):now,pub]]);
        return {ok:true,action:'updated'};
      }
    }
  }
  const nid='pub_'+now.getTime();
  s.appendRow([nid,body.cat||'actu',body.titre||'',body.extrait||'',body.contenu||'',
    body.image||'',body.video||'',body.dateProgrammee?new Date(body.dateProgrammee):now,pub,now]);
  return {ok:true,id:nid,action:'created'};
}

function publierPublication(body) {
  const {id} = body; if (!id) throw new Error('id requis');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = _getSheet(ss,SHEET_PUBLICATIONS);
  const ids= s.getRange(2,1,s.getLastRow()-1,1).getValues();
  const idx= ids.findIndex(r=>r[0].toString()===id.toString());
  if (idx<0) throw new Error('Publication introuvable');
  s.getRange(idx+2,9).setValue(true); s.getRange(idx+2,8).setValue(new Date());
  return {ok:true};
}

function supprimerPublication(body) {
  const {id} = body; if (!id) throw new Error('id requis');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = _getSheet(ss,SHEET_PUBLICATIONS);
  const lr = s.getLastRow(); if (lr<2) return {ok:true};
  const ids= s.getRange(2,1,lr-1,1).getValues();
  const idx= ids.findIndex(r=>r[0].toString()===id.toString());
  if (idx>=0) s.deleteRow(idx+2);
  return {ok:true};
}

// ================================================================
// AGENDA EXTRA
// ================================================================
function getAgendaExtra() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = ss.getSheetByName(SHEET_AGENDA);
  if (!s||s.getLastRow()<2) return {events:[]};
  return {events: s.getRange(2,1,s.getLastRow()-1,9).getValues()
    .filter(r=>r[0]&&r[1])
    .map((r,i)=>({id:'agenda-'+i,date:_fmtDate(r[0]),cat:r[1]||'milonga',
      titre:r[2]||'',lieu:r[3]||'',heureDebut:r[4]?r[4].toString():'',
      heureFin:r[5]?r[5].toString():'',detail:r[6]||'',ctaUrl:r[7]||'',cta:r[8]||''}))
    .filter(e=>e.date>=_fmtDate(new Date()))
    .sort((a,b)=>a.date.localeCompare(b.date))};
}

// ================================================================
// HELPERS — ADMIN DATA
// ================================================================
function _getCartesAdmin() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = ss.getSheetByName(SHEET_ELEVES);
  if (!s) return [];
  const lr = s.getLastRow();
  if (lr<ELEVES_START_ROW) return [];
  return s.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues()
    .filter(r=>r[COL.ID])
    .map(r=>({
      id:r[COL.ID],nom:r[COL.NOM],niveau:r[COL.NIVEAU],
      dateAchat:_fmtDate(r[COL.DATE_ACHAT]),expiration:_fmtDate(r[COL.EXPIRATION]),
      utilises:Number(r[COL.UTILISES])||0,restants:Number(r[COL.RESTANTS])||0,
      statut:(r[COL.STATUT_CARTE]||'').toString(),
      email:(r[COL.EMAIL]||'').toString().trim(),
      statutEleve:(r[COL.STATUT_ELEVE]||STATUT.EN_ATTENTE).toString().trim(),
      source:(r[COL.SOURCE]||'manuel').toString(),
    }));
}

function _getCPAdmin() {
  const ss=SpreadsheetApp.getActiveSpreadsheet(),s=ss.getSheetByName(SHEET_CP);
  if (!s||s.getLastRow()<2) return [];
  return s.getRange(2,1,s.getLastRow()-1,17).getValues().filter(r=>r[0])
    .map((r,i)=>({id:'CP'+String(i+1).padStart(3,'0'),date:_fmtDate(r[0]),
      eleveId:r[1]||'',prenom:r[2]||'',nom:r[3]||'',email:r[4]||'',tel:r[5]||'',
      niveau:r[6]||'',prof:r[7]||'',duree:r[8]||'',lieu:r[9]||'',lieuDetail:r[10]||'',
      objectifs:r[11]||'',remarque:r[12]||'',dispos:r[13]||'',urgence:r[14]||'',
      source:r[15]||'wix',statut:r[16]||'Nouvelle'})).reverse();
}

function _getStagesAdmin() {
  const ss=SpreadsheetApp.getActiveSpreadsheet(),s=ss.getSheetByName(SHEET_STAGES);
  if (!s||s.getLastRow()<2) return {};
  const res={};
  s.getRange(2,1,s.getLastRow()-1,17).getValues().filter(r=>r[0]).forEach(r=>{
    const d=_fmtDate(r[7]); if (!d||!DATES_STAGES_LABELS[d]) return;
    if (!res[d]) res[d]={label:DATES_STAGES_LABELS[d],guideurs:[],guidees:[]};
    const p={nom:(r[1]+' '+r[2]).trim(),slots:(r[8]||'').toString().split('|').filter(Boolean),
      attente:(r[9]||'').toString().toLowerCase()==='attente'};
    if ((r[4]||'').toString().toLowerCase().includes('guideur')) res[d].guideurs.push(p);
    else res[d].guidees.push(p);
  });
  return res;
}

function _getEssaiAdmin() {
  const ss=SpreadsheetApp.getActiveSpreadsheet(),s=ss.getSheetByName(SHEET_ESSAI);
  if (!s||s.getLastRow()<2) return [];
  return s.getRange(2,1,s.getLastRow()-1,12).getValues().filter(r=>r[0])
    .map(r=>({date:_fmtDate(r[7]),ville:r[5]||'',niveau:r[6]||'',
      prenom:r[1]||'',nom:r[2]||'',email:r[3]||'',role:r[8]||'',statut:r[10]||'Inscrit',
      present:r[11]===true||r[11]==='TRUE'?true:r[11]===false||r[11]==='FALSE'?false:null}));
}

// ================================================================
// HELPERS — UTILS
// ================================================================
function _getSheet(ss,n){const s=ss.getSheetByName(n);if(!s)throw new Error('Onglet introuvable : '+n);return s;}
function _fmtDate(v){if(!v)return'';if(v instanceof Date)return Utilities.formatDate(v,'Europe/Paris','yyyy-MM-dd');const s=v.toString().trim();if(!s)return'';const d=new Date(s);return isNaN(d)?s:Utilities.formatDate(d,'Europe/Paris','yyyy-MM-dd');}
function _fmtDateTime(v){if(!v)return'';if(v instanceof Date)return v.toISOString();return v.toString().trim();}
function _fmtDateFr(s){if(!s)return'';const m=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],d=new Date(s);return d.getDate()+' '+m[d.getMonth()]+' '+d.getFullYear();}
function _getNomEleve(s,id){const lr=s.getLastRow();if(lr<ELEVES_START_ROW)return id;const d=s.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,2).getValues(),r=d.find(r=>r[0]===id);return r?r[1]:id;}
function _getPresences(s,id){const lr=s.getLastRow();if(lr<PRESENCES_START_ROW)return[];const data=s.getRange(PRESENCES_START_ROW,1,lr-PRESENCES_START_ROW+1,7).getValues(),res=[];for(const r of data){if((r[1]||'').toString().trim()!==id||(r[5]||'').toString().trim().toUpperCase()==='OUI')continue;const d=_fmtDate(r[3]);if(d)res.push({date:d,niveau:(r[4]||'').toString(),note:(r[6]||'').toString()});}return res.sort((a,b)=>b.date.localeCompare(a.date));}
function _genId(s){const lr=s.getLastRow();if(lr<ELEVES_START_ROW)return'E001';const ids=s.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,1).getValues().map(r=>r[0]).filter(v=>v&&/^E\d+$/.test(v.toString())).map(v=>parseInt(v.toString().replace('E',''),10));const mx=ids.length?Math.max(...ids):0;return'E'+String(mx+1).padStart(3,'0');}

// ================================================================
// EMAILS — WRAPPER
// ================================================================
function _emailWrap(t,c){return`<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#f0f0f0;"><div style="background:#000;border-bottom:3px solid #D4AF37;padding:18px 24px;text-align:center;"><div style="font-size:22px;font-weight:300;letter-spacing:6px;color:#D4AF37;">${NOM_ECOLE.toUpperCase()}</div><div style="font-size:10px;letter-spacing:3px;color:#888;margin-top:4px;">${t}</div></div><div style="padding:22px;">${c}</div><div style="padding:12px 24px;border-top:1px solid #222;font-size:11px;color:#444;text-align:center;line-height:1.7;">${NOM_ECOLE} · Le Regard Se Pose · <a href="${URL_SITE}" style="color:#888;">${URL_SITE}</a></div></div>`;}
function _row(k,v){return`<tr style="border-bottom:1px solid #222;"><td style="padding:8px 0;color:#888;width:38%;vertical-align:top;">${k}</td><td style="padding:8px 0;color:#e8c84a;font-weight:600;">${v}</td></tr>`;}

// ── Activation PWA ────────────────────────────────────────────
function _emailBienvenueActivation(nom,email,niveau){
  const prenom=nom.split(' ')[0]||nom;
  MailApp.sendEmail({to:email,replyTo:EMAIL_CONTACT,
    subject:NOM_ECOLE+' — Votre espace élève est activé !',
    htmlBody:_emailWrap('Votre espace élève est prêt',`
    <p style="font-size:15px;margin-bottom:16px;">Bonjour <strong style="color:#D4AF37;">${prenom}</strong> !</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:20px;">Votre espace élève <strong>Tango &amp; Vous</strong> est maintenant activé.</p>
    <div style="text-align:center;margin-bottom:22px;">
      <a href="${URL_PWA}" style="display:inline-block;background:#D4AF37;color:#000;padding:15px 32px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;">Accéder à mon espace élève</a>
    </div>
    <div style="background:#060d1a;border:2px solid #1565C0;border-radius:10px;padding:16px;margin-bottom:20px;">
      <div style="font-size:10px;color:#7aaaff;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #1a2a50;">Dans votre application</div>
      <div style="font-size:13px;color:#ccc;line-height:2;">
        🎴 Carte de 10 cours — solde en temps réel<br/>
        📅 Agenda — cours, stages, milongas, séjours<br/>
        💃 Inscription aux stages en 1 clic<br/>
        🎓 Demande de cours particulier rapide<br/>
        📰 Actualités, articles, vidéos de cours
      </div>
    </div>
    <div style="background:#0f0d00;border:2px solid #3a2d00;border-radius:10px;padding:16px;margin-bottom:20px;">
      <div style="font-size:10px;color:#D4AF37;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #3a2d00;">Comment se connecter</div>
      <div style="font-size:13px;color:#ccc;line-height:2;">
        <strong style="color:#D4AF37;">1.</strong> Rendez-vous sur <a href="${URL_PWA}" style="color:#D4AF37;">${URL_PWA}</a><br/>
        <strong style="color:#D4AF37;">2.</strong> Entrez votre adresse email — vous recevrez un lien de connexion<br/>
        <strong style="color:#D4AF37;">3.</strong> <strong>Copiez ce lien</strong> et ouvrez-le dans votre navigateur habituel<br/><br/>
        <span style="color:#888;font-size:12px;">⚠ Si le lien ne s'ouvre pas correctement depuis votre application email, copiez-le et collez-le manuellement dans votre navigateur. Le lien est valable 1 heure. Aucun mot de passe à retenir.</span>
      </div>
    </div>
    <div style="background:#0a0d14;border:2px solid #1565C0;border-radius:10px;padding:16px;margin-bottom:20px;">
      <div style="font-size:10px;color:#7aaaff;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #1a2a50;">Installer l'application sur votre téléphone</div>
      <div style="font-size:13px;color:#ccc;line-height:2;">
        L'application peut s'installer directement sur votre écran d'accueil, sans passer par un App Store.<br/><br/>
        <strong style="color:#7aaaff;">Sur iPhone :</strong> ouvrez le lien dans votre navigateur → icône Partager (↑) → <strong>"Sur l'écran d'accueil"</strong><br/>
        <strong style="color:#7aaaff;">Sur Android :</strong> ouvrez le lien dans Chrome → menu (⋮) → <strong>"Ajouter à l'écran d'accueil"</strong><br/><br/>
        <span style="color:#888;font-size:12px;">Vous pouvez aussi simplement utiliser l'application depuis votre navigateur sans l'installer.</span>
      </div>
    </div>
    <div style="text-align:center;margin-top:22px;font-size:15px;color:#D4AF37;letter-spacing:2px;">À très bientôt sur la piste !<br/><strong>Florencia &amp; Jérémy</strong></div>`)});
}

// ── Notification admin — nouvel élève en attente ──────────────
function _notifNouvelEleve(b){
  const src={'essai':'Cours d\'essai','inscription':'Inscription cours','stage':'Stage','cours_particulier':'Cours particulier','manuel':'Manuel'}[b.source]||b.source;
  const corps=_emailWrap('Nouveau profil en attente',`
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:14px;">Un nouveau profil a été créé automatiquement.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${_row('Nom',b.nom)}${_row('Email',`<a href="mailto:${b.email}" style="color:#D4AF37;">${b.email}</a>`)}
      ${_row('Niveau',b.niveau||'—')}${_row('Source',src)}
      ${_row('Statut','<strong style="color:#ffaa44;">En attente</strong>')}
    </table>
    <div style="margin-top:14px;padding:10px;background:#0f0d00;border:1px solid #3a2d00;border-radius:8px;font-size:12px;color:#888;">
      → Dashboard admin → onglet Élèves → section "En attente" → Activer
    </div>`);
  ADMIN_EMAILS.forEach(a=>{try{MailApp.sendEmail({to:a,subject:NOM_ECOLE+' — Nouveau profil : '+b.nom,htmlBody:corps});}catch(e){}});
}

// ── Cours particuliers ────────────────────────────────────────
function _notifCP(b,ts){
  const src=b.source==='pwa'?'📱 PWA':'🌐 Wix';
  const urg={'urgent':'🔴 Urgent','1mois':'🟡 Dans le mois','flexible':'🟢 Flexible','mariage':'💍 Date fixe'}[b.urgence]||b.urgence||'—';
  MailApp.sendEmail({to:EMAIL_CONTACT,subject:'🎯 Cours particulier — '+b.prenom+' '+b.nom,
    htmlBody:_emailWrap('Nouvelle demande',`<p style="font-size:12px;color:#888;margin-bottom:12px;">${src} · ${ts}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${_row('Élève',b.prenom+' '+b.nom)}${_row('Email',`<a href="mailto:${b.email}" style="color:#D4AF37;">${b.email}</a>`)}
      ${_row('Téléphone',`<a href="tel:${b.tel}" style="color:#D4AF37;">${b.tel}</a>`)}
      ${_row('Professeur',b.prof)}${_row('Durée',b.duree)}
      ${_row('Lieu',b.lieu+(b.lieuDetail?' ('+b.lieuDetail+')':''))}
      ${_row('Objectif(s)',b.objectifs)}${_row('Délai',urg)}
      ${b.remarque?_row('Remarque',b.remarque):''}
    </table>`)});
}

function _confirmCP(b){
  if (!b.email) return;
  MailApp.sendEmail({to:b.email,replyTo:EMAIL_CONTACT,
    subject:NOM_ECOLE+' — Demande de cours particulier reçue',
    htmlBody:_emailWrap('Confirmation',`
    <p style="font-size:15px;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${b.prenom}</strong>,</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:16px;">Merci — nous vous recontacterons rapidement.</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${_row('Professeur',b.prof)}${_row('Durée',b.duree)}
      ${_row('Lieu',b.lieu+(b.lieuDetail?' ('+b.lieuDetail+')':''))}
      ${_row('Objectif(s)',b.objectifs)}
    </table>
    <p style="font-size:12px;color:#888;margin-top:14px;">Joignez-nous sur <a href="tel:+33661727998" style="color:#D4AF37;">06 61 72 79 98</a> ou <a href="mailto:${EMAIL_CONTACT}" style="color:#D4AF37;">${EMAIL_CONTACT}</a>.</p>
    <div style="text-align:center;margin-top:20px;color:#D4AF37;">À très bientôt !<br/><strong>Florencia &amp; Jérémy</strong></div>`)});
}

// ── Stages ────────────────────────────────────────────────────
function _confirmStage(b){
  if (!b.email) return;
  const isAtt=b.typeConfirmation==='attente';
  const dates=(b.inscriptionsParDate||[]).map(d=>`<div style="background:#0f0d00;border:1px solid #3a2d00;border-radius:8px;padding:12px;margin-bottom:8px;"><strong style="color:#D4AF37;">📅 ${d.dateLabel}</strong><br/><span style="color:#e8c84a;">À régler sur place : ${d.prixInscrit+(d.prixPartenaire||0)} €</span></div>`).join('');
  MailApp.sendEmail({to:b.email,replyTo:EMAIL_CONTACT,
    subject:NOM_ECOLE+(isAtt?' — Demande de stage reçue':' — Stage confirmé !'),
    htmlBody:_emailWrap(isAtt?'Liste d\'attente':'Inscription confirmée',`
    <p style="font-size:15px;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${b.prenom}</strong>,</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:14px;">${isAtt?'Demande en liste d\'attente — confirmation dès que possible.':'Vos inscriptions sont confirmées.'}</p>
    ${dates}
    <div style="background:#0f0d00;border:1px solid #3a2d00;border-radius:8px;padding:12px;margin-top:8px;font-size:13px;color:#a08050;">📍 <strong style="color:#D4AF37;">Centre Kim Kan</strong> — 64 rue Orfila, M° Gambetta · 💵 Paiement sur place</div>
    <div style="text-align:center;margin-top:18px;color:#D4AF37;">À très bientôt !<br/><strong>Florencia &amp; Jérémy</strong></div>`)});
}

function _tplConfirmAttenteStage(prenom,date){
  return _emailWrap('Stage confirmé !',`
    <p style="font-size:15px;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${prenom}</strong>,</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:14px;">Votre inscription au stage du <strong style="color:#D4AF37;">${DATES_STAGES_LABELS[date]||date}</strong> est confirmée !</p>
    <div style="background:#0f0d00;border:1px solid #3a2d00;border-radius:8px;padding:12px;font-size:13px;color:#a08050;">📍 <strong style="color:#D4AF37;">Centre Kim Kan</strong> — 64 rue Orfila, M° Gambetta · 💵 Paiement sur place</div>
    <div style="text-align:center;margin-top:18px;color:#D4AF37;">À très bientôt !<br/><strong>Florencia &amp; Jérémy</strong></div>`);
}

// ── Cours d'essai ─────────────────────────────────────────────
function _tplEssaiPresent(p,date,niv,ville,ui){
  return _emailWrap('Suite à votre cours d\'essai',`
    <p style="font-size:15px;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${p.prenom}</strong>,</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:14px;">Plaisir de vous avoir accueilli pour votre cours d'essai <strong>${niv}</strong> — ${ville}.</p>
    <div style="background:#0f0d00;border:2px solid #3a2d00;border-radius:10px;padding:16px;margin-bottom:16px;font-size:13px;color:#ccc;line-height:2;">
      <strong style="color:#D4AF37;">1.</strong> Remplir le formulaire d'inscription<br/>
      <strong style="color:#D4AF37;">2.</strong> Choisir ville, niveau, formule<br/>
      <strong style="color:#D4AF37;">3.</strong> Finaliser sur AssoConnect<br/><br/>
      Forfait Paris : 490€ · Vincennes : 435€ · Carte 10 cours : 170€
    </div>
    <a href="${ui}" style="display:block;background:#D4AF37;color:#000;text-align:center;padding:14px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;margin-bottom:16px;">S'inscrire aux cours réguliers</a>
    <div style="text-align:center;color:#D4AF37;">À très bientôt !<br/><strong>Florencia &amp; Jérémy</strong></div>`);
}

function _tplEssaiAbsent(p,date,niv,ville,ue){
  return _emailWrap('Votre cours d\'essai du '+date,`
    <p style="font-size:15px;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${p.prenom}</strong>,</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:14px;">Nous vous attendions pour votre cours d'essai <strong>${niv}</strong> — ${ville}, mais vous n'avez pas pu venir. Pas d'inquiétude !</p>
    <a href="${ue}" style="display:block;background:#D4AF37;color:#000;text-align:center;padding:14px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;margin-bottom:16px;">S'inscrire à un cours d'essai</a>
    <div style="text-align:center;color:#D4AF37;">À très bientôt !<br/><strong>Florencia &amp; Jérémy</strong></div>`);
}
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
//    • declencheurEmailsEssai      → Quotidien 9h-10h
//    • declencheurNouvelleS        → Annuel · 1er septembre · 8h-9h
//    • declencheurCartesFinSaison  → Quotidien · 8h-9h (actif toute l'année)
// ================================================================

// ── Onglets Google Sheets ──────────────────────────────────────
const SHEET_ELEVES       = 'Élèves';
const SHEET_PRESENCES    = 'Présences';
const SHEET_CP           = 'Cours Particuliers';
const SHEET_STAGES       = 'Stages';
const SHEET_ESSAI        = 'Inscriptions';
const SHEET_PUBLICATIONS  = 'Publications';
const SHEET_AGENDA        = 'Agenda';
const SHEET_COURS_TANGO   = 'Cours Tango';     // inscriptions régulières
const SHEET_AGENDA_MODIFS = 'Agenda Modifs';   // modifications/annulations d'occurrences

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

const CAPACITE_ESSAI    = 16;  // max inscriptions par créneau d'essai
const LIEUX_ESSAI_LABEL = {paris:'Paris — Centre Kim Kan',vincennes:'Vincennes'};

// ── Dernier cours Paris de la saison (à mettre à jour chaque année) ──
// J+1 de cette date → email cartes restantes envoyé automatiquement
const DERNIER_COURS_PARIS_JUIN = '2026-06-26'; // vendredi 26 juin 2026

// ================================================================
// GET
// ================================================================
function doGet(e) {
  const p = e.parameter, a = (p.action||'').trim();
  // ── Confirmation de présence via lien email (retourne une page HTML) ──────
  if (a === 'confirmerPresenceEssai') {
    try { confirmerPresenceEssai({email:p.email||'',date:p.date||''}); } catch(err) {}
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>'
      +'<meta name="viewport" content="width=device-width,initial-scale=1"/>'
      +'<title>Présence confirmée — Tango &amp; Vous</title>'
      +'<style>body{margin:0;font-family:Arial,sans-serif;background:#0a0a0a;color:#f0f0f0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;}'
      +'.box{max-width:360px;padding:40px 24px;}'
      +'.logo{font-size:22px;letter-spacing:6px;color:#D4AF37;font-weight:300;margin-bottom:24px;}'
      +'.check{font-size:56px;margin-bottom:16px;}'
      +'h2{color:#81c784;margin:0 0 14px;}'
      +'p{color:#aaa;line-height:1.8;font-size:14px;margin:0 0 10px;}'
      +'.sig{color:#666;font-size:12px;margin-top:24px;}'
      +'</style></head><body>'
      +'<div class="box">'
      +'<div class="logo">TANGO &amp; VOUS</div>'
      +'<div class="check">✓</div>'
      +'<h2>Présence confirmée !</h2>'
      +'<p>Merci, votre présence au cours d\'essai est bien enregistrée.</p>'
      +'<p>À très bientôt sur la piste !</p>'
      +'<p class="sig">Marc &amp; Eva — Tango &amp; Vous</p>'
      +'</div></body></html>'
    );
  }
  const out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
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
      case 'pointageManuel':              r = ajouterPresenceManuelle(b); break;
      // ── Cours d'essai ────────────────────────────────────────
      case 'inscriptionEssai':            r = traiterInscriptionEssai(b); break;
      case 'pointerEssai':                r = pointerEssaiGs(b); break;
      case 'envoyerEmailsEssaiJ1':        r = envoyerEmailsEssaiJ1(b); break;
      case 'validerGuideeEssai':          r = validerGuideeEssai(b); break;
      case 'confirmerPresenceEssai':      r = confirmerPresenceEssai(b); break;
      case 'reservationCP':               r = traiterReservationCP(b); break;
      case 'updateStatutCP':              r = updateStatutCP(b); break;
      case 'inscriptionStage':            r = traiterInscriptionStage(b); break;
      case 'validerAttente':              r = validerAttenteStage(b); break;
      case 'creerEleve':                  r = creerEleve(b); break;
      case 'activerEleve':                r = activerEleve(b); break;
      case 'desactiverEleve':             r = desactiverEleve(b); break;
      case 'sauvegarderPublication':      r = sauvegarderPublication(b); break;
      case 'publierPublication':          r = publierPublication(b); break;
      case 'supprimerPublication':        r = supprimerPublication(b); break;
      // ── Cours Tango (inscriptions régulières) ─────────────────
      case 'inscriptionCoursRegulier':    r = traiterInscriptionCoursRegulier(b); break;
      case 'changerStatutCoursTango':     r = changerStatutCoursTangoGs(b); break;
      case 'validerPaiementCoursTango':   r = validerPaiementCoursTangoGs(b); break;
      // ── Cartes de 10 cours ────────────────────────────────────
      case 'renouvelerCarte':             r = renouvelerCarteGs(b); break;
      case 'reporterCarte':               r = reporterCarteGs(b); break;
      case 'toggleCartePaye':             r = toggleCartePaye(b); break;
      // ── Agenda modifications ───────────────────────────────────
      case 'sauverModifAgenda':           r = sauverModifAgendaGs(b); break;
      // ── Pointage QR code (depuis pointer.html) ────────────────
      case 'pointageQR':                  r = ajouterPresenceManuelle(b); break;
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
      const statutCarte = (r[COL.STATUT_CARTE]||'').toString();
      // Garder les élèves avec une carte reportée sur la nouvelle saison : réinitialiser statut carte → Active
      if (statutCarte.startsWith('Report:')) {
        sheet.getRange(i+ELEVES_START_ROW, COL.STATUT_CARTE+1).setValue('Active');
        return; // rester Actif, carte repart de zéro côté expiration
      }
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
// DÉCLENCHEUR — Cartes non terminées fin de saison
// ================================================================
// Se déclenche 2 fois par an (quotidien 8h-9h, actif les bons jours) :
//   • J+1 après DERNIER_COURS_PARIS_JUIN : email à tous les élèves actifs
//     ayant des cours restants sur leur carte non expirée
//   • 25 août : même email aux élèves qui n'ont toujours pas
//     soumis de pré-inscription depuis la fin des cours
function declencheurCartesFinSaison() {
  const today = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');

  // Calculer J+1 après le dernier cours Paris juin
  const dernierCoursDate = new Date(DERNIER_COURS_PARIS_JUIN + 'T00:00:00');
  dernierCoursDate.setDate(dernierCoursDate.getDate() + 1);
  const jourJ1 = Utilities.formatDate(dernierCoursDate, 'Europe/Paris', 'yyyy-MM-dd');

  const isJ1    = (today === jourJ1);
  const isAug25 = today.slice(5) === '08-25';
  if (!isJ1 && !isAug25) return;

  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const se   = _getSheet(ss, SHEET_ELEVES);
  const lr   = se.getLastRow();
  if (lr < ELEVES_START_ROW) return;

  const data = se.getRange(ELEVES_START_ROW, 1, lr - ELEVES_START_ROW + 1, 13).getValues();
  const now  = new Date(); now.setHours(0, 0, 0, 0);

  // Si 25 août : construire l'ensemble des emails ayant déjà pré-inscrit
  // (toute entrée dans SHEET_COURS_TANGO soumise après DERNIER_COURS_PARIS_JUIN)
  const emailsPreInscrits = new Set();
  if (isAug25) {
    const sCT = ss.getSheetByName(SHEET_COURS_TANGO);
    if (sCT && sCT.getLastRow() >= 2) {
      sCT.getRange(2, 1, sCT.getLastRow() - 1, 16).getValues()
        .filter(r => r[0] && r[15])
        .forEach(r => {
          const di = _fmtDate(r[15]);
          if (di > DERNIER_COURS_PARIS_JUIN && (r[9]||'').toLowerCase() !== 'annulé') {
            emailsPreInscrits.add((r[3]||'').toString().toLowerCase().trim());
          }
        });
    }
  }

  const urlInscription = URL_SITE + '/l-ecole-de-tango-argentin/demande-inscription-cours-tango';
  let sent = 0;

  data.forEach(r => {
    if ((r[COL.STATUT_ELEVE]||'').toString().trim() !== STATUT.ACTIF) return;
    const restants = Number(r[COL.RESTANTS]) || 0;
    if (restants <= 0) return;
    if ((r[COL.STATUT_CARTE]||'').toString().trim() === 'Expirée') return;
    // Vérifier que la carte n'est pas expirée
    const expVal = r[COL.EXPIRATION];
    if (expVal) {
      const expDate = new Date(_fmtDate(expVal) + 'T00:00:00');
      if (expDate < now) return;
    }
    const email = (r[COL.EMAIL]||'').toString().toLowerCase().trim();
    if (!email) return;
    if (isAug25 && emailsPreInscrits.has(email)) return;
    // Ne pas relancer les cartes déjà reportées (statut Report:...)
    if ((r[COL.STATUT_CARTE]||'').toString().startsWith('Report:')) return;

    const prenom  = (r[COL.NOM]||'').toString().split(' ')[0];
    const expAff  = expVal ? _fmtDateFr(_fmtDate(expVal)) : 'non commencée (valable dès votre 1er cours)';
    try {
      _emailCarteFinSaison(prenom, email, restants, expAff, urlInscription, isJ1);
      sent++;
    } catch(e) {}
  });

  if (sent > 0) {
    const tag = isJ1 ? 'fin de saison J+1' : '25 août';
    ADMIN_EMAILS.forEach(a => {
      try {
        MailApp.sendEmail({
          to: a,
          subject: `${NOM_ECOLE} — Emails cartes restantes (${tag}) : ${sent} envoyé(s)`,
          body: `${sent} email(s) envoyé(s) le ${today} via le déclencheur "${tag}".\n\nCes élèves ont encore des cours sur leur carte et ont été invités à se pré-inscrire pour la saison suivante.`
        });
      } catch(e) {}
    });
  }
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
    coursTango:        _getCoursTangoAdmin(),
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
  const {eleveId,date,niveau,note,nbCours} = body;
  if (!eleveId||!date||!niveau) throw new Error('eleveId, date et niveau requis');
  const n = Math.min(2, Math.max(1, parseInt(nbCours)||1));

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const sp  = _getSheet(ss, SHEET_PRESENCES);
  const se  = _getSheet(ss, SHEET_ELEVES);
  const nom = _getNomEleve(se, eleveId);

  // Anti-doublon : déjà combien de cours pointés ce jour pour cet élève ?
  const dejaPointe = _countPresencesRaw(sp, eleveId, date);
  if (dejaPointe >= n) {
    return {ok:true, skipped:true, message:`Déjà ${dejaPointe} cours pointé(s) le ${date}`};
  }
  const aAjouter = n - dejaPointe;

  // 1ère présence de la saison → E04
  const presencesExistantes = _getPresences(sp, eleveId);
  const estPremierCours     = presencesExistantes.length === 0;

  const hora = Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd HH:mm');
  for (let i=0; i<aAjouter; i++) {
    const nr = Math.max(sp.getLastRow(), PRESENCES_START_ROW-1)+1;
    sp.getRange(nr,1).setValue(hora);   sp.getRange(nr,2).setValue(eleveId);
    sp.getRange(nr,3).setValue(nom);    sp.getRange(nr,4).setValue(new Date(date));
    sp.getRange(nr,4).setNumberFormat('dd/MM/yyyy');
    sp.getRange(nr,5).setValue(niveau);
    sp.getRange(nr,6).setFormula(`=IF(B${nr}="","",IF(COUNTIFS($B$${PRESENCES_START_ROW}:B${nr},B${nr},$D$${PRESENCES_START_ROW}:D${nr},D${nr},$E$${PRESENCES_START_ROW}:E${nr},E${nr})>1,"OUI","NON"))`);
    sp.getRange(nr,7).setValue(note||(n>1?`Cours ${dejaPointe+i+1}/${n}`:'Ajout'));
  }

  // Mettre à jour UTILISES / RESTANTS dans SHEET_ELEVES
  const lr = se.getLastRow();
  if (lr >= ELEVES_START_ROW) {
    const data = se.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues();
    const idx  = data.findIndex(r => r[COL.ID]===eleveId);
    if (idx >= 0) {
      const rn      = idx+ELEVES_START_ROW;
      const newUtil = Math.min(10, (Number(data[idx][COL.UTILISES])||0)+aAjouter);
      const newRest = Math.max(0,  (Number(data[idx][COL.RESTANTS])||0)-aAjouter);
      se.getRange(rn, COL.UTILISES+1).setValue(newUtil);
      se.getRange(rn, COL.RESTANTS+1).setValue(newRest);
      // Premier cours : activer la carte si pas encore commencée
      if (!data[idx][COL.DATE_ACHAT]||!_fmtDate(data[idx][COL.DATE_ACHAT])) {
        se.getRange(rn, COL.DATE_ACHAT+1).setValue(new Date(date));
        const exp = _calcExpiration(date);
        if (exp) se.getRange(rn, COL.EXPIRATION+1).setValue(new Date(exp));
        if (!(data[idx][COL.STATUT_CARTE]||'').toString().trim())
          se.getRange(rn, COL.STATUT_CARTE+1).setValue('Active');
      }
    }
  }

  // E04 — bienvenue 1ère séance
  if (estPremierCours) {
    const lr2  = se.getLastRow();
    if (lr2 >= ELEVES_START_ROW) {
      const d2   = se.getRange(ELEVES_START_ROW,1,lr2-ELEVES_START_ROW+1,13).getValues();
      const elRow = d2.find(r => r[COL.ID]===eleveId);
      if (elRow) {
        const email = (elRow[COL.EMAIL]||'').toString().trim();
        if (email) try { _emailBienvenuePremiereCours(nom,email,'',niveau); } catch(err){}
      }
    }
  }
  return {ok:true, added:aAjouter, skipped:dejaPointe||undefined,
    message:`${aAjouter} présence(s) ajoutée(s) pour ${nom} le ${date}`};
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

// ── Valider un élève de la liste d'attente d'un essai ────────
// Passe le statut à 'confirme', marque presenceConfirmee, envoie E15
function validerGuideeEssai(body) {
  const {email, date} = body;
  if (!email || !date) throw new Error('email et date requis');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = _getSheet(ss, SHEET_ESSAI);
  const lr = s.getLastRow();
  if (lr < 2) return {ok:true};
  const data = s.getRange(2, 1, lr - 1, 13).getValues();
  let prenom = '', horaire = '', lieu = '', niveau = '', dateLbl = '';
  data.forEach((r, i) => {
    const em = (r[3]||'').toString().trim().toLowerCase();
    if (em === email.toLowerCase() && _fmtDate(r[7]) === date) {
      s.getRange(i + 2, 11).setValue('confirme');   // col 11 = statut
      s.getRange(i + 2, 13).setValue(true);          // col 13 = presenceConfirmee
      if (!prenom) {
        prenom  = r[1] || '';
        horaire = r[9] || ''; // niveauEleve stocké en col 10, horaire absent ici
        lieu    = LIEUX_ESSAI_LABEL[r[5]||''] || (r[5]||'');
        niveau  = r[6] || '';
        dateLbl = _fmtDateFrLong(date);
      }
    }
  });
  // Envoyer E15 si on a les données
  if (prenom && email) {
    try { _emailEssaiConfirme(prenom, email, dateLbl, horaire||niveau, lieu); } catch(e) {}
  }
  return {ok:true};
}

// ── Confirmer sa présence via le bouton dans l'email E15 ─────
function confirmerPresenceEssai(body) {
  const {email, date} = body;
  if (!email || !date) return {ok:false, error:'email et date requis'};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = _getSheet(ss, SHEET_ESSAI);
  const lr = s.getLastRow();
  if (lr < 2) return {ok:true};
  const data = s.getRange(2, 1, lr - 1, 8).getValues();
  data.forEach((r, i) => {
    if ((r[3]||'').toString().trim().toLowerCase() === email.toLowerCase() && _fmtDate(r[7]) === date) {
      s.getRange(i + 2, 13).setValue(true); // col 13 = presenceConfirmee
    }
  });
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

// ── Inscription cours d'essai (depuis cours-essai.html) ──────
function traiterInscriptionEssai(body) {
  const {prenom,nom,email,tel,lieu,date,niveau,horaire,role,niveauEleve,
         avecPart,partPrenom,partNom,partEmail,partRole,remarque} = body;
  if (!prenom||!nom||!email||!date) throw new Error('prenom, nom, email et date requis');

  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const s   = _getSheet(ss, SHEET_ESSAI);
  const now = Utilities.formatDate(new Date(),'Europe/Paris','dd/MM/yyyy HH:mm');

  // Normaliser date → yyyy-MM-dd
  let dateNorm = date;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const parts = date.split('/'); dateNorm = parts[2]+'-'+parts[1]+'-'+parts[0];
  }

  // Vérifier capacité du créneau
  const lr = s.getLastRow();
  let inscritCount = 0;
  if (lr >= 2) {
    s.getRange(2,1,lr-1,11).getValues().forEach(r => {
      if (_fmtDate(r[7])===dateNorm && (r[5]||'')===(lieu||'') &&
          (r[6]||'')===(niveau||'') && (r[10]||'inscrit').toLowerCase()==='inscrit')
        inscritCount++;
    });
  }
  const enAttente = inscritCount >= CAPACITE_ESSAI;
  const statut    = enAttente ? 'attente' : 'inscrit';

  // Sauvegarder inscription principale
  s.appendRow([now,prenom||'',nom||'',email||'',tel||'',lieu||'',niveau||'',
    dateNorm,role||'',niveauEleve||'',statut,'']);

  // Sauvegarder partenaire
  if ((avecPart||'')==='avec' && partEmail) {
    s.appendRow([now,partPrenom||'',partNom||'',partEmail,'',lieu||'',niveau||'',
      dateNorm,partRole||'','',statut,'']);
  }

  // Étiquettes affichage
  const dateLbl = _fmtDateFrLong(dateNorm);
  const lieuLbl = LIEUX_ESSAI_LABEL[lieu||''] || (lieu||'');
  const horLbl  = horaire||'';

  // Emails élève (et partenaire)
  const fn = enAttente ? _emailEssaiAttente : _emailEssaiConfirme;
  try { fn(prenom, email, dateLbl, horLbl, lieuLbl); } catch(e) {}
  if ((avecPart||'')==='avec' && partEmail) {
    try { fn(partPrenom||prenom, partEmail, dateLbl, horLbl, lieuLbl); } catch(e) {}
  }

  // Notification admin
  try {
    const tag = enAttente ? ' [LISTE D\'ATTENTE]' : '';
    ADMIN_EMAILS.forEach(a => MailApp.sendEmail({
      to:a, subject:NOM_ECOLE+' — Essai'+tag+' : '+prenom+' '+nom,
      htmlBody:_emailWrap('Nouvel essai'+tag,`
        <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:14px;">
          ${enAttente?'<strong style="color:#ffaa44;">⚠ Liste d\'attente ('+inscritCount+'/'+CAPACITE_ESSAI+')</strong><br/>':''}
          Demande de <strong style="color:#D4AF37;">${prenom} ${nom}</strong>.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${_row('Email','<a href="mailto:'+email+'" style="color:#D4AF37;">'+email+'</a>')}
          ${tel?_row('Tél','<a href="tel:'+tel+'" style="color:#D4AF37;">'+tel+'</a>'):''}
          ${_row('Date',dateLbl)}${_row('Horaire',horLbl)}${_row('Lieu',lieuLbl)}
          ${_row('Niveau',niveau||'—')}${_row('Rôle',role||'—')}
          ${(avecPart==='avec'&&partEmail)?_row('Partenaire',(partPrenom||'')+' '+(partNom||'')+' ('+partEmail+')'):''}
          ${remarque?_row('Remarque',remarque):''}
        </table>`)
    }));
  } catch(e) {}

  // Créer profil élève
  try { creerEleve({nom:prenom+' '+nom,email,niveau:niveauEleve||niveau||'',
    source:'cours_essai',notes:'Essai du '+dateNorm}); } catch(e) {}

  return {ok:true, statut};
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
  // Calculer la saison courante (sept–juin)
  const now = new Date();
  const currentSaison = (now.getMonth()>=8?now.getFullYear():now.getFullYear()-1)+'-'
                       +(now.getMonth()>=8?now.getFullYear()+1:now.getFullYear());
  return s.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues()
    .filter(r=>r[COL.ID])
    .map(r=>{
      const statutCarte = (r[COL.STATUT_CARTE]||'').toString();
      const isReport    = statutCarte.startsWith('Report:');
      const saisonReport= isReport ? statutCarte.replace('Report:','') : '';
      return {
        id:r[COL.ID],nom:r[COL.NOM],niveau:r[COL.NIVEAU],
        dateAchat:_fmtDate(r[COL.DATE_ACHAT]),expiration:_fmtDate(r[COL.EXPIRATION]),
        utilises:Number(r[COL.UTILISES])||0,restants:Number(r[COL.RESTANTS])||0,
        statut:isReport?'Active':statutCarte,  // masquer 'Report:...' en 'Active' pour l'affichage
        email:(r[COL.EMAIL]||'').toString().trim(),
        statutEleve:(r[COL.STATUT_ELEVE]||STATUT.EN_ATTENTE).toString().trim(),
        source:(r[COL.SOURCE]||'manuel').toString(),
        isReport, saisonOrigine: isReport ? currentSaison : '',
        saison: isReport ? saisonReport : currentSaison, // pour filtrage admin par saison
      };
    });
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
  const ncols = Math.min(13, s.getLastColumn());
  return s.getRange(2,1,s.getLastRow()-1,ncols).getValues().filter(r=>r[0])
    .map(r=>({date:_fmtDate(r[7]),ville:r[5]||'',niveau:r[6]||'',
      prenom:r[1]||'',nom:r[2]||'',email:r[3]||'',role:r[8]||'',statut:r[10]||'Inscrit',
      present:r[11]===true||r[11]==='TRUE'?true:r[11]===false||r[11]==='FALSE'?false:null,
      presenceConfirmee:r[12]===true||r[12]==='TRUE'}));
}

// ================================================================
// HELPERS — UTILS
// ================================================================
function _getSheet(ss,n){const s=ss.getSheetByName(n);if(!s)throw new Error('Onglet introuvable : '+n);return s;}
function _fmtDate(v){if(!v)return'';if(v instanceof Date)return Utilities.formatDate(v,'Europe/Paris','yyyy-MM-dd');const s=v.toString().trim();if(!s)return'';const d=new Date(s);return isNaN(d)?s:Utilities.formatDate(d,'Europe/Paris','yyyy-MM-dd');}
function _fmtDateTime(v){if(!v)return'';if(v instanceof Date)return v.toISOString();return v.toString().trim();}
function _fmtDateFr(s){if(!s)return'';const m=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],d=new Date(s);return d.getDate()+' '+m[d.getMonth()]+' '+d.getFullYear();}
function _fmtDateFrLong(s){if(!s)return'';const j=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],m=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],d=new Date(s);return j[d.getDay()]+' '+d.getDate()+' '+m[d.getMonth()]+' '+d.getFullYear();}
function _getNomEleve(s,id){const lr=s.getLastRow();if(lr<ELEVES_START_ROW)return id;const d=s.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,2).getValues(),r=d.find(r=>r[0]===id);return r?r[1]:id;}
function _getPresences(s,id){const lr=s.getLastRow();if(lr<PRESENCES_START_ROW)return[];const data=s.getRange(PRESENCES_START_ROW,1,lr-PRESENCES_START_ROW+1,7).getValues(),res=[];for(const r of data){if((r[1]||'').toString().trim()!==id||(r[5]||'').toString().trim().toUpperCase()==='OUI')continue;const d=_fmtDate(r[3]);if(d)res.push({date:d,niveau:(r[4]||'').toString(),note:(r[6]||'').toString()});}return res.sort((a,b)=>b.date.localeCompare(a.date));}
// Compte TOUTES les lignes (sans filtrer les doublons) pour un élève + date
function _countPresencesRaw(s,id,date){const lr=s.getLastRow();if(lr<PRESENCES_START_ROW)return 0;return s.getRange(PRESENCES_START_ROW,1,lr-PRESENCES_START_ROW+1,4).getValues().filter(r=>(r[1]||'').toString().trim()===id&&_fmtDate(r[3])===date).length;}
// Expiration carte = date de début + 3 mois (hors vacances scolaires)
function _calcExpiration(dateDebut){if(!dateDebut)return'';const d=new Date(dateDebut+'T00:00:00');d.setMonth(d.getMonth()+3);return Utilities.formatDate(d,'Europe/Paris','yyyy-MM-dd');}
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

// E15 — Confirmation inscription cours d'essai
function _emailEssaiConfirme(prenom, email, date, horaire, lieu) {
  const jourSem = (date||'').split(' ')[0]; // ex: "jeudi"
  // Lien de confirmation de présence (1 clic depuis l'email)
  let confirmUrl = '';
  try {
    const baseUrl = ScriptApp.getService().getUrl();
    // date raw format yyyy-MM-dd pour l'URL (on prend la date telle que passée si c'est une date courte)
    const dateParam = date.replace(/[^0-9\-]/g,'').slice(0,10) || date;
    confirmUrl = baseUrl + '?action=confirmerPresenceEssai&email=' + encodeURIComponent(email) + '&date=' + dateParam;
  } catch(e) {}
  const btnConfirm = confirmUrl
    ? `<div style="text-align:center;margin:20px 0;">
        <a href="${confirmUrl}" style="display:inline-block;background:#D4AF37;color:#000;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.5px;">
          ✓ Je confirme ma présence
        </a>
        <p style="font-size:11px;color:#666;margin-top:8px;">Cliquez pour confirmer que vous serez bien présent(e).</p>
       </div>`
    : '';
  MailApp.sendEmail({to:email, replyTo:EMAIL_CONTACT,
    subject: NOM_ECOLE+' — Cours d\'essai confirmé — à '+jourSem+' !',
    htmlBody: _emailWrap('Cours d\'essai confirmé',`
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${prenom}</strong> !</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:18px;">
      Nous sommes ravis de vous accueillir pour votre premier cours de tango argentin !
    </p>
    <div style="background:#0f0d00;border:2px solid #3a2d00;border-radius:10px;padding:16px;margin-bottom:18px;">
      <div style="font-size:10px;color:#D4AF37;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #3a2d00;">Votre cours d'essai</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${_row('Date',date||'—')}
        ${_row('Heure',horaire||'—')}
        ${_row('Lieu',lieu||'—')}
        ${_row('Durée','1h30')}
        ${_row('Tarif','<span style="color:#81c784;font-weight:700;">Essai offert</span>')}
      </table>
    </div>
    ${btnConfirm}
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#888;margin-bottom:12px;">Ce qu'il faut savoir</div>
    <div style="font-size:13px;color:#ccc;line-height:2.1;">
      ✓ <strong style="color:#f0f0f0;">Arrivez 5 minutes en avance</strong> — pour vous changer et commencer détendu(e).<br/>
      ✓ <strong style="color:#f0f0f0;">Chaussures à semelles lisses</strong> — cuir ou daim idéalement. Des chaussettes conviennent pour un premier cours.<br/>
      ✓ <strong style="color:#f0f0f0;">Tenue confortable</strong> — permettant de bouger librement.<br/>
      ✓ <strong style="color:#f0f0f0;">Pas de partenaire fixe</strong> — nous pratiquons la rotation. Venez seul(e) ou à deux.<br/>
      ✓ <strong style="color:#f0f0f0;">Pas d'expérience requise</strong> — le cours débutant part de zéro.
    </div>
    <hr style="border:none;border-top:1px solid #2a2a2a;margin:18px 0;"/>
    <p style="font-size:12px;color:#666;line-height:1.8;">
      Une question ? Répondez à cet email ou écrivez à <a href="mailto:${EMAIL_CONTACT}" style="color:#D4AF37;">${EMAIL_CONTACT}</a>.<br/>
      Empêchement de dernière minute ? Merci de nous prévenir.
    </p>
    <div style="text-align:center;margin-top:20px;color:#D4AF37;">À très bientôt sur la piste !<br/><strong>Marc &amp; Eva</strong></div>`)});
}

// E15b — Liste d'attente cours d'essai (créneau complet)
function _emailEssaiAttente(prenom, email, date, horaire, lieu) {
  MailApp.sendEmail({to:email, replyTo:EMAIL_CONTACT,
    subject: NOM_ECOLE+' — Cours d\'essai : vous êtes sur liste d\'attente',
    htmlBody: _emailWrap('Liste d\'attente — Cours d\'essai',`
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${prenom}</strong>,</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:18px;">
      Le créneau que vous avez choisi est complet. Votre demande est bien enregistrée en liste d'attente —
      nous vous contacterons dès qu'une place se libère ou pour vous proposer un autre créneau.
    </p>
    <div style="background:#0f0d00;border:2px solid #3a2d00;border-radius:10px;padding:16px;margin-bottom:18px;">
      <div style="font-size:10px;color:#D4AF37;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #3a2d00;">Créneau demandé</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${_row('Date',date||'—')}
        ${_row('Heure',horaire||'—')}
        ${_row('Lieu',lieu||'—')}
      </table>
    </div>
    <p style="font-size:12px;color:#888;line-height:1.8;">
      Des questions ? Contactez-nous à <a href="mailto:${EMAIL_CONTACT}" style="color:#D4AF37;">${EMAIL_CONTACT}</a> — nous trouverons une solution ensemble.
    </p>
    <div style="text-align:center;margin-top:20px;color:#D4AF37;">À très bientôt !<br/><strong>Marc &amp; Eva</strong></div>`)});
}

// ================================================================
// COURS TANGO — Inscriptions régulières
// ================================================================

// ── Helpers feuille Cours Tango ──────────────────────────────
function _ensureSheetCoursTango(ss) {
  let s = ss.getSheetByName(SHEET_COURS_TANGO);
  if (!s) {
    s = ss.insertSheet(SHEET_COURS_TANGO);
    const h = ['ID','Prénom','Nom','Email','Téléphone','Rôle','Niveau','Cours','Ville',
      'Statut','Partenaire','Email Partenaire','Type','Paiement','Montant','Date Inscription','Payé'];
    const hr = s.getRange(1,1,1,h.length);
    hr.setValues([h]).setBackground('#D4AF37').setFontColor('#000').setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function _getCoursTangoAdmin() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = ss.getSheetByName(SHEET_COURS_TANGO);
  if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2,1,s.getLastRow()-1,17).getValues()
    .filter(r => r[0])
    .map(r => ({
      id:r[0], prenom:r[1], nom:r[2], email:r[3], tel:r[4],
      role:r[5], niveau:r[6], cours:r[7], ville:r[8], statut:r[9],
      partenaire:r[10], emailPartenaire:r[11], type:r[12],
      paiement:r[13], montant:Number(r[14])||0,
      dateInscription:_fmtDate(r[15]), paye:r[16]===true||r[16]==='TRUE',
    }));
}

// ── Nouvelle demande (depuis inscription-cours.html) ─────────
function traiterInscriptionCoursRegulier(body) {
  const {prenom,nom,email,tel,role,niveau,cours,ville,partenaire,emailPartenaire,type,montant} = body;
  if (!prenom||!nom||!email) throw new Error('prenom, nom, email requis');
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const s   = _ensureSheetCoursTango(ss);
  const now = Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd');
  const id  = 'CT'+Utilities.formatDate(new Date(),'Europe/Paris','yyyyMMddHHmmss');
  s.appendRow([id,prenom||'',nom||'',email||'',tel||'',role||'guidee',niveau||'',
    cours||'',ville||'paris','demande',partenaire||'',emailPartenaire||'',
    type||'carte10','',Number(montant)||170,now,false]);
  creerEleve({nom:prenom+' '+nom,email,niveau:niveau||'',source:'inscription',notes:'Via formulaire inscription cours'});
  // E01 — accusé de réception élève
  try { _emailDemandeRecue(prenom,email,cours||'',niveau||'',role||''); } catch(e) {}
  // Notif admin
  try { ADMIN_EMAILS.forEach(a=>MailApp.sendEmail({to:a,subject:NOM_ECOLE+' — Nouvelle demande : '+prenom+' '+nom,
    htmlBody:_emailWrap('Nouvelle demande inscription',`<p style="color:#ccc;font-size:13px;">Demande de <strong style="color:#D4AF37;">${prenom} ${nom}</strong> (${email}) pour <strong>${cours||niveau}</strong>.</p><p style="color:#888;font-size:12px;">Rôle : ${role} — Type : ${type}</p>`)})); } catch(e) {}
  return {ok:true,id};
}

// ── Changer statut d'une demande ──────────────────────────────
function changerStatutCoursTangoGs(body) {
  const {id,statut} = body;
  if (!id||!statut) throw new Error('id et statut requis');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s  = _ensureSheetCoursTango(ss);
  const lr = s.getLastRow();
  if (lr < 2) throw new Error('Aucune ligne');
  const data = s.getRange(2,1,lr-1,10).getValues();
  const idx  = data.findIndex(r => r[0]===id);
  if (idx < 0) throw new Error('Entrée introuvable : '+id);
  s.getRange(idx+2,10).setValue(statut);
  // E02 — email validation si statut → 'valide'
  if (statut === 'valide') {
    const r = data[idx];
    try { _emailValidation(r[1],r[3],r[7],r[6],r[8]); } catch(e) {}
  }
  return {ok:true};
}

// ── Valider paiement → inscrit ────────────────────────────────
function validerPaiementCoursTangoGs(body) {
  const {id,carte10,tel,email} = body;
  if (!id) throw new Error('id requis');
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const s   = _ensureSheetCoursTango(ss);
  const lr  = s.getLastRow();
  const data = lr >= 2 ? s.getRange(2,1,lr-1,17).getValues() : [];
  const idx  = data.findIndex(r => r[0]===id);
  if (idx < 0) throw new Error('Entrée introuvable : '+id);
  const r = data[idx];
  s.getRange(idx+2,10).setValue('inscrit');
  s.getRange(idx+2,17).setValue(true);
  if (tel) s.getRange(idx+2,5).setValue(tel);
  const emailEff = email || r[3];
  if (email && email !== r[3]) s.getRange(idx+2,4).setValue(email);
  // Créer carte de 10 si demandé
  if (carte10 === 'oui') {
    const now = Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd');
    const se  = _getSheet(ss, SHEET_ELEVES);
    const lre = se.getLastRow();
    const elData = lre >= ELEVES_START_ROW ? se.getRange(ELEVES_START_ROW,1,lre-ELEVES_START_ROW+1,13).getValues() : [];
    const eleveRow = elData.findIndex(row => (row[COL.EMAIL]||'').toString().trim().toLowerCase() === (emailEff||'').toLowerCase());
    if (eleveRow >= 0) {
      se.getRange(eleveRow+ELEVES_START_ROW, COL.DATE_ACHAT+1).setValue(new Date(now));
      se.getRange(eleveRow+ELEVES_START_ROW, COL.UTILISES+1).setValue(0);
      se.getRange(eleveRow+ELEVES_START_ROW, COL.RESTANTS+1).setValue(10);
      se.getRange(eleveRow+ELEVES_START_ROW, COL.STATUT_CARTE+1).setValue('Active');
    }
  }
  // E03 — inscription confirmée
  try { _emailInscriptionConfirmee(r[1],emailEff,r[7],r[6],r[8],carte10==='oui'?'Carte 10 cours':'Forfait'); } catch(e) {}
  return {ok:true};
}

// ── Mise à jour getAdminData pour inclure coursTango ─────────
// (à appeler dans getAdminData existant — ajout du champ coursTango)
function _getCoursTangoForAdmin() {
  return _getCoursTangoAdmin();
}

// ================================================================
// CARTES DE 10 COURS
// ================================================================

function renouvelerCarteGs(body) {
  const {eleveId, paye} = body;
  if (!eleveId) throw new Error('eleveId requis');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const se = _getSheet(ss, SHEET_ELEVES);
  const lr = se.getLastRow();
  if (lr < ELEVES_START_ROW) throw new Error('Aucun élève');
  const data = se.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues();
  const idx  = data.findIndex(r => r[COL.ID] === eleveId);
  if (idx < 0) throw new Error('Élève introuvable : '+eleveId);
  const rowNum = idx + ELEVES_START_ROW;
  const nom = data[idx][COL.NOM];
  const email = (data[idx][COL.EMAIL]||'').toString().trim();
  // Réinitialiser la carte
  se.getRange(rowNum, COL.UTILISES+1).setValue(0);
  se.getRange(rowNum, COL.RESTANTS+1).setValue(10);
  se.getRange(rowNum, COL.DATE_ACHAT+1).setValue('');
  se.getRange(rowNum, COL.EXPIRATION+1).setValue('');
  se.getRange(rowNum, COL.STATUT_CARTE+1).setValue('Active');
  // E10 — carte renouvelée (si payé)
  if (paye && email) {
    const prenom = nom.split(' ')[0]||nom;
    try { MailApp.sendEmail({to:email,replyTo:EMAIL_CONTACT,
      subject:NOM_ECOLE+' — Carte renouvelée, à bientôt !',
      htmlBody:_emailCarteRenouvelee(prenom,email)}); } catch(e) {}
  }
  return {ok:true};
}

// ── Reporter la carte sur la saison suivante ─────────────────
// Visible dans l'admin entre le 1/07 et le 31/08.
// Effet : STATUT_CARTE = 'Report:NEXT_SAISON', DATE_ACHAT et EXPIRATION vidés
// → la carte redémarre au 1er cours de la saison suivante.
// declencheurNouvelleS (1 sept) détecte ce flag et garde l'élève 'Actif'.
function reporterCarteGs(body) {
  const {eleveId} = body;
  if (!eleveId) throw new Error('eleveId requis');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const se = _getSheet(ss, SHEET_ELEVES);
  const lr = se.getLastRow();
  if (lr < ELEVES_START_ROW) throw new Error('Aucun élève');
  const data = se.getRange(ELEVES_START_ROW,1,lr-ELEVES_START_ROW+1,13).getValues();
  const idx  = data.findIndex(r => r[COL.ID] === eleveId);
  if (idx < 0) throw new Error('Élève introuvable : '+eleveId);
  const rowNum = idx + ELEVES_START_ROW;
  // Calculer la saison suivante
  const now   = new Date();
  const annee = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear()-1;
  const nextSai = (annee+1)+'-'+(annee+2);
  // Marquer la carte comme reportée
  se.getRange(rowNum, COL.STATUT_CARTE+1).setValue('Report:'+nextSai);
  // Vider DATE_ACHAT et EXPIRATION → recalculés dès le 1er cours de la nouvelle saison
  se.getRange(rowNum, COL.DATE_ACHAT+1).setValue('');
  se.getRange(rowNum, COL.EXPIRATION+1).setValue('');
  return {ok:true, nextSaison:nextSai};
}

function toggleCartePaye(body) {
  // Le toggle paye est géré côté admin uniquement (UI) — pas de persistance Sheets nécessaire
  // pour l'instant. Si besoin, ajouter une colonne "Payé" dans SHEET_ELEVES.
  return {ok:true};
}

// ================================================================
// AGENDA — Modifications d'occurrences
// ================================================================

function sauverModifAgendaGs(body) {
  const {date,type,actionType,note,newDate,newHeure,newLieu} = body;
  if (!date||!type) throw new Error('date et type requis');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s    = ss.getSheetByName(SHEET_AGENDA_MODIFS);
  if (!s) {
    s = ss.insertSheet(SHEET_AGENDA_MODIFS);
    const h = ['Horodatage','Date','Type','Action','Note','Nouvelle date','Nouvel horaire','Nouveau lieu'];
    const hr = s.getRange(1,1,1,h.length);
    hr.setValues([h]).setBackground('#D4AF37').setFontColor('#000').setFontWeight('bold');
    s.setFrozenRows(1);
  }
  const now = Utilities.formatDate(new Date(),'Europe/Paris','dd/MM/yyyy HH:mm');
  s.appendRow([now,date,type,actionType||'note',note||'',newDate||'',newHeure||'',newLieu||'']);
  // Envoyer emails aux élèves inscrits si annulation/report (selon type)
  if (actionType === 'annule' || actionType === 'reporte') {
    try { _notifModifAgenda(date,type,actionType,note||'',newDate||''); } catch(err) {}
  }
  return {ok:true};
}

// Notif email lors d'une modification d'agenda
function _notifModifAgenda(date,type,action,note,newDate) {
  const dateFr = _fmtDateFr(date);
  const typeLabel = {paris:'cours de Paris',vincennes:'cours de Vincennes',
    stage:'stage',milonga:'milonga'}[type]||type;
  const actionLabel = action==='annule'?'annulé':'reporté';
  const sujet = NOM_ECOLE+' — '+(action==='annule'?'Annulation':'Report')+' : '+typeLabel+' du '+dateFr;
  const corps = _emailWrap('Information importante',`
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">Bonjour,</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:14px;">
      Nous vous informons que le <strong style="color:#D4AF37;">${typeLabel} du ${dateFr}</strong> est <strong>${actionLabel}</strong>.
      ${note ? '<br/><br/>'+note : ''}
      ${newDate ? '<br/><br/>Il est reporté au <strong style="color:#D4AF37;">'+_fmtDateFr(newDate)+'</strong>.' : ''}
    </p>
    <p style="font-size:12px;color:#888;">Des questions ? Contactez-nous à <a href="mailto:${EMAIL_CONTACT}" style="color:#D4AF37;">${EMAIL_CONTACT}</a>.</p>
  `);
  // Envoyer aux admins (en production : récupérer emails des inscrits au cours concerné)
  ADMIN_EMAILS.forEach(a => { try { MailApp.sendEmail({to:a,subject:sujet,htmlBody:corps}); } catch(e) {} });
}

// ================================================================
// INTÉGRATION getAdminData — ajout coursTango
// (getAdminData inclut maintenant coursTango — défini plus haut ligne 298)

// ================================================================
// EMAILS — Cours Tango & Cartes
// ================================================================

// E01 — Accusé de réception demande d'inscription
function _emailDemandeRecue(prenom, email, cours, niveau, role) {
  const r = role==='guideur'?'Guideur':'Guidée';
  MailApp.sendEmail({to:email, replyTo:EMAIL_CONTACT,
    subject: NOM_ECOLE+' — Votre demande a bien été reçue',
    htmlBody: _emailWrap('Demande d\'inscription reçue', `
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${prenom}</strong> !</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:18px;">
      Merci pour votre demande d'inscription aux cours <strong>Tango &amp; Vous</strong>.
      Nous l'avons bien reçue et allons l'étudier dans les 48 à 72 heures.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      ${_row('Cours demandé', cours||niveau||'—')}
      ${_row('Niveau', niveau||'—')}
      ${_row('Rôle', r)}
    </table>
    <div style="background:#0f0d00;border:1px solid #3a2d00;border-radius:8px;padding:14px;font-size:12px;color:#888;line-height:1.8;">
      <strong style="color:#D4AF37;">Prochaines étapes :</strong><br/>
      1. Validation de votre demande (48–72h)<br/>
      2. Email de confirmation avec les modalités de paiement<br/>
      3. Paiement → place confirmée définitivement
    </div>
    <p style="font-size:12px;color:#666;margin-top:16px;">
      Une question ? Écrivez à <a href="mailto:${EMAIL_CONTACT}" style="color:#D4AF37;">${EMAIL_CONTACT}</a>
    </p>`),
  });
}

// E02 — Validation de la demande
function _emailValidation(prenom, email, cours, niveau, ville) {
  const montant = 170; // carte 10 cours par défaut
  MailApp.sendEmail({to:email, replyTo:EMAIL_CONTACT,
    subject: NOM_ECOLE+' — Votre inscription est validée 🎉',
    htmlBody: _emailWrap('Inscription validée', `
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${prenom}</strong> !</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:18px;">
      Excellente nouvelle : votre demande est validée. Votre place est réservée — il reste à finaliser le paiement.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      ${_row('Cours', cours||niveau||'—')}
      ${_row('Niveau', niveau||'—')}
      ${_row('Formule', 'Carte de 10 cours')}
      ${_row('Montant', montant+' €')}
    </table>
    <div style="background:#0f0d00;border:1px solid #3a2d00;border-radius:8px;padding:14px;font-size:13px;color:#ccc;line-height:1.8;">
      <strong style="color:#D4AF37;">Comment payer :</strong><br/>
      💳 Virement bancaire (IBAN sur demande)<br/>
      💵 Espèces le premier soir<br/>
      🔄 3× sans frais par CB (lien sur demande)
    </div>
    <p style="font-size:12px;color:#666;margin-top:16px;">
      Contactez-nous à <a href="mailto:${EMAIL_CONTACT}" style="color:#D4AF37;">${EMAIL_CONTACT}</a>
    </p>`),
  });
}

// E03 — Inscription confirmée (paiement validé)
function _emailInscriptionConfirmee(prenom, email, cours, niveau, ville, formule) {
  MailApp.sendEmail({to:email, replyTo:EMAIL_CONTACT,
    subject: NOM_ECOLE+' — Inscription confirmée, à bientôt !',
    htmlBody: _emailWrap('Inscription confirmée', `
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">À bientôt, <strong style="color:#D4AF37;">${prenom}</strong> ! 🎉</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:18px;">
      Votre paiement a été reçu. Votre place est confirmée — nous avons hâte de vous accueillir sur la piste !
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      ${_row('Cours', cours||niveau||'—')}
      ${_row('Niveau', niveau||'—')}
      ${_row('Ville', ville||'—')}
      ${_row('Formule', formule||'Carte 10 cours')}
    </table>
    <div style="background:#060d1a;border:2px solid #1565C0;border-radius:8px;padding:14px;margin-bottom:16px;">
      <div style="font-size:10px;color:#7aaaff;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;">📱 Votre espace élève</div>
      <p style="font-size:12px;color:#aaa;line-height:1.7;margin-bottom:10px;">Accédez à votre app pour suivre vos présences, l'agenda et les stages.</p>
      <a href="${URL_PWA}" style="display:block;background:#D4AF37;color:#000;text-align:center;padding:12px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:2px;">ACCÉDER À MON ESPACE</a>
    </div>
    <p style="font-size:12px;color:#666;">
      Questions ? <a href="mailto:${EMAIL_CONTACT}" style="color:#D4AF37;">${EMAIL_CONTACT}</a>
    </p>`),
  });
}

// E04 — Bienvenue 1ère séance (déclenché au 1er pointage)
function _emailBienvenuePremiereCours(nom, email, cours, niveau) {
  const prenom = nom.split(' ')[0]||nom;
  MailApp.sendEmail({to:email, replyTo:EMAIL_CONTACT,
    subject: NOM_ECOLE+' — Bienvenue dans votre cours ! 💃',
    htmlBody: _emailWrap('Bienvenue dans votre cours', `
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">Bienvenue, <strong style="color:#D4AF37;">${prenom}</strong> !</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:18px;">
      C'est avec plaisir que nous vous avons accueilli(e) ce soir. Votre première séance de la saison est enregistrée.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      ${_row('Cours', cours||niveau||'—')}
      ${_row('Niveau', niveau||'—')}
    </table>
    <div style="background:#060d1a;border:2px solid #1565C0;border-radius:8px;padding:14px;margin-bottom:16px;">
      <div style="font-size:10px;color:#7aaaff;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;">📱 Installez votre espace élève</div>
      <p style="font-size:12px;color:#aaa;line-height:1.7;margin-bottom:4px;">Agenda, carte de 10 cours, stages, actualités — tout en un clic.</p>
      <p style="font-size:12px;color:#aaa;">1. Ouvrez <a href="${URL_PWA}" style="color:#D4AF37;">${URL_PWA}</a><br/>2. Connectez-vous avec ${email}<br/>3. Ajoutez l'app à votre écran d'accueil</p>
    </div>`),
  });
}

// E10 — Carte renouvelée
function _emailCarteRenouvelee(prenom, email) {
  MailApp.sendEmail({to:email, replyTo:EMAIL_CONTACT,
    subject: NOM_ECOLE+' — Carte renouvelée, à bientôt !',
    htmlBody: _emailWrap('Carte de 10 cours renouvelée', `
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${prenom}</strong> !</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:18px;">
      Votre carte de 10 cours a été renouvelée. Vous disposez de <strong style="color:#D4AF37;">10 nouveaux cours</strong>, valables 3 mois à partir de votre prochain pointage.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      ${_row('Cours restants', '10 / 10')}
      ${_row('Validité', '3 mois à partir du 1er cours pointé')}
      ${_row('Valable', 'Paris + Vincennes')}
    </table>
    <p style="font-size:12px;color:#888;">À très bientôt sur la piste !</p>`),
  });
}

// E17 — Pré-inscription reçue (période mai–août)
function _emailPreinscriptionRecue(prenom, email, cours, niveau, role) {
  MailApp.sendEmail({to:email, replyTo:EMAIL_CONTACT,
    subject: NOM_ECOLE+' — Pré-inscription 2026–2027 bien reçue ✓',
    htmlBody: _emailWrap('Pré-inscription reçue', `
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">Bonjour <strong style="color:#D4AF37;">${prenom}</strong> !</p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:18px;">
      Votre pré-inscription pour la saison 2026–2027 est bien enregistrée.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      ${_row('Cours souhaité', cours||niveau||'—')}
      ${_row('Niveau', niveau||'—')}
      ${_row('Rôle', role||'—')}
    </table>
    <div style="background:#0f0d00;border:1px solid #3a2d00;border-radius:8px;padding:14px;font-size:12px;color:#aaa;line-height:1.8;">
      Les cours reprennent en septembre. Vous recevrez un email de confirmation fin août avec la marche à suivre pour finaliser votre inscription.
    </div>
    <p style="font-size:12px;color:#666;margin-top:16px;">
      Questions ? <a href="mailto:${EMAIL_CONTACT}" style="color:#D4AF37;">${EMAIL_CONTACT}</a>
    </p>`),
  });
}

// E19 — Carte non terminée fin de saison
// isJ1=true → premier email (J+1 après dernier cours Paris)
// isJ1=false → relance 25 août (dernier rappel avant que la carte ne devienne invalide)
function _emailCarteFinSaison(prenom, email, restants, expAff, urlInscription, isJ1) {
  const plural = restants > 1 ? 's' : '';
  const deadline = '25 août';
  const warningBlock = isJ1
    ? `<div style="background:#1a0a00;border:2px solid #ff6b35;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#ffb085;line-height:1.8;">
        <strong style="color:#ff8c42;">⚠ Important :</strong> Si vous ne faites pas de demande de pré-inscription
        avant le <strong>${deadline}</strong>, votre carte de 10 cours ne sera
        <strong>plus utilisable pour la saison suivante</strong>.
       </div>`
    : `<div style="background:#1a0a00;border:2px solid #ff6b35;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#ffb085;line-height:1.8;">
        <strong style="color:#ff4444;">⚠ Dernier rappel :</strong> C'est votre dernière chance ! Sans pré-inscription,
        votre carte de 10 cours et vos <strong>${restants} cours restant${plural}</strong>
        ne seront <strong>plus valables à la rentrée</strong>.
       </div>`;
  MailApp.sendEmail({ to: email, replyTo: EMAIL_CONTACT,
    subject: isJ1
      ? `${NOM_ECOLE} — Il vous reste ${restants} cours — pré-inscrivez-vous avant le ${deadline}`
      : `${NOM_ECOLE} — Dernier rappel : vos ${restants} cours expirent si vous ne pré-inscrivez pas`,
    htmlBody: _emailWrap('Vos cours restants', `
    <p style="font-size:15px;color:#f0f0f0;margin-bottom:14px;">
      Bonjour <strong style="color:#D4AF37;">${prenom}</strong> !
    </p>
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:16px;">
      La saison de tango argentin se termine à Paris, mais votre carte de 10 cours n'est pas encore épuisée.
    </p>
    <div style="background:#0f0d00;border:2px solid #D4AF37;border-radius:10px;padding:20px;margin-bottom:16px;text-align:center;">
      <div style="font-size:40px;font-weight:700;color:#D4AF37;font-family:Georgia,serif;line-height:1;">${restants}</div>
      <div style="font-size:13px;color:#ccc;margin-top:6px;">cours restant${plural} sur votre carte</div>
      <div style="font-size:12px;color:#888;margin-top:8px;border-top:1px solid #2a2000;padding-top:10px;">
        Expiration actuelle : <strong style="color:#D4AF37;">${expAff}</strong>
      </div>
    </div>
    ${warningBlock}
    <p style="font-size:13px;color:#ccc;line-height:1.8;margin-bottom:16px;">
      Faites votre demande de pré-inscription maintenant pour continuer à danser à la rentrée.
      Vos cours restants seront reportés sur la saison suivante.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${urlInscription}" style="display:inline-block;background:#D4AF37;color:#000;text-decoration:none;padding:15px 32px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.5px;">
        → Je me pré-inscris pour la rentrée
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #222;margin:20px 0;"/>
    <p style="font-size:12px;color:#666;line-height:1.8;">
      Une question ? Écrivez-nous à
      <a href="mailto:${EMAIL_CONTACT}" style="color:#D4AF37;">${EMAIL_CONTACT}</a><br/>
      À très bientôt sur la piste !<br/>
      <strong style="color:#888;">Marc &amp; Eva — Tango &amp; Vous</strong>
    </p>`),
  });
}

// ================================================================
// POINTAGE — 1ère présence de la saison → E04
// (hook dans ajouterPresenceManuelle)
// ================================================================
// Note : intégrer dans ajouterPresenceManuelle :
//   if (!datePremierCours) { _emailBienvenuePremiereCours(nom,email,cours,niveau); }


// E-TACHES : fiche d'une tâche : informations en tuiles, équipe, preuve de clôture, pièces jointes, discussion et actions.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Archive, ArchiveRestore, Trash2, PlayCircle, CheckCircle2, RotateCcw, CornerUpLeft, Send, Undo2, Calendar, User, UserCheck, Tag, Flag, Link2, Target, Users, Star, MessageSquare, FileText, Trash } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import PiecesJointes from '../../shared/ui/PiecesJointes'
import AvatarNom from '../../shared/ui/AvatarNom'
import { glassModalProps, icone3D } from '../../utils/color'
import { toast } from '../../core/notifications'
import { useCollection } from '../../hooks/useFirestore'
import { todayStr } from '../../utils/formatters'
import {
  COL, COULEUR, STATUTS, COULEUR_STATUT, estArchivee, estDestinataire, estChefEquipe, estMembre, libelleEcheance, formatJour,
  peutModifierLaTache, peutChangerLeStatut, peutRenvoyerLaTache, peutRetournerLaTache, peutSupprimerTache, niveauTaches
} from './data'
import { changerStatut, changerProgression, changerSousStatut, renvoyerTache, retournerTache, archiverTache, supprimerTache, ajouterPiece, retirerPiece, envoyerMessage, supprimerMessage, apprecierTache, commenterSaTache } from './actions'
import { PastilleStatut, PastillePriorite, Barre, PileAvatars } from './ui'
import { useMoi, usePersonnel } from './hooks'
import { heureMessage } from './outils'

function Info({ icone: Icone, label, children }) {
  return (
    <div className="fg-tuile min-w-0">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><Icone size={13} aria-hidden="true" />{label}</p>
      <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{children}</div>
    </div>
  )
}

export default function TacheDetail({ tache: t, onClose, onModifier }) {
  const { moi, nom, role } = useMoi()
  const jour = todayStr()
  const [lien, setLien] = useState('')
  const [motif, setMotif] = useState('')
  const [renvoi, setRenvoi] = useState(false)
  const [retour, setRetour] = useState(false)
  const [versUid, setVersUid] = useState('')
  const [motifRetour, setMotifRetour] = useState('')
  const { personnel } = usePersonnel()
  const [texte, setTexte] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [appreciation, setAppreciation] = useState(t.appreciation || '')
  const [commentaireDest, setCommentaireDest] = useState(t.commentaireDest || '')
  const boite = useRef(null)
  const { data: tous } = useCollection(COL.messages)
  const messages = useMemo(() => tous.filter((m) => m.tacheId === t.id).sort((a, b) => (a.ts || 0) - (b.ts || 0)), [tous, t.id])
  const moi_ = { uid: moi, nom }
  const archivee = estArchivee(t, jour)
  const peutStatut = peutChangerLeStatut(t, moi, role) && !archivee
  const equipe = (t.membres || []).length > 0
  const preuveFournie = !!(t.lienRapport || '').trim() || (t.pieces || []).length > 0

  useEffect(() => { if (boite.current) boite.current.scrollTop = boite.current.scrollHeight }, [messages.length])

  const agir = async (fn, ok) => {
    setOccupe(true)
    try { await fn(); if (ok) toast.success(ok) } catch (e) { toast.error(e?.message || 'Action impossible') } finally { setOccupe(false) }
  }

  const terminer = () => {
    if (t.rapportRequis && !preuveFournie && !lien.trim()) return toast.error('Cette tâche exige une preuve : collez un lien ou joignez un fichier avant de terminer')
    agir(() => changerStatut(t, 'Terminé', moi_, lien.trim() ? { lienRapport: lien.trim() } : undefined), 'Tâche terminée ✓')
  }
  const sousStatut = (m, valeur) => {
    if (valeur === 'Terminé' && t.rapportRequis && !(m.lienRapport || '').trim() && !preuveFournie && !lien.trim()) return toast.error('Une preuve est exigée : collez un lien avant de terminer')
    agir(() => changerSousStatut(t, m.uid, valeur, moi_, valeur === 'Terminé' && lien.trim() ? lien.trim() : undefined))
  }
  // Personnes à qui on peut retourner la tâche : tout le monde sauf le destinataire actuel ; celui qui l'a confiée en premier pour un retour direct.
  const candidats = personnel.filter((p) => p.uid !== t.destUid).sort((a, b) => (a.uid === t.parUid ? -1 : b.uid === t.parUid ? 1 : a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })))
  const ouvrirRetour = () => { setRenvoi(false); setVersUid((v) => v || (candidats.find((p) => p.uid === t.parUid)?.uid || '')); setRetour((v) => !v) }
  const retourner = () => {
    const vers = candidats.find((p) => p.uid === versUid)
    if (!vers) return toast.error('Choisissez la personne à qui retourner la tâche')
    if (!motifRetour.trim()) return toast.error('Le motif est obligatoire pour retourner une tâche')
    agir(async () => { await retournerTache(t, vers, motifRetour, moi_); setRetour(false); setMotifRetour(''); onClose() }, `Tâche retournée vers ${vers.nom}`)
  }
  const renvoyer = () => {
    if (!motif.trim()) return toast.error('Indiquez le motif du renvoi')
    agir(async () => { await renvoyerTache(t, motif.trim(), moi_); setRenvoi(false); setMotif('') }, 'Tâche renvoyée, le destinataire est prévenu ✓')
  }
  const envoyer = async () => { const x = texte; setTexte(''); await agir(() => envoyerMessage(t, x, moi_)) }
  const supprimer = () => { if (!confirm(`Supprimer définitivement « ${t.titre} » ?`)) return; agir(async () => { await supprimerTache(t); onClose() }, 'Tâche supprimée') }

  return (
    <Modal open onClose={onClose} size="xl" title={`${t.numero || 'Tâche'} · ${t.titre}`} {...glassModalProps(COULEUR)}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {peutModifierLaTache(t, moi, role) && !archivee && <Button variant="outline" onClick={() => onModifier(t)}><Pencil size={15} /> Modifier</Button>}
          {peutModifierLaTache(t, moi, role) && t.statut === 'Terminé' && (archivee && t.archivee
            ? <Button variant="outline" onClick={() => agir(() => archiverTache(t, false), 'Tâche désarchivée')}><ArchiveRestore size={15} /> Désarchiver</Button>
            : !archivee && <Button variant="outline" onClick={() => agir(() => archiverTache(t, true), 'Tâche archivée')}><Archive size={15} /> Archiver</Button>)}
          {peutSupprimerTache(role) && <Button variant="ghost" onClick={supprimer} className="text-red-600"><Trash2 size={15} /> Supprimer</Button>}
          <span className="flex-1" />
          {peutRetournerLaTache(t, moi, role) && !archivee && <Button variant="outline" onClick={ouvrirRetour}><CornerUpLeft size={15} /> Retourner</Button>}
          {peutRenvoyerLaTache(t, moi, role) && !archivee && <Button variant="outline" onClick={() => { setRetour(false); setRenvoi((v) => !v) }}><RotateCcw size={15} /> Renvoyer</Button>}
          {peutStatut && !equipe && t.statut === 'À faire' && <Button loading={occupe} onClick={() => agir(() => changerStatut(t, 'En cours', moi_), 'Tâche démarrée ✓')} style={{ backgroundColor: COULEUR_STATUT['En cours'] }}><PlayCircle size={15} /> Démarrer</Button>}
          {peutStatut && !equipe && t.statut !== 'Terminé' && <Button loading={occupe} variant="success" onClick={terminer}><CheckCircle2 size={15} /> Terminer</Button>}
          {peutStatut && !equipe && t.statut === 'Terminé' && !peutRenvoyerLaTache(t, moi, role) && <Button variant="outline" loading={occupe} onClick={() => agir(() => changerStatut(t, 'En cours', moi_), 'Tâche rouverte')}><Undo2 size={15} /> Rouvrir</Button>}
        </div>
      }>
      <div className="params-verre space-y-3" style={{ '--p-accent': COULEUR }}>
        <div className="flex flex-wrap items-center gap-2">
          <PastilleStatut tache={t} jour={jour} /><PastillePriorite priorite={t.priorite} />
          {archivee && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-600">Archivée</span>}
          {t.rapportRequis && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700"><FileText size={12} /> Preuve exigée</span>}
          <span className={`text-xs font-semibold ${t.statut !== 'Terminé' && libelleEcheance(t, jour).startsWith('En retard') ? 'text-red-600' : 'text-gray-500'}`}>{libelleEcheance(t, jour)}</span>
        </div>

        {t.commentaireChef && <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm font-semibold text-amber-800">{t.commentaireChef}</div>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Info icone={User} label="Destinataire"><span className="flex items-center gap-1.5"><AvatarNom nom={t.destNom} accent={COULEUR} size={22} /><span className="truncate">{t.destNom}</span></span></Info>
          <Info icone={UserCheck} label="Confiée par"><span className="truncate">{t.parNom}</span></Info>
          <Info icone={Calendar} label="Période">{t.dateDebut ? `${formatJour(t.dateDebut)} → ` : 'Jusqu\'au '}{formatJour(t.dateLimite) || '-'}</Info>
          <Info icone={Tag} label="Catégorie">{t.categorie || <span className="text-gray-400">Aucune</span>}</Info>
        </div>

        {(t.resultatAttendu || t.description || t.note) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {t.description && <Info icone={FileText} label="Description"><p className="whitespace-pre-wrap font-medium">{t.description}</p></Info>}
            {t.resultatAttendu && <Info icone={Target} label="Résultat attendu"><p className="whitespace-pre-wrap font-medium">{t.resultatAttendu}</p></Info>}
            {t.note && <Info icone={Flag} label="Note"><p className="whitespace-pre-wrap font-medium">{t.note}</p></Info>}
          </div>
        )}

        {!equipe && (
          <div className="fg-tuile">
            <div className="mb-1.5 flex items-center justify-between"><p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-500">Avancement</p><span className="text-sm font-black" style={{ color: COULEUR }}>{t.progression || 0}%</span></div>
            <Barre valeur={t.progression} hauteur="h-2.5" />
            {peutStatut && t.statut !== 'Terminé' && (
              <input type="range" min="0" max="100" step="5" value={t.progression || 0} aria-label="Avancement"
                onChange={(e) => changerProgression(t, e.target.value)} className="mt-2 w-full accent-violet-600" />
            )}
          </div>
        )}

        {equipe && (
          <div className="fg-tuile">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><Users size={13} /> Équipe <span className="ml-auto text-sm font-black normal-case" style={{ color: COULEUR }}>{t.progression || 0}%</span></p>
            <Barre valeur={t.progression} hauteur="h-2.5" />
            <ul className="mt-3 space-y-2">
              {(t.membres || []).map((m) => {
                const moiMembre = m.uid === moi
                const peut = !archivee && (moiMembre || estChefEquipe(t, moi) || niveauTaches(role) === 'chef' || t.parUid === moi)
                return (
                  <li key={m.uid} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/60 px-3 py-2">
                    <AvatarNom nom={m.nom} accent={COULEUR} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-800">{m.nom}{m.leader && <Star size={12} className="ml-1 inline fill-amber-400 text-amber-500" aria-label="Chef d'équipe" />}{moiMembre && <span className="ml-1 text-xs font-semibold text-gray-400">(vous)</span>}</span>
                    {peut ? (
                      <Select className="!w-auto !py-1 text-xs" value={m.sousStatut || 'À faire'} onChange={(e) => sousStatut(m, e.target.value)}>{STATUTS.map((s) => <option key={s}>{s}</option>)}</Select>
                    ) : <span className="text-xs font-extrabold" style={{ color: COULEUR_STATUT[m.sousStatut || 'À faire'] }}>{m.sousStatut || 'À faire'}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {t.rapportRequis && (t.statut !== 'Terminé' || t.lienRapport) && (
          <div className="fg-tuile">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><Link2 size={13} /> Preuve de clôture</p>
            {t.lienRapport ? (
              <a href={/^https?:/i.test(t.lienRapport) ? t.lienRapport : `https://${t.lienRapport}`} target="_blank" rel="noreferrer noopener" className="break-all text-sm font-semibold text-violet-700 underline">{t.lienRapport}</a>
            ) : peutStatut ? (
              <Input value={lien} onChange={(e) => setLien(e.target.value)} placeholder="Collez le lien du rapport, de la photo ou du document" />
            ) : <p className="text-sm text-gray-400">Pas encore fournie.</p>}
            <p className="mt-1 text-xs text-gray-500">Vous pouvez aussi joindre un fichier ci-dessous : il compte comme preuve.</p>
          </div>
        )}

        {(t.commentaireDest || (peutStatut && !archivee)) && (
          <div className="fg-tuile space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><MessageSquare size={13} /> Commentaire du destinataire</p>
            {peutStatut && !archivee ? (
              <>
                <textarea className="input-base min-h-[3.5rem]" value={commentaireDest} onChange={(e) => setCommentaireDest(e.target.value)} placeholder="Point d'avancement, difficulté rencontrée, remarque de clôture…" />
                <div className="flex justify-end"><Button variant="outline" loading={occupe} disabled={commentaireDest.trim() === (t.commentaireDest || '')} onClick={() => agir(() => commenterSaTache(t, commentaireDest), 'Commentaire enregistré ✓')}>Enregistrer le commentaire</Button></div>
              </>
            ) : <p className="whitespace-pre-wrap text-sm font-medium text-gray-700">{t.commentaireDest}</p>}
          </div>
        )}

        {(t.appreciation || peutModifierLaTache(t, moi, role)) && (
          <div className="fg-tuile space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><Star size={13} className="fill-amber-300 text-amber-500" /> Appréciation de {t.apprecieePar || t.parNom}</p>
            {peutModifierLaTache(t, moi, role) && !archivee ? (
              <>
                <textarea className="input-base min-h-[4rem]" value={appreciation} onChange={(e) => setAppreciation(e.target.value)} placeholder="Votre appréciation sur cette tâche : qualité, délai, points à améliorer…" />
                <div className="flex justify-end"><Button variant="outline" loading={occupe} disabled={appreciation.trim() === (t.appreciation || '')} onClick={() => agir(() => apprecierTache(t, appreciation, moi_), 'Appréciation enregistrée ✓')}>Enregistrer l'appréciation</Button></div>
              </>
            ) : <p className="whitespace-pre-wrap text-sm font-medium text-gray-700">{t.appreciation}</p>}
          </div>
        )}

        <div className="fg-tuile">
          <PiecesJointes pieces={t.pieces || []} label="Pièces jointes" readOnly={archivee} noDelete={role === 'agent' || !peutChangerLeStatut(t, moi, role)}
            onAdd={(p) => ajouterPiece(t, p)} onRemove={(p) => retirerPiece(t, p)} />
        </div>

        {retour && (
          <div className="fg-tuile space-y-2 border-violet-200">
            <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800"><CornerUpLeft size={15} style={{ color: COULEUR }} /> Retourner la tâche à quelqu'un d'autre</p>
            <Select value={versUid} onChange={(e) => setVersUid(e.target.value)} aria-label="Transférer à">
              <option value="">Choisir une personne</option>
              {candidats.map((p) => <option key={p.uid} value={p.uid}>{p.nom}{p.uid === t.parUid ? ' (a confié la tâche)' : ''}{p.secteur ? ` · ${p.secteur}` : ''}</option>)}
            </Select>
            <textarea className="input-base min-h-[4rem]" value={motifRetour} onChange={(e) => setMotifRetour(e.target.value)} placeholder="Motif du retour (obligatoire) : hors de mes attributions, manque de compétences, déplacement jusqu'au…" />
            <p className="text-xs text-gray-500">{t.parNom} (qui a confié la tâche) sera prévenu(e) avec votre motif, et la personne choisie recevra la tâche. Elle repassera « À faire » à 0 %.</p>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setRetour(false)}>Annuler</Button><Button loading={occupe} onClick={retourner} style={{ backgroundColor: COULEUR }}><CornerUpLeft size={15} /> Confirmer le retour</Button></div>
          </div>
        )}

        {(t.retours || []).length > 0 && (
          <div className="fg-tuile">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><CornerUpLeft size={13} /> Historique des retours</p>
            <ul className="space-y-1.5">
              {t.retours.map((r, i) => <li key={i} className="rounded-xl bg-white/60 px-3 py-2 text-sm"><span className="font-bold text-gray-800">{r.de}</span> vers <span className="font-bold text-gray-800">{r.vers}</span><span className="text-xs text-gray-400"> · par {r.par} le {heureMessage(r.ts)}</span><span className="block whitespace-pre-wrap text-gray-600">{r.motif}</span></li>)}
            </ul>
          </div>
        )}

        {renvoi && (
          <div className="fg-tuile space-y-2 border-amber-200">
            <p className="text-sm font-bold text-gray-800">Renvoyer la tâche pour reprise</p>
            <textarea className="input-base min-h-[4rem]" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif du renvoi : ce qu'il faut reprendre ou corriger" autoFocus />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setRenvoi(false)}>Annuler</Button><Button variant="warning" loading={occupe} onClick={renvoyer}><RotateCcw size={15} /> Renvoyer</Button></div>
          </div>
        )}

        <div className="fg-tuile">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><MessageSquare size={13} /> Discussion {messages.length > 0 && <span className="rounded-full bg-violet-100 px-1.5 text-[10px] text-violet-700">{messages.length}</span>}</p>
          <div ref={boite} className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {messages.map((m) => {
              const mien = m.uid === moi
              return (
                <div key={m.id} className={`flex ${mien ? 'justify-end' : 'justify-start'}`}>
                  <div className={`group max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mien ? 'rounded-br-md bg-violet-600 text-white' : 'rounded-bl-md bg-white/80 text-gray-800'}`}>
                    {!mien && <p className="text-[11px] font-extrabold" style={{ color: COULEUR }}>{m.nom}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.texte}</p>
                    <p className={`mt-0.5 flex items-center gap-2 text-[10px] ${mien ? 'text-white/70' : 'text-gray-400'}`}>{heureMessage(m.ts)}{role !== 'agent' && (mien || niveauTaches(role) === 'chef') && <button type="button" onClick={() => supprimerMessage(m)} aria-label="Supprimer le message" className="opacity-0 transition-opacity group-hover:opacity-100"><Trash size={11} /></button>}</p>
                  </div>
                </div>
              )
            })}
            {!messages.length && <p className="py-3 text-center text-sm text-gray-400">Aucun message. Posez une question ou donnez un avancement.</p>}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <textarea className="input-base min-h-[2.6rem] flex-1 resize-none" rows={1} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Écrire un message…"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (texte.trim()) envoyer() } }} />
            <Button onClick={envoyer} disabled={!texte.trim()} style={{ backgroundColor: COULEUR }} aria-label="Envoyer"><Send size={16} /></Button>
          </div>
        </div>
        {(t.membres || []).length > 0 && <div className="flex items-center gap-2 text-xs text-gray-500"><PileAvatars noms={(t.membres || []).map((m) => m.nom)} /> {(t.membres || []).length} membre(s) dans l'équipe</div>}
      </div>
    </Modal>
  )
}

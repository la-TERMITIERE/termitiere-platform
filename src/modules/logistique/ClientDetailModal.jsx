// Fiche d'un client : coordonnées, nombre de locations, total facturé, dernière location,
// puis l'historique détaillé des locations (matériel loué, frais, période) et les factures.
// Le client est reconnu par son identifiant OU par son nom (sans accent ni casse) : les anciennes
// prestations ne portent que le nom, et un même client peut avoir plusieurs fiches.
import { useMemo, useState } from 'react'
import { Phone, Mail, MapPin, ClipboardList, Wallet, CalendarDays, FileText, ChevronDown, Boxes, PartyPopper, Package, Sparkles, Receipt } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import AvatarNom from '../../shared/ui/AvatarNom'
import NumDoc from '../../shared/ui/NumDoc'
import Compteur from '../../shared/ui/Compteur'
import EtatVide from '../../shared/ui/EtatVide'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { logistiqueVoitMontants } from '../../core/roles'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import { todayStr, formatMoney, formatDateShort } from '../../utils/formatters'
import { siteLabel } from './site/useSite'
import { iconeEvenement } from './PrestationFormUI'

const COULEUR = COULEUR_MODULE.logistique
const norm = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

const STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  facturee: { label: 'Facturée', tone: 'info' },
  en_cours: { label: 'En location', tone: 'warning' },
  terminee: { label: 'Terminée', tone: 'success' },
  annulee: { label: 'Annulée', tone: 'danger' }
}
const F_STATUTS = { brouillon: { label: 'Brouillon', tone: 'neutral' }, approuvee: { label: 'Approuvée', tone: 'success' } }

export default function ClientDetailModal({ client, onClose }) {
  const role = useAuth((s) => s.role)
  const voitMontants = logistiqueVoitMontants(role)
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: factures } = useCollection('logistique_factures')
  const { data: retours } = useCollection('logistique_retours')
  const [ouvert, setOuvert] = useState({})

  const estDuClient = (x) => !!client && (x.clientId === client.id || (!!x.clientNom && norm(x.clientNom) === norm(client.nom)))
  const locs = useMemo(() => (client ? prestations.filter(estDuClient).sort((a, b) => ((a.dateDebut || a.date) < (b.dateDebut || b.date) ? 1 : -1)) : []), [prestations, client]) // eslint-disable-line react-hooks/exhaustive-deps
  const facs = useMemo(() => (client ? factures.filter(estDuClient).sort((a, b) => (a.date < b.date ? 1 : -1)) : []), [factures, client]) // eslint-disable-line react-hooks/exhaustive-deps

  const valides = locs.filter((p) => p.statut !== 'annulee')
  const nbPresta = valides.filter((p) => (p.type || 'prestation') === 'prestation').length
  const nbSimple = valides.length - nbPresta
  const totalFacture = facs.reduce((s, f) => s + (Number(f.totalTTC) || 0), 0)
  const derniere = valides[0]

  // État opérationnel (même logique que le volet Prestations : dates + retours enregistrés).
  function etatOp(p) {
    if (p.statut === 'annulee') return { label: 'Annulée', tone: 'danger' }
    const rendu = retours.filter((r) => r.prestationId === p.id).reduce((s, r) => s + (parseInt(r.qte) || 0), 0)
    const pris = (p.lignes || []).filter((l) => l.materielId).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
    const today = todayStr()
    if (pris > 0 && rendu >= pris) return { label: 'Terminée : retour OK', tone: 'success' }
    if (today < (p.dateDebut || '')) return { label: 'À venir', tone: 'info' }
    if (today <= (p.dateFin || '')) return { label: 'En cours', tone: 'warning' }
    return { label: 'Terminée : retour en attente', tone: 'neutral' }
  }

  const kpis = [
    { icone: ClipboardList, titre: 'Locations', couleur: COULEUR, valeur: <Compteur valeur={valides.length} />, sous: `${nbPresta} prestation${nbPresta > 1 ? 's' : ''} · ${nbSimple} location${nbSimple > 1 ? 's' : ''} simple${nbSimple > 1 ? 's' : ''}` },
    ...(voitMontants ? [{ icone: Wallet, titre: 'Total facturé', couleur: '#16A34A', valeur: <Compteur valeur={totalFacture} format={formatMoney} />, sous: `${facs.length} facture${facs.length > 1 ? 's' : ''}` }] : []),
    { icone: CalendarDays, titre: 'Dernière location', couleur: '#0EA5E9', valeur: derniere ? formatDateShort(derniere.dateDebut || derniere.date) : ':', sous: derniere ? (derniere.evenement || 'Sans événement') : 'Aucune location' },
    { icone: FileText, titre: 'Factures', couleur: '#E8850F', valeur: <Compteur valeur={facs.length} />, sous: `${facs.filter((f) => f.statut === 'approuvee').length} approuvée(s)` }
  ]

  return (
    <Modal open={!!client} onClose={onClose} size="xl" {...glassModalProps(COULEUR)}
      title={client ? `Client : ${(client.nom || '').trim()}` : ''}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      {client && (
        <div className="space-y-4">
          {/* En-tête : avatar 3D qui respire, coordonnées en pastilles de verre */}
          <div className="relative overflow-hidden rounded-3xl p-4 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
            style={{ background: 'linear-gradient(135deg, #d9594b 0%, #BC3C31 50%, #2a2a2a 100%)' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            <div className="relative flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <span aria-hidden="true" className="ev-halo absolute inset-0 rounded-full bg-white" />
                <span className="relative block rounded-full ring-4 ring-white/80"><AvatarNom nom={client.nom} size={64} accent="#8f2a22" /></span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-extrabold leading-tight">{(client.nom || '').trim()}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {client.telephone && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-md"><Phone size={12} />{client.telephone}</span>}
                  {client.email && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-md"><Mail size={12} />{client.email}</span>}
                  {client.adresse && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-md"><MapPin size={12} />{client.adresse}</span>}
                  {!client.telephone && !client.email && !client.adresse && <span className="text-xs text-white/70">Aucune coordonnée renseignée</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Bento : chiffres clés */}
          <div className={`grid gap-2.5 ${kpis.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {kpis.map((k) => (
              <div key={k.titre} className="tuile-verre flex items-center gap-3 !p-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={icone3D(k.couleur)}><k.icone size={20} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k.titre}</p>
                  <p className="break-words text-lg font-extrabold leading-tight text-gray-800">{k.valeur}</p>
                  <p className="text-[11px] leading-snug text-gray-400">{k.sous}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Historique des locations */}
          <div className="tuile-verre">
            <p className="mb-2.5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D(COULEUR)}><Boxes size={14} /></span>
              Historique des locations ({locs.length})
            </p>
            {locs.length === 0 ? (
              <EtatVide icone={ClipboardList} texte="Ce client n'a encore aucune location" accent={COULEUR} className="!py-6" />
            ) : (
              <div className="space-y-2">
                {locs.map((p, idx) => {
                  const estOuvert = ouvert[p.id] ?? idx === 0
                  const Icone = iconeEvenement(p.evenement)
                  const op = etatOp(p)
                  const TypeIcone = (p.type || 'prestation') === 'prestation' ? PartyPopper : Package
                  return (
                    <div key={p.id} className="overflow-hidden rounded-2xl border border-white/80 bg-white/60 shadow-[0_8px_16px_-14px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.95)]">
                      <button type="button" onClick={() => setOuvert((o) => ({ ...o, [p.id]: !estOuvert }))}
                        className="flex w-full flex-wrap items-center gap-3 p-3 text-left transition-colors hover:bg-white/70">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(COULEUR)}><Icone size={16} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <NumDoc num={p.num} />
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"><TypeIcone size={10} />{(p.type || 'prestation') === 'prestation' ? 'Prestation' : 'Location simple'}</span>
                            {p.site && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{siteLabel(p.site)}</span>}
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {p.evenement ? `${p.evenement} · ` : ''}{formatDateShort(p.dateDebut || p.date)}{p.dateFin && p.dateFin !== p.dateDebut ? ` → ${formatDateShort(p.dateFin)}` : ''}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          {voitMontants && <strong className="whitespace-nowrap text-sm">{formatMoney(p.total || 0)}</strong>}
                          <span className="flex flex-wrap justify-end gap-1">
                            <Badge tone={STATUTS[p.statut]?.tone}>{STATUTS[p.statut]?.label || p.statut}</Badge>
                            <Badge tone={op.tone}>{op.label}</Badge>
                          </span>
                        </span>
                        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${estOuvert ? 'rotate-180' : ''}`} />
                      </button>
                      {estOuvert && (
                        <div className="border-t border-white/80 bg-white/40 p-3">
                          {p.lieu && <p className="mb-2 flex items-center gap-1.5 text-xs text-gray-500"><MapPin size={12} className="text-red-500" />{p.lieu}</p>}
                          <div className="flex flex-wrap gap-1.5">
                            {(p.lignes || []).map((l, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-2.5 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                                <span className="font-semibold text-gray-800">{l.materielNom || 'Élément'}</span>
                                <span className="rounded-md bg-red-50 px-1.5 text-[11px] font-extrabold text-red-700">× {l.qte}</span>
                                <span className="text-[11px] text-gray-400">{l.nbJours || 1} j</span>
                                {voitMontants && <span className="text-[11px] font-semibold text-gray-600">{formatMoney(l.montant || 0)}</span>}
                              </span>
                            ))}
                            {!(p.lignes || []).length && <span className="text-xs text-gray-400">Aucune ligne de matériel.</span>}
                          </div>
                          {voitMontants && (p.frais || []).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {p.frais.map((x, i) => (
                                <span key={i} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-xs text-amber-800">
                                  <Receipt size={11} />{x.label}<strong>{formatMoney(x.montant || 0)}</strong>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Factures du client */}
          <div className="tuile-verre">
            <p className="mb-2.5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#E8850F')}><FileText size={14} /></span>
              Factures ({facs.length})
            </p>
            {facs.length === 0 ? (
              <p className="py-3 text-center text-sm text-gray-400">Aucune facture pour ce client.</p>
            ) : (
              <div className="space-y-1.5">
                {facs.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/60 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                    <NumDoc num={f.num} />
                    <span className="text-xs text-gray-500">{formatDateShort(f.date)}</span>
                    {f.prestationNum && <span className="flex items-center gap-1 text-xs text-gray-400"><Sparkles size={11} />{f.prestationNum}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      {voitMontants && <strong className="whitespace-nowrap text-sm">{formatMoney(f.totalTTC || 0)}</strong>}
                      <Badge tone={(F_STATUTS[f.statut] || F_STATUTS.brouillon).tone}>{(F_STATUTS[f.statut] || F_STATUTS.brouillon).label}</Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

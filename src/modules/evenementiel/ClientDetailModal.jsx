// Fiche d'un client de la Briqueterie : coordonnées, nombre d'achats, briques achetées, total,
// puis l'historique détaillé des ventes (briques, quantités, prix) et les factures.
// Le client est reconnu par son identifiant OU par son nom (sans accent ni casse).
import { useMemo, useState } from 'react'
import { Phone, MapPin, Briefcase, ShoppingCart, Wallet, CalendarDays, FileText, ChevronDown, Boxes, Layers } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import AvatarNom from '../../shared/ui/AvatarNom'
import NumDoc from '../../shared/ui/NumDoc'
import Compteur from '../../shared/ui/Compteur'
import EtatVide from '../../shared/ui/EtatVide'
import { useCollection } from '../../hooks/useFirestore'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'

const COULEUR = COULEUR_MODULE.evenementiel
const norm = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

const STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  en_attente: { label: 'Autorisation requise', tone: 'warning' },
  autorisee: { label: 'Autorisée', tone: 'success' },
  chargee: { label: 'Chargée / Partie', tone: 'info' },
  annulee: { label: 'Annulée', tone: 'danger' }
}

export default function ClientDetailModal({ client, onClose }) {
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: factures } = useCollection('evenementiel_factures')
  const [ouvert, setOuvert] = useState({})

  const nomOk = (nom) => !!client && !!nom && norm(nom) === norm(client.nom)
  const mesVentes = useMemo(() => (client ? ventes.filter((v) => v.clientId === client.id || nomOk(v.clientNom)).sort((a, b) => ((a.dateChargement || a.date) < (b.dateChargement || b.date) ? 1 : -1)) : []), [ventes, client]) // eslint-disable-line react-hooks/exhaustive-deps
  const mesFactures = useMemo(() => (client ? factures.filter((f) => nomOk(f.client?.nom)).sort((a, b) => (a.date < b.date ? 1 : -1)) : []), [factures, client]) // eslint-disable-line react-hooks/exhaustive-deps

  const valides = mesVentes.filter((v) => v.statut !== 'annulee')
  const nbBriques = valides.reduce((s, v) => s + (v.lignes || []).reduce((t, l) => t + (parseInt(l.qte) || 0), 0), 0)
  const totalAchats = valides.reduce((s, v) => s + (Number(v.total) || 0), 0)
  const derniere = valides[0]

  const kpis = [
    { icone: ShoppingCart, titre: 'Achats', couleur: COULEUR, valeur: <Compteur valeur={valides.length} />, sous: 'ventes enregistrées' },
    { icone: Layers, titre: 'Briques achetées', couleur: '#E8850F', valeur: <Compteur valeur={nbBriques} format={formatNumber} />, sous: 'au total' },
    { icone: Wallet, titre: 'Total acheté', couleur: '#16A34A', valeur: <Compteur valeur={totalAchats} format={formatMoney} />, sous: `${mesFactures.length} facture${mesFactures.length > 1 ? 's' : ''}` },
    { icone: CalendarDays, titre: 'Dernier achat', couleur: '#0EA5E9', valeur: derniere ? formatDateShort(derniere.dateChargement || derniere.date) : ':', sous: derniere ? (STATUTS[derniere.statut]?.label || derniere.statut) : 'Aucune vente' }
  ]

  return (
    <Modal open={!!client} onClose={onClose} size="xl" {...glassModalProps(COULEUR)}
      title={client ? `Client : ${(client.nom || '').trim()}` : ''}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      {client && (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-3xl p-4 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
            style={{ background: 'linear-gradient(135deg, #8a9bb3 0%, #475569 50%, #0f172a 130%)' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            <div className="relative flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <span aria-hidden="true" className="ev-halo absolute inset-0 rounded-full bg-white" />
                <span className="relative block rounded-full ring-4 ring-white/80"><AvatarNom nom={client.nom} size={64} accent="#1e293b" /></span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-extrabold leading-tight">{(client.nom || '').trim()}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {client.profession && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-md"><Briefcase size={12} />{client.profession}</span>}
                  {client.telephone && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-md"><Phone size={12} />{client.telephone}</span>}
                  {client.adresse && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-md"><MapPin size={12} />{client.adresse}</span>}
                  {!client.profession && !client.telephone && !client.adresse && <span className="text-xs text-white/70">Aucune coordonnée renseignée</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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

          <div className="tuile-verre">
            <p className="mb-2.5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D(COULEUR)}><Boxes size={14} /></span>
              Historique des ventes ({mesVentes.length})
            </p>
            {mesVentes.length === 0 ? (
              <EtatVide icone={ShoppingCart} texte="Ce client n'a encore aucune vente" accent={COULEUR} className="!py-6" />
            ) : (
              <div className="space-y-2">
                {mesVentes.map((v, idx) => {
                  const estOuvert = ouvert[v.id] ?? idx === 0
                  const qte = (v.lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
                  return (
                    <div key={v.id} className="overflow-hidden rounded-2xl border border-white/80 bg-white/60 shadow-[0_8px_16px_-14px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.95)]">
                      <button type="button" onClick={() => setOuvert((o) => ({ ...o, [v.id]: !estOuvert }))}
                        className="flex w-full flex-wrap items-center gap-3 p-3 text-left transition-colors hover:bg-white/70">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(COULEUR)}><ShoppingCart size={16} /></span>
                        <span className="min-w-0 flex-1">
                          <NumDoc num={v.num} />
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {formatNumber(qte)} brique(s) · chargement {formatDateShort(v.dateChargement || v.date)}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <strong className="whitespace-nowrap text-sm">{formatMoney(v.total || 0)}</strong>
                          <Badge tone={STATUTS[v.statut]?.tone}>{STATUTS[v.statut]?.label || v.statut}</Badge>
                        </span>
                        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${estOuvert ? 'rotate-180' : ''}`} />
                      </button>
                      {estOuvert && (
                        <div className="border-t border-white/80 bg-white/40 p-3">
                          <div className="flex flex-wrap gap-1.5">
                            {(v.lignes || []).map((l, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/80 px-2.5 py-1 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                                <span className="font-semibold text-gray-800">{l.briqueNom || 'Brique'}</span>
                                <span className="rounded-md bg-slate-50 px-1.5 text-[11px] font-extrabold text-slate-700">× {formatNumber(l.qte)}</span>
                                <span className="text-[11px] text-gray-400">à {formatMoney(l.prixUnitaire || 0)}</span>
                                <span className="text-[11px] font-semibold text-gray-600">{formatMoney(l.montant || 0)}</span>
                              </span>
                            ))}
                            {!(v.lignes || []).length && <span className="text-xs text-gray-400">Aucune ligne.</span>}
                          </div>
                          {v.notes && <p className="mt-2 text-xs italic text-gray-500">{v.notes}</p>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="tuile-verre">
            <p className="mb-2.5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#E8850F')}><FileText size={14} /></span>
              Factures ({mesFactures.length})
            </p>
            {mesFactures.length === 0 ? (
              <p className="py-3 text-center text-sm text-gray-400">Aucune facture pour ce client.</p>
            ) : (
              <div className="space-y-1.5">
                {mesFactures.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/60 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                    <NumDoc num={f.numero} />
                    <span className="text-xs text-gray-500">{formatDateShort(f.date)}</span>
                    <strong className="ml-auto whitespace-nowrap text-sm">{formatMoney(f.totalTTC || 0)}</strong>
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

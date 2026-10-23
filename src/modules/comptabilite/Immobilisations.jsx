// COMPTABILITÉ — registre des immobilisations et amortissements (linéaire SYSCOHADA).
import { useMemo, useState } from 'react'
import { Boxes, Plus, Pencil, Trash2, Tag, Banknote, CalendarDays, Hourglass, FileText, MapPin, Check, BookOpen, Sparkles, Map, Building2, Wrench, Truck, Laptop, Armchair, Tractor, TrendingDown, Scale, BadgeCheck } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { glassModalProps, icone3D } from '../../utils/color'
import { ANIMATIONS, CarteVerre, Info as InfoTuile, BoutonAction, EtatVide } from './ui'
import { MODULES } from '../../shared/modules'
import { useCompta } from './useCompta'
import { CATEGORIES_IMMO, getCategorieImmo, COL } from './data'
import { planAmortissement } from './logic'
import BandeauCompta, { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'

const COULEUR_COMPTA = MODULES.find((m) => m.id === 'comptabilite')?.color || '#ea580c'
// Icône et couleur de chaque catégorie d'actif
const ICONE_CAT = { terrain: Map, batiment: Building2, materiel: Wrench, vehicule: Truck, informatique: Laptop, mobilier: Armchair, agricole: Tractor }
const COULEUR_CAT = { terrain: '#16a34a', batiment: '#0d9488', materiel: '#f59e0b', vehicule: '#2563eb', informatique: '#7c3aed', mobilier: '#E8850F', agricole: '#65a30d' }
const vide = () => ({ libelle: '', categorie: 'materiel', categorieAutre: '', valeur: '', dateAcquisition: todayStr(), dureeAmort: '', reference: '', affectation: '' })

export default function Immobilisations() {
  const { immobilisations, loading } = useCompta()
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null)

  const enrichies = useMemo(() => immobilisations.map((im) => {
    const cat = getCategorieImmo(im.categorie)
    const amort = planAmortissement({ ...im, dureeAmort: im.dureeAmort ?? cat?.dureeAmort })
    return { ...im, cat, amort }
  }).sort((a, b) => (b.dateAcquisition || '').localeCompare(a.dateAcquisition || '')), [immobilisations])

  const totaux = useMemo(() => enrichies.reduce((t, im) => ({
    brut: t.brut + (Number(im.valeur) || 0),
    amort: t.amort + im.amort.cumul,
    vnc: t.vnc + im.amort.vnc
  }), { brut: 0, amort: 0, vnc: 0 }), [enrichies])

  const enregistrer = async () => {
    const v = {
      libelle: modal.libelle.trim(),
      categorie: modal.categorie || '',
      categorieAutre: modal.categorie === 'autre' ? (modal.categorieAutre || '').trim() : '',
      valeur: Number(modal.valeur) || 0,
      dateAcquisition: modal.dateAcquisition || '',
      dureeAmort: modal.dureeAmort === '' ? (getCategorieImmo(modal.categorie)?.dureeAmort || 0) : Number(modal.dureeAmort),
      reference: modal.reference || '',
      affectation: modal.affectation || ''
    }
    // Rien n'est obligatoire : on n'a pas toujours toutes les informations sur un bien (le reste se complète plus tard).
    if (modal.id) await updateItem(COL.immobilisations, modal.id, v)
    else await addItem(COL.immobilisations, v)
    setModal(null)
  }
  const supprimer = async (im) => {
    if (!confirm(`Supprimer l'immobilisation « ${im.libelle || 'sans désignation'} » ?`)) return
    await removeItem(COL.immobilisations, im.id)
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <BandeauCompta icone={Boxes} titre="Immobilisations & Actifs" sous={"Gérez le registre des actifs physiques et incorporels, simulez les plans d'amortissement et passez automatiquement les écritures de dotation et de cession."}>
        <BoutonBande icone={Plus} onClick={() => setModal(vide())}>Créer un Actif</BoutonBande>
      </BandeauCompta>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="VALEUR BRUTE GLOBALE" value={formatMoney(totaux.brut)} sub="Valeur d'origine (HT) des actifs en service" accent="#0d9488" icon={Boxes} />
        <StatCard title="AMORTISSEMENTS CUMULÉS" value={formatMoney(totaux.amort)} sub="Perte de valeur totale déjà comptabilisée" accent="#f59e0b" icon={TrendingDown} />
        <StatCard title="VALEUR NETTE COMPTABLE (VNC)" value={formatMoney(totaux.vnc)} sub="Valeur comptable nette restante à amortir" accent="#2563eb" icon={Scale} />
      </div>

      <style>{ANIMATIONS}</style>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {enrichies.length === 0 && (
          <EtatVide icone={Boxes} couleur="#0d9488" titre="Aucun actif enregistré"
            texte="Matériel, véhicules, mobilier, bâtiments : ajoutez vos actifs pour suivre leur amortissement et leur valeur nette."
            action={<Button onClick={() => setModal(vide())}><Plus size={15} /> Créer un actif</Button>} />
        )}
        {enrichies.map((im, i) => {
          const couleur = COULEUR_CAT[im.categorie] || '#475569'
          const IconeCat = ICONE_CAT[im.categorie] || Tag
          const libCat = im.categorie === 'autre' ? (im.categorieAutre || 'Autre catégorie') : (im.cat?.label || im.categorie || 'Catégorie non précisée')
          const pct = Number(im.valeur) > 0 ? Math.min(100, Math.round((im.amort.cumul / Number(im.valeur)) * 100)) : 0
          const enService = im.amort.vnc > 0
          return (
            <CarteVerre key={im.id} i={i} couleur={couleur} onClick={() => setDetail(im)}>
              <div className="relative flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" style={icone3D(couleur)}><IconeCat size={22} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-extrabold text-gray-800 dark:text-gray-100">{im.libelle || <span className="italic text-gray-400">Bien sans désignation</span>}</h3>
                  <p className="truncate text-[11px] text-gray-500">{libCat}{im.affectation ? ` · ${im.affectation}` : ''}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${enService ? '#16a34a' : '#64748b'}, ${enService ? '#16a34acc' : '#64748bcc'})` }}>
                      <BadgeCheck size={10} /> {enService ? 'En service' : 'Amorti'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/80 bg-white/70 px-2 py-0.5 text-[10px] font-extrabold text-gray-600">
                      <Hourglass size={10} /> {im.amort.amortissable ? `Linéaire · ${im.amort.duree} ans` : 'Non amortissable'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative rounded-2xl border border-white/70 px-3 py-2 backdrop-blur-md" style={{ background: `linear-gradient(135deg, ${couleur}1f, rgba(255,255,255,0.5))` }}>
                <p className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wide text-gray-500"><Scale size={11} /> Valeur nette (VNC)</p>
                <p className="text-xl font-extrabold leading-tight text-gray-900 dark:text-gray-50">{formatMoney(im.amort.vnc)}</p>
                {im.amort.amortissable && (
                  <div className="mt-1.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/70 shadow-inner">
                      <div className="cp-barre h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${couleur}, #f59e0b)`, animation: 'cp-barre 0.9s ease-out both' }} />
                    </div>
                    <p className="mt-0.5 text-[10px] font-bold text-gray-500">{pct} % amorti</p>
                  </div>
                )}
              </div>

              <div className="relative grid grid-cols-2 gap-1.5">
                <InfoTuile icone={Banknote} couleur="#16a34a" label="Valeur d'origine">{formatMoney(im.valeur)}</InfoTuile>
                <InfoTuile icone={TrendingDown} couleur="#f59e0b" label="Amort. cumulé">{formatMoney(im.amort.cumul)}</InfoTuile>
                {im.dateAcquisition && <InfoTuile icone={CalendarDays} couleur="#2563eb" label="Acquis le">{formatDateShort(im.dateAcquisition)}</InfoTuile>}
                {im.reference && <InfoTuile icone={FileText} couleur="#475569" label="Réf.">{im.reference}</InfoTuile>}
              </div>

              <div className="relative mt-auto flex justify-end gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
                <BoutonAction icone={Pencil} couleur="#2563eb" titre="Modifier" onClick={() => setModal({ ...im, valeur: String(im.valeur), dureeAmort: String(im.dureeAmort ?? '') })} />
                <BoutonAction icone={Trash2} couleur="#dc2626" titre="Supprimer" onClick={() => supprimer(im)} />
              </div>
            </CarteVerre>
          )
        })}
      </div>

      {/* Saisie : bento grid en verre, petites icônes 3D. Aucun champ n'est obligatoire. */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier l\'immobilisation' : 'Nouvelle immobilisation'}
        {...glassModalProps(COULEUR_COMPTA)}
        footer={<>
          <Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
          <Button onClick={enregistrer}>Enregistrer</Button>
        </>}>
        {modal && (() => {
          const cat = getCategorieImmo(modal.categorie)
          const maj = (patch) => setModal((m) => ({ ...m, ...patch }))
          return (
            <div className="grid grid-cols-6 gap-2.5">
              <style>{`
                @keyframes im-entree { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
                @media (prefers-reduced-motion: reduce) { .im-tuile { animation: none !important; } }
              `}</style>

              {/* Héro */}
              <div className="im-tuile relative col-span-6 overflow-hidden rounded-2xl p-3 text-white shadow-[0_12px_24px_-14px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.4)]"
                style={{ background: `linear-gradient(135deg, ${COULEUR_COMPTA}, ${COULEUR_COMPTA}b3 60%, #0f172a)`, animation: 'im-entree 0.35s ease-out both' }}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                <div className="relative flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_4px_8px_rgba(0,0,0,0.25)]"><Boxes size={18} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold leading-tight">{modal.id ? 'Modifier un actif' : 'Nouvel actif immobilisé'}</p>
                    <p className="flex items-center gap-1 text-[11px] text-white/85"><Sparkles size={11} /> Aucun champ n'est obligatoire : renseignez ce que vous savez.</p>
                  </div>
                </div>
              </div>

              <Tuile i={1} className="col-span-6" icone={Tag} couleur="#7c3aed" label="Désignation du bien">
                <input value={modal.libelle} onChange={(e) => maj({ libelle: e.target.value })} placeholder="ex. Camion Isuzu : MAXI LOGISTIQUE" className="input-base" />
              </Tuile>

              <Tuile i={2} className="col-span-6" icone={Boxes} couleur="#0d9488" label="Catégorie">
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES_IMMO.map((c) => {
                    const actif = modal.categorie === c.id
                    return (
                      <button key={c.id} type="button" aria-pressed={actif} title={actif ? 'Cliquer pour annuler ce choix' : undefined}
                        onClick={() => maj({ categorie: actif ? '' : c.id, dureeAmort: '' })}
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border py-0.5 pl-0.5 pr-2 text-[10px] font-extrabold backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95 ${actif ? 'border-white/70 text-white shadow-md' : 'border-gray-200 text-gray-600 hover:bg-white'}`}
                        style={actif ? { background: `linear-gradient(135deg, ${COULEUR_COMPTA}, ${COULEUR_COMPTA}cc)`, boxShadow: `0 8px 16px -8px ${COULEUR_COMPTA}` } : { background: 'linear-gradient(135deg, #ffffffee, #f1f5f9)' }}>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full" style={actif ? { background: 'rgba(255,255,255,0.28)' } : icone3D('#0d9488')}>
                          {actif ? <Check size={9} strokeWidth={3.5} /> : <Boxes size={8} />}
                        </span>
                        {c.label}
                      </button>
                    )
                  })}
                  {/* Une catégorie qui n'est pas dans la liste : on la nomme soi-même. */}
                  <button type="button" aria-pressed={modal.categorie === 'autre'} title={modal.categorie === 'autre' ? 'Cliquer pour annuler ce choix' : 'Saisir une autre catégorie'}
                    onClick={() => maj({ categorie: modal.categorie === 'autre' ? '' : 'autre', categorieAutre: '', dureeAmort: '' })}
                    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-dashed py-0.5 pl-0.5 pr-2 text-[10px] font-extrabold transition-all hover:-translate-y-0.5 active:scale-95 ${modal.categorie === 'autre' ? 'border-white/70 text-white shadow-md' : 'text-gray-600 hover:bg-white'}`}
                    style={modal.categorie === 'autre' ? { background: 'linear-gradient(135deg, #475569, #475569cc)', boxShadow: '0 8px 16px -8px #475569' } : { background: 'transparent', borderColor: '#94a3b8' }}>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full" style={modal.categorie === 'autre' ? { background: 'rgba(255,255,255,0.28)' } : { border: '1.5px dashed #64748b', color: '#64748b' }}>
                      {modal.categorie === 'autre' ? <Check size={9} strokeWidth={3.5} /> : <Plus size={9} strokeWidth={3} />}
                    </span>
                    Autre catégorie…
                  </button>
                </div>
                {modal.categorie === 'autre' && (
                  <input value={modal.categorieAutre || ''} onChange={(e) => maj({ categorieAutre: e.target.value })} placeholder="Nom de la catégorie (ex. Groupe électrogène)" className="input-base mt-2" />
                )}
              </Tuile>

              <Tuile i={3} className="col-span-6 sm:col-span-3" icone={Banknote} couleur="#16a34a" label="Valeur d'acquisition (FCFA)">
                <input inputMode="numeric" value={modal.valeur} onChange={(e) => maj({ valeur: e.target.value.replace(/[^0-9]/g, '') })} placeholder="ex. 5000000" className="input-base" />
              </Tuile>
              <Tuile i={4} className="col-span-6 sm:col-span-3" icone={CalendarDays} couleur="#f59e0b" label="Date d'acquisition">
                <input type="date" value={modal.dateAcquisition} onChange={(e) => maj({ dateAcquisition: e.target.value })} className="input-base" />
              </Tuile>

              <Tuile i={5} className="col-span-6 sm:col-span-2" icone={Hourglass} couleur="#0ea5e9" label="Amortissement (ans)">
                <input inputMode="numeric" value={modal.dureeAmort} onChange={(e) => maj({ dureeAmort: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder={String(cat?.dureeAmort || 0)} className="input-base" />
              </Tuile>
              <Tuile i={6} className="col-span-6 sm:col-span-2" icone={FileText} couleur="#475569" label="Réf. / n° facture">
                <input value={modal.reference} onChange={(e) => maj({ reference: e.target.value })} className="input-base" />
              </Tuile>
              <Tuile i={7} className="col-span-6 sm:col-span-2" icone={MapPin} couleur="#E8850F" label="Affectation">
                <input value={modal.affectation} onChange={(e) => maj({ affectation: e.target.value })} placeholder="secteur ou site, ex. Kara" className="input-base" />
              </Tuile>

              {cat && (
                <div className="im-tuile col-span-6 flex items-center gap-2 rounded-2xl border border-white/70 bg-white/55 px-3 py-2 text-xs text-gray-600 backdrop-blur-xl" style={{ animation: 'im-entree 0.35s ease-out 0.35s both' }}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={icone3D('#2563eb')}><BookOpen size={11} /></span>
                  <span>Compte SYSCOHADA <span className="font-mono font-semibold text-gray-800">{cat.compte}</span> : {cat.methode !== 'aucune' ? 'amortissable' : "non amortissable (terrain)"}.</span>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Détail : plan d'amortissement */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.libelle || 'Bien sans désignation'}>
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Info label="Valeur brute" value={formatMoney(detail.valeur)} />
              <Info label="Amort. cumulé" value={formatMoney(detail.amort.cumul)} />
              <Info label="VNC actuelle" value={formatMoney(detail.amort.vnc)} />
            </div>
            {!detail.amort.amortissable ? (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500 dark:bg-white/5">Bien non amortissable (ex. terrain) : pas de plan d'amortissement.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                      <th className="px-3 py-2">Année</th>
                      <th className="px-3 py-2 text-right">Dotation ({detail.amort.tauxLineaire.toFixed(1)} %)</th>
                      <th className="px-3 py-2 text-right">Cumul</th>
                      <th className="px-3 py-2 text-right">VNC fin d'année</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                    {detail.amort.annuites.map((a) => (
                      <tr key={a.annee}>
                        <td className="px-3 py-1.5 font-medium">{a.annee}</td>
                        <td className="px-3 py-1.5 text-right">{formatMoney(a.dotation)}</td>
                        <td className="px-3 py-1.5 text-right text-amber-600">{formatMoney(a.cumul)}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{formatMoney(a.vnc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

// Tuile du bento : verre dépoli, petite icône 3D devant le libellé, entrée en cascade (`i` = rang).
function Tuile({ i = 0, className = '', icone: Icone, couleur, label, children }) {
  return (
    <div className={`im-tuile rounded-2xl border border-white/70 bg-white/55 p-2.5 shadow-[0_8px_20px_-14px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl ${className}`}
      style={{ animation: `im-entree 0.35s ease-out ${0.05 * i}s both` }}>
      <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={icone3D(couleur)}><Icone size={11} /></span>
        {label}
      </label>
      {children}
    </div>
  )
}
function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}
function Info({ label, value }) {
  return <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-white/5"><div className="text-xs text-gray-400">{label}</div><div className="font-bold">{value}</div></div>
}

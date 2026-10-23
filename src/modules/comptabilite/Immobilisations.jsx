// COMPTABILITÉ — registre des immobilisations et amortissements (linéaire SYSCOHADA).
import { useMemo, useState } from 'react'
import { Boxes, Plus, Pencil, Trash2, Tag, Banknote, CalendarDays, Hourglass, FileText, MapPin, Check, BookOpen, Sparkles } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { glassModalProps, icone3D } from '../../utils/color'
import { MODULES } from '../../shared/modules'
import { useCompta } from './useCompta'
import { CATEGORIES_IMMO, getCategorieImmo, COL } from './data'
import { planAmortissement } from './logic'
import BandeauCompta, { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'

const COULEUR_COMPTA = MODULES.find((m) => m.id === 'comptabilite')?.color || '#ea580c'
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
        <StatCard title="AMORTISSEMENTS CUMULÉS" value={formatMoney(totaux.amort)} sub="Perte de valeur totale déjà comptabilisée" accent="#f59e0b" icon={Boxes} />
        <StatCard title="VALEUR NETTE COMPTABLE (VNC)" value={formatMoney(totaux.vnc)} sub="Valeur comptable nette restante à amortir" accent="#2563eb" icon={Boxes} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Désignation</th>
                <th className="px-3 py-2.5">Date d'Acquisition</th>
                <th className="px-3 py-2.5">Méthode</th>
                <th className="px-3 py-2.5 text-right">Valeur d'Origine</th>
                <th className="px-3 py-2.5 text-right">Amort. Cumulé</th>
                <th className="px-3 py-2.5 text-right">Valeur Nette (VNC)</th>
                <th className="px-3 py-2.5">Statut</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {enrichies.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Aucun actif immobilisé n'a été enregistré pour le moment.</td></tr>}
              {enrichies.map((im) => (
                <tr key={im.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5" onClick={() => setDetail(im)}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800 dark:text-gray-100">{im.libelle || <span className="italic text-gray-400">Bien sans désignation</span>}</div>
                    <div className="text-xs text-gray-400">{im.categorie === 'autre' ? (im.categorieAutre || 'Autre catégorie') : (im.cat?.label || im.categorie)}{im.affectation ? ` · ${im.affectation}` : ''}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateShort(im.dateAcquisition)}</td>
                  <td className="px-3 py-2">{im.amort.amortissable ? <Badge tone="info">Linéaire · {im.amort.duree} ans</Badge> : <Badge tone="neutral">Non amortissable</Badge>}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatMoney(im.valeur)}</td>
                  <td className="px-3 py-2 text-right text-amber-600">{formatMoney(im.amort.cumul)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(im.amort.vnc)}</td>
                  <td className="px-3 py-2">{im.amort.vnc > 0 ? <Badge tone="success">En service</Badge> : <Badge tone="neutral">Amorti</Badge>}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setModal({ ...im, valeur: String(im.valeur), dureeAmort: String(im.dureeAmort ?? '') })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
                      <button onClick={() => supprimer(im)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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

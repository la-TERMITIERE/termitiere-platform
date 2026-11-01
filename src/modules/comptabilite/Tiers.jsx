// COMPTABILITÉ — Comptabilité Tiers (aligné FEZIRE /accounting/partners).
//  - Clients : comptes calculés depuis les ventes de tous les secteurs et leurs encaissements
//    (compte 411100), avec lettrage : une facture est lettrée quand ses encaissements la soldent.
//  - Fournisseurs : bénéficiaires des dépenses (payé = décaissé, à payer = approuvé non décaissé).
//  - Fiches : coordonnées saisies à la main (inchangé).
import { useMemo, useState } from 'react'
import { Users, Plus, Pencil, Trash2, Download, CheckCircle2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { exportRapportExcel } from '../../utils/excelReport'
import { useCompta } from './useCompta'
import { TYPES_TIERS, COL } from './data'
import BandeauCompta, { OngletsBande, BoutonBande } from './BandeauCompta'
import { LIBELLE_SECTEUR } from '../../shared/ventes'
import { ETATS_CREANCE } from './tresorerie/logic'

const vide = (type) => ({ type, nom: '', compte: TYPES_TIERS[type].compte, telephone: '', email: '', ville: '', note: '' })
const cleNom = (s) => String(s || '').trim().toLowerCase()

export default function Tiers() {
  const { tiers, treso, loading } = useCompta()
  const [recherche, setRecherche] = useState('')
  const [tab, setTab] = useState('client')
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null)

  // Comptes clients : regroupement des ventes par nom de client.
  const clients = useMemo(() => {
    const m = new Map()
    for (const v of treso.creances) {
      const k = cleNom(v.client?.nom) || '(sans nom)'
      const c = m.get(k) || { nom: v.client?.nom || '(sans nom)', ventes: [], facture: 0, encaisse: 0, solde: 0, secteurs: new Set(), derniere: '' }
      c.ventes.push(v); c.facture += v.total; c.encaisse += v.encaisse; c.solde += v.reste; c.secteurs.add(v.secteur)
      if (v.date > c.derniere) c.derniere = v.date
      m.set(k, c)
    }
    return [...m.values()].map((c) => ({ ...c, lettrees: c.ventes.filter((v) => v.reste === 0).length })).sort((a, b) => b.solde - a.solde || b.facture - a.facture)
  }, [treso.creances])

  // Comptes fournisseurs : bénéficiaires des dépenses.
  const fournisseurs = useMemo(() => {
    const m = new Map()
    for (const d of treso.depenses || []) {
      if (!['decaissee', 'approuvee'].includes(d.statut || 'decaissee')) continue
      const nom = d.beneficiaireNom || d.fournisseur || '(non précisé)'
      const k = cleNom(nom)
      const f = m.get(k) || { nom, paye: 0, aPayer: 0, nb: 0, derniere: '', depenses: [] }
      const mt = Number(d.montant) || 0
      if ((d.statut || 'decaissee') === 'decaissee') f.paye += mt; else f.aPayer += mt
      f.nb += 1; f.depenses.push(d)
      const dt = String(d.date || '').slice(0, 10); if (dt > f.derniere) f.derniere = dt
      m.set(k, f)
    }
    return [...m.values()].sort((a, b) => b.aPayer - a.aPayer || b.paye - a.paye)
  }, [treso.depenses])

  const fiches = useMemo(() => (tiers || []), [tiers])
  const listeClients = clients.filter((c) => correspond(recherche, c.nom))
  const listeFournisseurs = fournisseurs.filter((f) => correspond(recherche, f.nom))

  const enregistrer = async () => {
    const v = { type: modal.type, nom: modal.nom.trim(), compte: modal.compte, telephone: modal.telephone || '', email: modal.email || '', ville: modal.ville || '', note: modal.note || '' }
    if (!v.nom) return
    if (modal.id) await updateItem(COL.tiers, modal.id, v)
    else await addItem(COL.tiers, v)
    setModal(null)
  }
  const supprimer = async (t) => { if (confirm(`Supprimer « ${t.nom} » ?`)) await removeItem(COL.tiers, t.id) }

  const exporter = () => exportRapportExcel({
    filename: `tiers-${tab}-${todayStr()}.xlsx`,
    sections: [tab === 'fournisseur'
      ? { name: 'Fournisseurs', title: 'Comptes fournisseurs', subtitle: `Au ${todayStr()}`, columns: [{ key: 'nom', label: 'Fournisseur / bénéficiaire', width: 30 }, { key: 'nb', label: 'Dépenses', width: 10 }, { key: 'paye', label: 'Payé', width: 14 }, { key: 'aPayer', label: 'À payer', width: 14 }], rows: listeFournisseurs }
      : { name: 'Clients', title: 'Comptes clients (411100)', subtitle: `Au ${todayStr()}`, columns: [{ key: 'nom', label: 'Client', width: 30 }, { key: 'nb', label: 'Factures', width: 10 }, { key: 'facture', label: 'Facturé', width: 14 }, { key: 'encaisse', label: 'Encaissé', width: 14 }, { key: 'solde', label: 'Solde', width: 14 }], rows: listeClients.map((c) => ({ ...c, nb: c.ventes.length })) }]
  })

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <BandeauCompta icone={Users} titre="Comptabilité Tiers" sous="Comptes clients et fournisseurs calculés depuis les ventes et les dépenses de tous les secteurs, avec lettrage des factures.">
        <OngletsBande options={[{ id: 'client', label: 'Clients' }, { id: 'fournisseur', label: 'Fournisseurs' }, { id: 'fiches', label: 'Fiches tiers' }]} valeur={tab} onChange={setTab} />
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un tiers par nom…" />
        {tab !== 'fiches' && <BoutonBande icone={Download} plein={false} onClick={exporter}>Excel</BoutonBande>}
        {tab === 'fiches' && <BoutonBande icone={Plus} onClick={() => setModal(vide('client'))}>Nouvelle fiche</BoutonBande>}
      </BandeauCompta>

      {tab === 'client' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard title="Total créances clients" value={formatMoney(clients.reduce((s, c) => s + c.solde, 0))} accent="#0ea5e9" icon={Users} />
            <StatCard title="Facturé (toutes périodes)" value={formatMoney(clients.reduce((s, c) => s + c.facture, 0))} accent="#0d9488" icon={Users} />
            <StatCard title="Clients" value={clients.length} accent="#7c3aed" icon={Users} />
            <StatCard title="Clients débiteurs" value={clients.filter((c) => c.solde > 0).length} accent="#dc2626" icon={Users} />
          </div>
          <Card className="!p-0 overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Registre des créances clients (411100)</p><p className="text-xs text-gray-500">Touchez un client pour voir ses factures, ses encaissements et le lettrage.</p></div>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50"><tr className="text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Client</th><th className="px-3 py-2">Secteurs</th><th className="px-3 py-2 text-right">Factures</th><th className="px-3 py-2 text-right">Facturé</th><th className="px-3 py-2 text-right">Encaissé</th><th className="px-3 py-2 text-right">Solde</th><th className="px-3 py-2">Lettrage</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {listeClients.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Aucun client.</td></tr>}
                  {listeClients.slice(0, 300).map((c) => (
                    <tr key={c.nom} onClick={() => setDetail(c)} className="cursor-pointer hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{c.nom}</td><td className="px-3 py-2 text-xs text-gray-500">{[...c.secteurs].map((s) => LIBELLE_SECTEUR[s]).join(', ')}</td>
                      <td className="px-3 py-2 text-right">{c.ventes.length}</td><td className="px-3 py-2 text-right">{formatMoney(c.facture)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{formatMoney(c.encaisse)}</td><td className={`px-3 py-2 text-right font-bold ${c.solde > 0 ? 'text-red-600' : ''}`}>{formatMoney(c.solde)}</td>
                      <td className="px-3 py-2">{c.solde === 0 ? <Badge tone="success"><CheckCircle2 size={11} /> Lettré</Badge> : <Badge tone="warning">{c.lettrees}/{c.ventes.length}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'fournisseur' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard title="Dettes : à payer" value={formatMoney(fournisseurs.reduce((s, f) => s + f.aPayer, 0))} sub="Dépenses approuvées, pas encore décaissées." accent="#dc2626" icon={Users} />
            <StatCard title="Payé" value={formatMoney(fournisseurs.reduce((s, f) => s + f.paye, 0))} accent="#16a34a" icon={Users} />
            <StatCard title="Fournisseurs / bénéficiaires" value={fournisseurs.length} accent="#0d9488" icon={Users} />
          </div>
          <Card className="!p-0 overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Registre des dettes fournisseurs</p><p className="text-xs text-gray-500">Bénéficiaires des dépenses d'E-DÉPENSES.</p></div>
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Fournisseur / bénéficiaire</th><th className="px-3 py-2 text-right">Dépenses</th><th className="px-3 py-2">Dernière</th><th className="px-3 py-2 text-right">Payé</th><th className="px-3 py-2 text-right">À payer</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {listeFournisseurs.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Aucun fournisseur.</td></tr>}
                {listeFournisseurs.slice(0, 300).map((f) => (
                  <tr key={f.nom}><td className="px-3 py-2 font-medium">{f.nom}</td><td className="px-3 py-2 text-right">{f.nb}</td><td className="px-3 py-2 font-mono text-xs">{f.derniere ? formatDateShort(f.derniere) : '—'}</td>
                    <td className="px-3 py-2 text-right text-green-700">{formatMoney(f.paye)}</td><td className={`px-3 py-2 text-right font-bold ${f.aPayer > 0 ? 'text-red-600' : ''}`}>{formatMoney(f.aPayer)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'fiches' && (
        <Card className="!p-0 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Fiches tiers</p><p className="text-xs text-gray-500">Coordonnées et compte de rattachement saisis à la main.</p></div>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2.5">Nom</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Compte</th><th className="px-3 py-2.5">Contact</th><th className="w-16"></th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {fiches.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Aucune fiche.</td></tr>}
              {fiches.filter((t) => correspond(recherche, t.nom, t.telephone, t.email)).map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-800">{t.nom}{t.ville ? <span className="text-xs text-gray-400"> · {t.ville}</span> : ''}</td>
                  <td className="px-3 py-2"><Badge tone={TYPES_TIERS[t.type || 'client']?.tone}>{TYPES_TIERS[t.type || 'client']?.label}</Badge></td>
                  <td className="px-3 py-2 font-mono text-xs">{t.compte}</td><td className="px-3 py-2 text-gray-500">{t.telephone || t.email || '—'}</td>
                  <td className="px-2 py-2"><div className="flex justify-end gap-1">
                    <button onClick={() => setModal({ ...t })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={14} /></button>
                    <button onClick={() => supprimer(t)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail ? `Compte client : ${detail.nom}` : ''} footer={<Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>}>
        {detail && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Facturé {formatMoney(detail.facture)} · encaissé {formatMoney(detail.encaisse)} · solde <b className={detail.solde ? 'text-red-600' : 'text-green-700'}>{formatMoney(detail.solde)}</b></p>
            <div className="max-h-96 overflow-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50"><tr className="text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Pièce</th><th className="px-3 py-2 text-right">Débit</th><th className="px-3 py-2 text-right">Crédit</th><th className="px-3 py-2">Lettre</th></tr></thead>
                <tbody>
                  {detail.ventes.slice().sort((a, b) => a.date.localeCompare(b.date)).flatMap((v, i) => {
                    const lettre = v.reste === 0 ? String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '') : ''
                    return [
                      <tr key={v.cle} className="border-t border-gray-100"><td className="px-3 py-1.5 font-mono text-xs">{formatDateShort(v.date)}</td><td className="px-3 py-1.5">{v.numero} <span className="text-[11px] text-gray-400">{LIBELLE_SECTEUR[v.secteur]}</span> {v.reste > 0 && <Badge tone={ETATS_CREANCE[v.etat]?.tone}>{ETATS_CREANCE[v.etat]?.label}</Badge>}</td><td className="px-3 py-1.5 text-right">{formatMoney(v.total)}</td><td /><td className="px-3 py-1.5 font-mono font-bold text-green-700">{lettre}</td></tr>,
                      ...v.encaissements.map((e) => <tr key={e.id} className="text-xs text-gray-600"><td className="px-3 py-1 font-mono">{formatDateShort(e.date)}</td><td className="px-6 py-1">Encaissement{e.reference ? ` ${e.reference}` : ''}</td><td /><td className="px-3 py-1 text-right">{formatMoney(e.montant)}</td><td className="px-3 py-1 font-mono font-bold text-green-700">{lettre}</td></tr>)
                    ]
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le tiers' : 'Nouvelle fiche tiers'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={enregistrer}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <Champ label="Type"><select value={modal.type} onChange={(e) => setModal({ ...modal, type: e.target.value, compte: TYPES_TIERS[e.target.value].compte })} className="input-base"><option value="client">Client</option><option value="fournisseur">Fournisseur</option></select></Champ>
            <Champ label="Nom / Raison sociale"><input value={modal.nom} onChange={(e) => setModal({ ...modal, nom: e.target.value })} className="input-base" /></Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Compte de rattachement"><input value={modal.compte} onChange={(e) => setModal({ ...modal, compte: e.target.value.replace(/[^0-9]/g, '') })} className="input-base font-mono" /></Champ>
              <Champ label="Téléphone"><input value={modal.telephone} onChange={(e) => setModal({ ...modal, telephone: e.target.value })} className="input-base" /></Champ>
              <Champ label="Email"><input value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} className="input-base" /></Champ>
              <Champ label="Ville"><input value={modal.ville} onChange={(e) => setModal({ ...modal, ville: e.target.value })} className="input-base" /></Champ>
            </div>
            <Champ label="Note"><textarea rows={2} value={modal.note} onChange={(e) => setModal({ ...modal, note: e.target.value })} className="input-base" /></Champ>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}

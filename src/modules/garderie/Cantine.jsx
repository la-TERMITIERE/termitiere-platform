import { useMemo, useState, useEffect } from 'react'
import { Plus, UtensilsCrossed, ChevronLeft, ChevronRight, Pencil, CheckCircle2, Clock, Trash2, Milk, CalendarDays } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { useGarderieStore } from './store/garderieStore'
import { journaliersActifsSurDate } from './logic'
import { removeItem } from '../../core/db'

// Calcule l'âge en mois
function ageMois(dateNaissance) {
  if (!dateNaissance) return null
  const naissance = new Date(dateNaissance)
  const now = new Date()
  return (now.getFullYear() - naissance.getFullYear()) * 12 + (now.getMonth() - naissance.getMonth())
}

// Intervalle recommandé entre biberons selon l'âge (en minutes)
function intervalleRecommande(mois) {
  if (mois < 2) return 120   // 0-2 mois → 2h
  if (mois < 4) return 180   // 2-4 mois → 3h
  return 210                 // 4-6 mois → 3h30
}

// Convertit "HH:MM" en minutes depuis minuit
function heureEnMinutes(heure) {
  if (!heure) return null
  const [h, m] = heure.split(':').map(Number)
  return h * 60 + m
}

// Extrait un nombre de mois depuis un texte libre (ex: "3 mois", "5 m", "4") — sert
// à la fois pour `ageSaisi` (enfants inscrits) et `ageApprox` (journaliers), qui
// n'ont pas toujours de date de naissance exacte.
function moisDepuisTexte(texte) {
  if (!texte) return null
  const match = String(texte).match(/(\d+)\s*(mois?|m)?/i)
  if (!match) return null
  const uniteMois = !match[2] || /mois?|m/i.test(match[2])
  return uniteMois ? Number(match[1]) : null
}

const TYPES_LAIT = [
  { id: 'maternel', label: 'Lait maternel' },
  { id: 'artificiel', label: 'Lait artificiel' },
  { id: 'autre', label: 'Autre' }
]

const OBSERVATIONS_BIBERON = [
  { id: 'bien', label: '✅ A bien bu' },
  { id: 'partiel', label: '🟡 Bu partiellement' },
  { id: 'refus', label: '❌ Refus' },
  { id: 'regurgitation', label: '⚠️ Régurgitation' }
]

function repasMenuActuel(menu) {
  if (!menu) return null
  const h = new Date().getHours()
  if (h < 10) return { label: '🌅 Petit-déjeuner', desc: menu.petitDejeuner }
  if (h < 15) return { label: '🍛 Déjeuner',       desc: menu.dejeuner }
  return              { label: '🍎 Goûter',          desc: menu.gouter }
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const emptyMenu = () => ({ petitDejeuner: '', dejeuner: '', gouter: '', notes: '' })

export default function Cantine() {
  const { user } = useAuth()
  const deletedEnfantIds = useGarderieStore((s) => s.deletedEnfantIds)
  const params           = useGarderieStore((s) => s.params)

  const { data: enfants }     = useCollection('garderie_enfants')
  const { data: presences }   = useCollection('garderie_presences')
  const { data: menus }       = useCollection('garderie_menus')
  const { data: repas }       = useCollection('garderie_repas')
  const { data: journaliers } = useCollection('garderie_journaliers')
  const { data: nutrition }   = useCollection('garderie_nutrition')

  const today = todayStr()
  const [onglet, setOnglet]         = useState('menu')
  const [dateFiltre, setDateFiltre] = useState(today)
  const [menuModal, setMenuModal]   = useState(null)
  const [saving, setSaving]             = useState(false)
  const [saisiSpecial, setSaisiSpecial] = useState({})
  const [savingTous, setSavingTous]     = useState(false)
  const [biberonModal, setBiberonModal] = useState(null)
  const [biberonForm, setBiberonForm]   = useState({ heure: new Date().toTimeString().slice(0,5), typeLait: 'artificiel', quantite: '', observation: 'bien', notes: '' })
  const [heureActuelle, setHeureActuelle] = useState(new Date().toTimeString().slice(0,5))

  // Mise à jour de l'heure chaque minute pour les rappels
  useEffect(() => {
    const timer = setInterval(() => {
      setHeureActuelle(new Date().toTimeString().slice(0,5))
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  const isToday = dateFiltre === today

  // Vérifie si la garderie est actuellement ouverte (entre heureOuverture et heureFermeture)
  const garderieOuverte = useMemo(() => {
    const maintenant = heureEnMinutes(heureActuelle)
    const ouverture  = heureEnMinutes(params.heureOuverture  || '07:00')
    const fermeture  = heureEnMinutes(params.heureFermeture || '18:00')
    return maintenant >= ouverture && maintenant < fermeture
  }, [heureActuelle, params])

  // IDs des enfants présents ce jour (pointage arrivée effectué)
  const enfantsPresentsIds = useMemo(() => new Set(
    presences
      .filter((p) => p.date === dateFiltre && p.enfantId && !p.personnelId && p.statut === 'present')
      .map((p) => p.enfantId)
  ), [presences, dateFiltre])

  // Nourrissons < 6 mois ET présents ce jour — inscrits (via date de naissance ou
  // ageSaisi) ET journaliers (via ageApprox, seule info d'âge dont ils disposent).
  const nourrissons = useMemo(() => {
    const inscrits = enfants
      .filter((e) => {
        if (e.statut !== 'actif' || deletedEnfantIds.has(e.id)) return false
        if (!enfantsPresentsIds.has(e.id)) return false
        // Vérification par date de naissance
        const m = ageMois(e.dateNaissance)
        if (m !== null) return m < 6
        // Vérification par âge saisi (ex: "3 mois", "5 mois", "4")
        const mTexte = moisDepuisTexte(e.ageSaisi)
        if (mTexte !== null && mTexte < 6) return true
        // Groupe nourrisson sans date → inclure par sécurité
        if (e.groupe === 'nourrisson') return true
        return false
      })
      .map((e) => ({ ...e, ageMoisVal: ageMois(e.dateNaissance) ?? moisDepuisTexte(e.ageSaisi) }))

    const journaliersNourrissons = journaliersActifsSurDate(journaliers, dateFiltre)
      .map((j) => ({ ...j, ageMoisVal: moisDepuisTexte(j.ageApprox), _typeEnfant: 'journalier' }))
      .filter((j) => j.ageMoisVal !== null && j.ageMoisVal < 6)

    return [...inscrits, ...journaliersNourrissons]
      .sort((a, b) => (a.ageMoisVal ?? 99) - (b.ageMoisVal ?? 99))
  }, [enfants, deletedEnfantIds, enfantsPresentsIds, journaliers, dateFiltre])

  // Biberons du jour par enfant
  const biberonsDuJour = useMemo(() => {
    const map = {}
    nutrition
      .filter((n) => n.date === dateFiltre && n.type === 'biberon')
      .forEach((n) => {
        if (!map[n.enfantId]) map[n.enfantId] = []
        map[n.enfantId].push(n)
      })
    // Trier par heure
    Object.keys(map).forEach((k) => map[k].sort((a, b) => (a.heure > b.heure ? 1 : -1)))
    return map
  }, [nutrition, dateFiltre])

  async function enregistrerBiberon() {
    if (!biberonModal) return
    if (!biberonForm.quantite || Number(biberonForm.quantite) <= 0)
      return toast.error('Quantité requise')
    const id = genId()
    await setItem('garderie_nutrition', id, {
      id,
      type: 'biberon',
      enfantId: biberonModal.id,
      enfantNom: `${biberonModal.prenom} ${biberonModal.nom}`,
      date: dateFiltre,
      heure: biberonForm.heure,
      typeLait: biberonForm.typeLait,
      quantite: Number(biberonForm.quantite),
      observation: biberonForm.observation,
      notes: biberonForm.notes
    })
    audit('garderie', 'BIBERON_ADD', `${biberonModal.prenom} ${biberonModal.nom}`, { quantite: biberonForm.quantite })
    toast.success(`Biberon enregistré ✓`)
    setBiberonModal(null)
    setBiberonForm({ heure: new Date().toTimeString().slice(0,5), typeLait: 'artificiel', quantite: '', observation: 'bien', notes: '' })
  }

  async function supprimerBiberon(id) {
    await removeItem('garderie_nutrition', id)
    toast.success('Biberon supprimé ✓')
  }

  const menuDuJour = useMemo(
    () => menus.find((m) => m.date === dateFiltre) || null,
    [menus, dateFiltre]
  )

  // Enfants présents actifs uniquement
  const enfantsActifs = useMemo(() =>
    enfants
      .filter((e) => e.statut === 'actif' && !deletedEnfantIds.has(e.id) && enfantsPresentsIds.has(e.id))
      .sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1),
    [enfants, deletedEnfantIds, enfantsPresentsIds]
  )

  const journaliersJour = useMemo(() =>
    journaliersActifsSurDate(journaliers, dateFiltre)
      .map((j) => ({ ...j, _typeEnfant: 'journalier' }))
      .sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1),
    [journaliers, dateFiltre]
  )

  const tousEnfants = useMemo(() =>
    [...enfantsActifs.map((e) => ({ ...e, _typeEnfant: 'inscrit' })), ...journaliersJour],
    [enfantsActifs, journaliersJour]
  )

  const repasParEnfant = useMemo(() => {
    const map = {}
    repas.filter((r) => r.date === dateFiltre).forEach((r) => { map[r.enfantRef] = r })
    return map
  }, [repas, dateFiltre])

  const stats = useMemo(() => {
    let menuNormal = 0
    let special = 0
    let apporte = 0
    tousEnfants.forEach((e) => {
      const ref = e._typeEnfant === 'journalier' ? `j_${e.id}` : e.id
      const r = repasParEnfant[ref]
      if (r?.typeRepas === 'menu')    menuNormal++
      if (r?.typeRepas === 'special') special++
      if (r?.typeRepas === 'apporte') apporte++
    })
    return { total: tousEnfants.length, menuNormal, special, apporte }
  }, [repasParEnfant, tousEnfants])

  async function handleSaveMenu() {
    if (saving) return
    const d = menuModal.data
    if (!d.dejeuner.trim()) return toast.error('Le déjeuner est requis')
    setSaving(true)
    try {
      await setItem('garderie_menus', dateFiltre, { ...d, date: dateFiltre, id: dateFiltre })
      audit('garderie', 'MENU_SAVE', formatDateShort(dateFiltre))
      toast.success('Menu enregistré ✓')
      setMenuModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function servirRepas(champ) {
    if (!menuDuJour) return
    const heure = new Date().toTimeString().slice(0, 5)
    await setItem('garderie_menus', dateFiltre, { ...menuDuJour, [champ]: heure, id: dateFiltre })
    audit('garderie', 'REPAS_SERVI', champ, { date: dateFiltre, heure })
    toast.success(`Servi à ${heure} ✓`)
  }

  function refEnfant(enfant) {
    return enfant._typeEnfant === 'journalier' ? `j_${enfant.id}` : enfant.id
  }

  async function cocherRepas(enfant, typeRepas) {
    const ref = refEnfant(enfant)
    const existant = repasParEnfant[ref]
    const id = `repas_${ref}_${dateFiltre}`

    if (existant?.typeRepas === typeRepas) {
      await setItem('garderie_repas', id, { ...existant, typeRepas: '' })
      return
    }
    if (typeRepas === 'special') {
      setSaisiSpecial((prev) => ({ ...prev, [ref]: existant?.descriptionSpecial || '' }))
      return
    }
    const repasActuel = typeRepas === 'menu' ? repasMenuActuel(menuDuJour) : null
    await setItem('garderie_repas', id, {
      id, date: dateFiltre, enfantRef: ref,
      enfantNom: `${enfant.prenom} ${enfant.nom}`,
      typeEnfant: enfant._typeEnfant || 'inscrit',
      typeRepas,
      repasLabel: typeRepas === 'apporte' ? '🍱 Repas apporté' : (repasActuel?.label || ''),
      repasDesc: repasActuel?.desc || '',
      descriptionSpecial: '',
      appetit: existant?.appetit || ''
    })
    audit('garderie', 'REPAS_SAVE', `${enfant.prenom} ${enfant.nom}`, { date: dateFiltre, typeRepas })
  }

  async function tousAuMenu() {
    if (savingTous || tousEnfants.length === 0) return
    setSavingTous(true)
    const repasActuel = repasMenuActuel(menuDuJour)
    try {
      await Promise.all(tousEnfants.map((enfant) => {
        const ref = refEnfant(enfant)
        const existant = repasParEnfant[ref]
        if (existant?.typeRepas === 'special' || existant?.typeRepas === 'apporte') return Promise.resolve()
        const id = `repas_${ref}_${dateFiltre}`
        return setItem('garderie_repas', id, {
          id, date: dateFiltre, enfantRef: ref,
          enfantNom: `${enfant.prenom} ${enfant.nom}`,
          typeEnfant: enfant._typeEnfant || 'inscrit',
          typeRepas: 'menu',
          repasLabel: repasActuel?.label || '',
          repasDesc: repasActuel?.desc || '',
          descriptionSpecial: '',
          appetit: existant?.appetit || ''
        })
      }))
      audit('garderie', 'REPAS_TOUS_MENU', `${tousEnfants.length} enfant(s)`, { date: dateFiltre })
      toast.success(`${tousEnfants.length} enfant(s) marqué(s) au menu ✓`)
    } finally {
      setSavingTous(false)
    }
  }

  async function validerSpecialInline(enfant) {
    const ref = refEnfant(enfant)
    const texte = (saisiSpecial[ref] || '').trim()
    if (!texte) return toast.error('Saisissez le repas spécial')
    const existant = repasParEnfant[ref]
    await setItem('garderie_repas', `repas_${ref}_${dateFiltre}`, {
      id: `repas_${ref}_${dateFiltre}`, date: dateFiltre, enfantRef: ref,
      enfantNom: `${enfant.prenom} ${enfant.nom}`,
      typeEnfant: enfant._typeEnfant || 'inscrit',
      typeRepas: 'special',
      repasLabel: '⭐ Repas spécial',
      repasDesc: texte,
      descriptionSpecial: texte,
      appetit: existant?.appetit || ''
    })
    setSaisiSpecial((prev) => { const n = { ...prev }; delete n[ref]; return n })
    audit('garderie', 'REPAS_SAVE', `${enfant.prenom} ${enfant.nom}`, { date: dateFiltre, typeRepas: 'special' })
    toast.success('Repas spécial enregistré ✓')
  }

  const setMenu = (k, v) => setMenuModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  return (
    <div className="space-y-5">

      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,57,14,0.35),0_8px_20px_-8px_rgba(232,57,14,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(232,57,14,0.85) 0%, rgba(245,168,0,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#E8390E', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <UtensilsCrossed size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Cantine & Repas</h2>
          <p className="text-sm text-white/80">Biberons, repas et suivi nutritionnel du jour</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'menu',        label: '🍽️ Menu du jour' },
          { id: 'repas',       label: '🧒 Repas des enfants' },
          { id: 'nourrissons', label: `🍼 Nourrissons${nourrissons.length > 0 ? ` (${nourrissons.length})` : ''}` }
        ].map((t) => (
          <button key={t.id} onClick={() => setOnglet(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              onglet === t.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Sélecteur de date */}
      <div className="flex items-center gap-3">
        <button onClick={() => setDateFiltre(addDays(dateFiltre, -1))}
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronLeft size={16} /></button>
        <Input type="date" value={dateFiltre} max={today}
          onChange={(e) => setDateFiltre(e.target.value)} />
        <button onClick={() => setDateFiltre(addDays(dateFiltre, 1))} disabled={dateFiltre >= today}
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 disabled:opacity-30"><ChevronRight size={16} /></button>
        {!isToday && (
          <button onClick={() => setDateFiltre(today)}
            className="rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-200">
            Aujourd'hui
          </button>
        )}
        <span className="ml-2 text-sm font-semibold text-gray-600">{formatDateShort(dateFiltre)}</span>
      </div>

      {/* ══ MENU DU JOUR ══ */}
      {onglet === 'menu' && (
        <div className="space-y-4">
          {menuDuJour ? (
            <Card>
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <UtensilsCrossed size={18} className="text-orange-500" /> Menu du {formatDateShort(dateFiltre)}
                </h3>
                {garderieOuverte ? (
                  <Button variant="outline" onClick={() => setMenuModal({ data: { ...emptyMenu(), ...menuDuJour } })}>
                    <Pencil size={14} /> Modifier
                  </Button>
                ) : (
                  <span className="text-xs text-gray-400 italic">🔒 Fermée</span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: '🌅 Petit-déjeuner', desc: menuDuJour.petitDejeuner, champ: 'heurePetitDejeuner', heureServie: menuDuJour.heurePetitDejeuner },
                  { label: '🍛 Déjeuner',       desc: menuDuJour.dejeuner,      champ: 'heureDejeuner',      heureServie: menuDuJour.heureDejeuner },
                  { label: '🍎 Goûter',          desc: menuDuJour.gouter,        champ: 'heureGouter',        heureServie: menuDuJour.heureGouter }
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-orange-50 p-3 flex flex-col gap-2">
                    <p className="text-xs font-bold text-orange-600">{item.label}</p>
                    <p className="text-sm text-gray-800 flex-1">
                      {item.desc || <span className="italic text-gray-400">Non renseigné</span>}
                    </p>
                    {item.heureServie ? (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                          <CheckCircle2 size={13} /> Servi à {item.heureServie}
                        </span>
                        {isToday && (
                          <button onClick={() => servirRepas(item.champ)}
                            className="text-[10px] text-gray-400 hover:text-orange-500 underline">corriger</button>
                        )}
                      </div>
                    ) : isToday && garderieOuverte ? (
                      <button onClick={() => servirRepas(item.champ)}
                        className="flex items-center justify-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors">
                        <Clock size={12} /> Servir maintenant
                      </button>
                    ) : isToday && !garderieOuverte ? (
                      <span className="text-xs text-gray-300 italic">Garderie fermée</span>
                    ) : (
                      <span className="text-xs text-gray-300 italic">Non servi</span>
                    )}
                  </div>
                ))}
              </div>
              {menuDuJour.notes && (
                <p className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                  ⚠️ <span className="font-semibold">Infos importantes :</span> {menuDuJour.notes}
                </p>
              )}
            </Card>
          ) : (
            <Card>
              <div className="flex flex-col items-center gap-3 py-8">
                <UtensilsCrossed size={40} className="text-gray-300" />
                <p className="text-gray-400 text-sm">Aucun menu saisi pour ce jour.</p>
                {garderieOuverte ? (
                  <Button onClick={() => setMenuModal({ data: emptyMenu() })}>
                    <Plus size={16} /> Saisir le menu du jour
                  </Button>
                ) : (
                  <p className="text-xs text-gray-400 italic">🔒 Garderie fermée — saisie impossible après {params.heureFermeture || '18:00'}</p>
                )}
              </div>
            </Card>
          )}

          {enfantsActifs.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Enfants à table',  val: stats.total,      color: 'text-orange-600' },
                { label: 'Menu du jour',     val: stats.menuNormal, color: 'text-green-600'  },
                { label: 'Repas spécial',    val: stats.special,    color: 'text-blue-600'   },
                { label: 'Repas apporté',    val: stats.apporte,    color: 'text-amber-600'  },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm">
                  <p className={`text-2xl font-extrabold ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ REPAS DES ENFANTS ══ */}
      {onglet === 'repas' && (
        <div className="space-y-3">
          {!menuDuJour && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              ⚠️ Aucun menu saisi pour ce jour. Allez dans l'onglet <strong>Menu du jour</strong> pour le renseigner.
            </div>
          )}

          {tousEnfants.length > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-green-800">Tous les enfants ont mangé le menu du jour ?</p>
                <p className="text-xs text-green-600">
                  {repasMenuActuel(menuDuJour)?.label} — {repasMenuActuel(menuDuJour)?.desc || 'Menu non renseigné'}
                </p>
              </div>
              {garderieOuverte ? (
                <Button onClick={tousAuMenu} loading={savingTous}
                  className="bg-green-600 hover:bg-green-700 text-white shrink-0">
                  <CheckCircle2 size={16} /> Tous au menu
                </Button>
              ) : (
                <span className="text-xs text-gray-400 italic shrink-0">Garderie fermée</span>
              )}
            </div>
          )}

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Enfant</th>
                  <th className="px-3 py-2 text-center">🍛 Menu du jour</th>
                  <th className="px-3 py-2 text-center">⭐ Repas spécial</th>
                  <th className="px-3 py-2 text-center">🍱 Apporté par le parent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tousEnfants.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">
                    Aucun enfant présent ce jour. Marquez les arrivées dans le module <strong>Présences</strong>.
                  </td></tr>
                )}
                {tousEnfants.map((e) => {
                  const ref = refEnfant(e)
                  const r = repasParEnfant[ref]
                  const isMenu    = r?.typeRepas === 'menu'
                  const isSpecial = r?.typeRepas === 'special'
                  const isApporte = r?.typeRepas === 'apporte'
                  const saisieActive = ref in saisiSpecial
                  return (
                    <tr key={ref} className="transition-colors hover:bg-orange-50">
                      <td className="px-3 py-3">
                        <p className="font-semibold">{e.prenom} {e.nom}</p>
                        {e._typeEnfant === 'journalier' && (
                          <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 rounded px-1">Journalier</span>
                        )}
                        {e.apporteRepas && (
                          <span className="ml-1 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded px-1">🍱 apporte son repas</span>
                        )}
                        {e.allergies && <p className="text-xs text-orange-500">⚠ {e.allergies}</p>}
                      </td>

                      {/* Bouton Menu */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button onClick={() => garderieOuverte && cocherRepas(e, 'menu')}
                            disabled={!garderieOuverte}
                            title={!garderieOuverte ? 'Garderie fermée — saisie impossible' : ''}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                              isMenu ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
                            } ${!garderieOuverte ? 'opacity-40 cursor-not-allowed' : ''}`}>
                            {isMenu && <CheckCircle2 size={15} />} Menu
                          </button>
                          {isMenu && r.repasDesc && (
                            <div className="mt-1 rounded-lg bg-green-50 px-2 py-1 text-center max-w-[180px]">
                              <p className="text-[10px] font-semibold text-green-600">{r.repasLabel}</p>
                              <p className="text-xs text-green-800">{r.repasDesc}</p>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Bouton Spécial + saisie inline */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            disabled={!garderieOuverte}
                            title={!garderieOuverte ? 'Garderie fermée — saisie impossible' : ''}
                            onClick={() => garderieOuverte && (isSpecial
                              ? setSaisiSpecial((prev) => ({ ...prev, [ref]: r.repasDesc || '' }))
                              : cocherRepas(e, 'special'))
                            }
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                              isSpecial ? 'bg-blue-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-700'
                            }`}>
                            {isSpecial && <CheckCircle2 size={15} />} Spécial
                          </button>

                          {saisieActive && (
                            <div className="mt-1 flex flex-col gap-1 w-full max-w-[200px]">
                              <input
                                className="w-full rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                                placeholder="ex: Riz + poisson sans sauce…"
                                autoFocus
                                value={saisiSpecial[ref]}
                                onChange={(ev) => setSaisiSpecial((prev) => ({ ...prev, [ref]: ev.target.value }))}
                                onKeyDown={(ev) => { if (ev.key === 'Enter') validerSpecialInline(e) }}
                              />
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => validerSpecialInline(e)}
                                  className="rounded-lg bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-blue-600">
                                  ✓ OK
                                </button>
                                <button onClick={() => setSaisiSpecial((prev) => { const n = { ...prev }; delete n[ref]; return n })}
                                  className="rounded-lg bg-gray-200 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-300">
                                  Annuler
                                </button>
                              </div>
                            </div>
                          )}

                          {isSpecial && r.repasDesc && !saisieActive && (
                            <div className="mt-1 rounded-lg bg-blue-50 px-2 py-1 text-center max-w-[180px]">
                              <p className="text-xs text-blue-800 italic">{r.repasDesc}</p>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Bouton Repas apporté par le parent */}
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => garderieOuverte && cocherRepas(e, 'apporte')}
                          disabled={!garderieOuverte}
                          title={!garderieOuverte ? 'Garderie fermée — saisie impossible' : "L'enfant a apporté son propre repas"}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                            isApporte ? 'bg-amber-500 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-700'
                          } ${!garderieOuverte ? 'opacity-40 cursor-not-allowed' : ''}`}>
                          {isApporte && <CheckCircle2 size={15} />} Apporté
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ══ NOURRISSONS ══ */}
      {onglet === 'nourrissons' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold mb-0.5">🍼 Suivi nutritionnel — Enfants de moins de 6 mois</p>
            <p>Ces enfants sont encore en alimentation <strong>exclusivement liquide</strong> (lait). Enregistrez chaque biberon donné dans la journée : heure, type de lait, quantité et observation.</p>
          </div>

          {nourrissons.length === 0 ? (
            <Card>
              <p className="py-8 text-center text-sm text-gray-400">
                Aucun nourrisson présent ce jour.<br/>
                <span className="text-xs">Les nourrissons apparaissent ici quand leur arrivée est enregistrée dans <strong>Présences</strong>.</span>
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {nourrissons.map((e) => {
                const biberons    = biberonsDuJour[e.id] || []
                const totalMl     = biberons.reduce((s, b) => s + (Number(b.quantite) || 0), 0)
                const semaines    = e.ageMoisVal !== null ? Math.floor(e.ageMoisVal * 4.33) : 0
                const intervalle  = intervalleRecommande(e.ageMoisVal ?? 3)
                const dernierBib  = biberons.length > 0 ? biberons[biberons.length - 1] : null
                const maintenant  = heureEnMinutes(heureActuelle)
                const dernierH    = dernierBib ? heureEnMinutes(dernierBib.heure) : null
                const minutesDep  = dernierH !== null ? maintenant - dernierH : null

                // Utilise la variable garderieOuverte du composant (ouverture ET fermeture)
                const heureOuv = heureEnMinutes(params.heureOuverture || '07:00')
                const heureFer = heureEnMinutes(params.heureFermeture || '18:00')
                const nourrissonPeutManger = maintenant >= heureOuv && maintenant < heureFer

                // Rappel actif seulement si la garderie est ouverte ET c'est l'heure du biberon
                const rappelActif  = isToday && nourrissonPeutManger && minutesDep !== null && minutesDep >= intervalle
                const rappelJamais = isToday && nourrissonPeutManger && biberons.length === 0

                // Prochain biberon prévu
                const prochainMin = dernierH !== null ? dernierH + intervalle : null
                const prochainH   = prochainMin !== null
                  ? `${String(Math.floor(prochainMin / 60)).padStart(2,'0')}:${String(prochainMin % 60).padStart(2,'0')}`
                  : null
                // Ne pas afficher le prochain biberon si c'est après la fermeture
                const prochainAvantFermeture = prochainMin !== null && prochainMin < heureFer && prochainMin >= heureOuv

                return (
                  <Card key={e.id}>
                    {/* Rappel biberon */}
                    {rappelActif && (
                      <div className="mb-3 rounded-xl border-2 border-orange-400 bg-orange-50 px-3 py-2 flex items-center gap-2">
                        <Clock size={16} className="text-orange-500 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-orange-700">
                            ⏰ C'est l'heure du biberon de {e.prenom} !
                          </p>
                          <p className="text-[10px] text-orange-500">
                            Dernier biberon il y a {Math.round(minutesDep / 60)}h{minutesDep % 60 > 0 ? `${minutesDep % 60}` : ''} · Intervalle recommandé : {Math.round(intervalle / 60)}h{intervalle % 60 > 0 ? `${intervalle % 60}` : ''}
                          </p>
                        </div>
                      </div>
                    )}
                    {rappelJamais && (
                      <div className="mb-3 rounded-xl border border-yellow-300 bg-yellow-50 px-3 py-2 flex items-center gap-2">
                        <Clock size={14} className="text-yellow-500 shrink-0" />
                        <p className="text-xs text-yellow-700 font-semibold">
                          🟡 Aucun biberon enregistré aujourd'hui pour {e.prenom}
                        </p>
                      </div>
                    )}

                    {/* En-tête enfant */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-bold text-gray-800">
                          {e.prenom} {e.nom}
                          {e._typeEnfant === 'journalier' && (
                            <span className="ml-1.5 text-[10px] font-semibold text-purple-600 bg-purple-50 rounded px-1 align-middle">Journalier</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {e.ageMoisVal !== null
                            ? `${e.ageMoisVal} mois ${semaines % 4 > 0 ? `et ${semaines % 4} sem.` : ''} · ${6 - e.ageMoisVal} mois avant la transition`
                            : e.ageSaisi ? `~${e.ageSaisi}` : e.ageApprox ? `~${e.ageApprox}` : 'Groupe nourrisson'}
                        </p>
                        {prochainH && prochainAvantFermeture && !rappelActif && (
                          <p className="text-[10px] text-green-600 mt-0.5">⏱ Prochain biberon vers {prochainH}</p>
                        )}
                        {prochainH && !prochainAvantFermeture && !rappelActif && (
                          <p className="text-[10px] text-gray-400 mt-0.5">✓ Prochain biberon après la fermeture — pas nécessaire</p>
                        )}
                        {e.allergies && <p className="text-xs text-orange-500 mt-0.5">⚠ {e.allergies}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Total du jour</p>
                        <p className="text-lg font-extrabold text-blue-700">{totalMl} ml</p>
                        <p className="text-[10px] text-gray-400">{biberons.length} biberon(s)</p>
                      </div>
                    </div>

                    {/* Liste des biberons du jour */}
                    {biberons.length > 0 && (
                      <div className="space-y-1 mb-3">
                        {biberons.map((b) => {
                          const obs = OBSERVATIONS_BIBERON.find((o) => o.id === b.observation)
                          const lait = TYPES_LAIT.find((t) => t.id === b.typeLait)
                          return (
                            <div key={b.id} className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-1.5 text-xs">
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-blue-700">{b.heure}</span>
                                <span className="text-gray-600">{lait?.label}</span>
                                <span className="font-semibold text-blue-800">{b.quantite} ml</span>
                                <span>{obs?.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {b.notes && <span className="text-gray-400 italic truncate max-w-[100px]">{b.notes}</span>}
                                <button onClick={() => supprimerBiberon(b.id)}
                                  className="text-red-400 hover:text-red-600">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Bouton ajouter biberon */}
                    {garderieOuverte ? (
                      <button
                        onClick={() => {
                          setBiberonModal(e)
                          setBiberonForm({ heure: new Date().toTimeString().slice(0,5), typeLait: 'artificiel', quantite: '', observation: 'bien', notes: '' })
                        }}
                        className="flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-200 transition-colors w-full justify-center">
                        <Plus size={15} /> Enregistrer un biberon
                      </button>
                    ) : (
                      <p className="text-center text-xs text-gray-400 italic py-2">
                        🔒 Garderie fermée — saisie impossible après {params.heureFermeture || '18:00'}
                      </p>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal biberon */}
      <Modal
        open={!!biberonModal}
        onClose={() => setBiberonModal(null)}
        size="sm"
        {...glassModalProps('#3b82f6')}
        title="Nouveau biberon"
        footer={
          <>
            <Button variant="outline" onClick={() => setBiberonModal(null)}>Annuler</Button>
            <Button onClick={enregistrerBiberon}>Enregistrer</Button>
          </>
        }
      >
        {biberonModal && (
          <div className="space-y-4">
            {/* Bandeau héro — bleu (thème nutrition/lait), enfant concerné */}
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(59,130,246,0.35),0_8px_20px_-8px_rgba(59,130,246,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
              style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.88) 0%, rgba(29,78,216,0.85) 100%)' }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: '#3b82f6', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}>
                <Milk size={24} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{biberonModal.prenom} {biberonModal.nom}</p>
                <p className="text-sm text-white/80">{biberonModal.ageMoisVal !== null ? `${biberonModal.ageMoisVal} mois` : (biberonModal.ageSaisi || biberonModal.ageApprox) ? `~${biberonModal.ageSaisi || biberonModal.ageApprox}` : 'Nourrisson'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Heure *">
                <Input type="time" value={biberonForm.heure}
                  onChange={(e) => setBiberonForm((f) => ({ ...f, heure: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Quantité (ml) *">
                <Input type="number" min="0" max="500" value={biberonForm.quantite}
                  onChange={(e) => setBiberonForm((f) => ({ ...f, quantite: e.target.value }))}
                  placeholder="ex: 120" autoFocus />
              </FormGroup>
              <FormGroup label="Type de lait">
                <select value={biberonForm.typeLait}
                  onChange={(e) => setBiberonForm((f) => ({ ...f, typeLait: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                  {TYPES_LAIT.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Observation">
                <select value={biberonForm.observation}
                  onChange={(e) => setBiberonForm((f) => ({ ...f, observation: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300">
                  {OBSERVATIONS_BIBERON.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </FormGroup>
            </div>
            <FormGroup label="Notes">
              <Input value={biberonForm.notes}
                onChange={(e) => setBiberonForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="ex: a bu lentement, pleurait après…" />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal Menu */}
      <Modal open={!!menuModal} onClose={() => setMenuModal(null)} size="md"
        {...glassModalProps(COULEUR_MODULE.garderie)}
        title="Menu du jour"
        footer={
          <>
            <Button variant="outline" onClick={() => setMenuModal(null)} disabled={saving}>Annuler</Button>
            <Button onClick={handleSaveMenu} loading={saving}>Enregistrer</Button>
          </>
        }>
        {menuModal && (
          <div className="space-y-4">
            {/* Bandeau héro — la date du menu, pas un enfant en particulier */}
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,57,14,0.35),0_8px_20px_-8px_rgba(232,57,14,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: 'linear-gradient(135deg, rgba(232,57,14,0.85) 0%, rgba(245,168,0,0.8) 100%)' }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: '#E8390E', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}>
                <CalendarDays size={24} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{formatDateShort(dateFiltre)}</p>
                <p className="text-sm text-white/80">Menu de la journée</p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">🌅 Petit-déjeuner</p>
              <Input value={menuModal.data.petitDejeuner} onChange={(e) => setMenu('petitDejeuner', e.target.value)} placeholder="ex: Bouillie de mil, lait…" />
            </div>
            <div className="rounded-2xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-700">🍛 Déjeuner *</p>
              <Input value={menuModal.data.dejeuner} onChange={(e) => setMenu('dejeuner', e.target.value)} placeholder="ex: Riz sauce arachide, viande de bœuf" />
            </div>
            <div className="rounded-2xl border border-green-200 border-l-4 border-l-green-400 bg-green-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-green-700">🍎 Goûter</p>
              <Input value={menuModal.data.gouter} onChange={(e) => setMenu('gouter', e.target.value)} placeholder="ex: Biscuits, jus de fruit…" />
            </div>

            <FormGroup label="⚠️ Infos importantes du jour">
              <textarea
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={menuModal.data.notes} onChange={(e) => setMenu('notes', e.target.value)}
                placeholder="ex: Sauce aux arachides, arêtes de poisson…" />
            </FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

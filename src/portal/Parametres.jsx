// Paramètres : accessibles à tous les utilisateurs connectés (comme Mon compte). Réglages de la personne et de l'appareil en grille bento
// de cartes de verre : profil, mise à jour, apparence, notifications, application installée.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, Sun, Moon, SunMoon, BellRing, BellOff, RefreshCw, Share, Smartphone, UserRound, LogOut, Palette, Download, Trash2, ShieldCheck,
  BadgeCheck, CircleAlert, WifiOff, Wifi, Type, Sparkles, Send, Rocket, MonitorSmartphone, History, Tag
} from 'lucide-react'
import BandeauVolet from '../shared/ui/BandeauVolet'
import Button from '../shared/ui/Button'
import { ParamsGrille, ParamsCarte, TuileVerre } from '../shared/ui/ParamsVerre'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { usePreferences, TAILLES } from '../core/preferences'
import { useMajStore, verifierMiseAJour, appliquerMiseAJour, viderCaches, installerApplication, VERSION_APP, DATE_CONSTRUCTION } from '../core/maj'
import { subscribeToPush, pushSupported } from '../core/push'
import { roleLabel } from '../core/roles'
import { toast } from '../core/notifications'
import { avatarGradient } from '../utils/color'

const ROUGE = '#BC3C31'
const estIOS = () => typeof navigator !== 'undefined' && /ip(hone|ad|od)/i.test(navigator.userAgent) && !window.MSStream
const estInstallee = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true)
const dateLongue = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const heure = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

// Choix en pastilles de verre (une seule valeur active), teintées du rouge de la plateforme.
function Pastilles({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} data-actif={value === o.id} onClick={() => onChange(o.id)}
          className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ '--puce': ROUGE }}>
          {o.icone && <o.icone size={13} aria-hidden="true" />}{o.label}
        </button>
      ))}
    </div>
  )
}

// Interrupteur en verre : un réglage activé ou non.
function Interrupteur({ actif, onChange, label, aide }) {
  return (
    <button type="button" role="switch" aria-checked={actif} onClick={() => onChange(!actif)}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md transition-all hover:bg-white/80 dark:border-white/10 dark:bg-white/5">
      <span className="min-w-0">
        <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">{label}</span>
        {aide && <span className="block text-[11px] text-gray-500">{aide}</span>}
      </span>
      <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full border border-white/70 transition-colors"
        style={{ background: actif ? `linear-gradient(135deg, #e0685c, ${ROUGE})` : 'rgba(148,163,184,0.45)', boxShadow: actif ? `0 6px 12px -6px ${ROUGE}, inset 0 1px 1px rgba(255,255,255,0.5)` : 'inset 0 1px 3px rgba(0,0,0,0.15)' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.3)] transition-all" style={{ left: actif ? '1.35rem' : '0.12rem' }} />
      </span>
    </button>
  )
}

export default function Parametres() {
  const navigate = useNavigate()
  const { user, role, logout } = useAuth()
  const { mode, setMode } = useTheme()
  const { taille, reglerTaille, sansAnimations, reglerAnimations } = usePreferences()
  const maj = useMajStore()

  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [activation, setActivation] = useState(false)
  const [enLigne, setEnLigne] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [application, setApplication] = useState(false)
  const iosSansInstall = estIOS() && !estInstallee() && !pushSupported()
  const installee = estInstallee()

  useEffect(() => {
    const on = () => setEnLigne(true), off = () => setEnLigne(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  // La page vérifie toute seule à l'ouverture : on sait tout de suite si une version plus récente existe.
  useEffect(() => { verifierMiseAJour() }, [])

  async function verifier() {
    const r = await verifierMiseAJour()
    if (r.erreur) toast.error('Vérification impossible : êtes-vous connecté à Internet ?')
    else if (r.disponible) toast.info('Une nouvelle version est disponible.')
    else toast.success('Vous avez déjà la dernière version ✅')
  }
  async function mettreAJour() { setApplication(true); toast.info('Mise à jour en cours : l’application va se recharger.'); await appliquerMiseAJour() }

  async function activerNotifs() {
    if (typeof Notification === 'undefined') return
    setActivation(true)
    try {
      const p = await Notification.requestPermission()
      setNotifPerm(p)
      if (p === 'granted') {
        const ok = await subscribeToPush(user)
        if (ok) toast.success('Notifications activées sur cet appareil ✅')
        else toast.warning('Alertes activées à l’écran, mais l’abonnement « appli fermée » a échoué.')
      } else if (p === 'denied') toast.warning('Notifications refusées. Autorisez-les dans les réglages du navigateur pour être alerté.')
    } finally { setActivation(false) }
  }
  async function testerNotif() {
    const options = { body: 'Test réussi : les alertes arrivent bien sur cet appareil.', icon: '/icon-192.png', tag: 'test-notification' }
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.()
      if (reg?.showNotification) await reg.showNotification('LA TERMITIÈRE', options)
      else new Notification('LA TERMITIÈRE', options)
      toast.success('Notification de test envoyée.')
    } catch { toast.error('Impossible d’afficher la notification de test.') }
  }
  async function installer() {
    const ok = await installerApplication()
    if (ok) toast.success('Application installée ✅')
  }
  async function vider() {
    if (!confirm('Vider le cache de l’application sur cet appareil ? Vous restez connecté ; l’application se recharge et retélécharge ses fichiers.')) return
    await viderCaches(); window.location.reload()
  }
  async function deconnexion() { if (confirm('Se déconnecter de cet appareil ?')) await logout() }

  const statutMaj = maj.verification ? { c: '#64748b', Icone: RefreshCw, titre: 'Vérification en cours…', tourne: true }
    : maj.disponible ? { c: '#d97706', Icone: Rocket, titre: 'Une nouvelle version est disponible' }
      : maj.erreur ? { c: '#dc2626', Icone: CircleAlert, titre: 'Vérification impossible' }
        : maj.distante ? { c: '#16a34a', Icone: BadgeCheck, titre: 'Vous avez la dernière version' }
          : maj.derniereVerif ? { c: '#64748b', Icone: History, titre: 'Version de développement : rien à comparer' }
            : { c: '#64748b', Icone: History, titre: 'Pas encore vérifié' }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <BandeauVolet couleur={ROUGE} icone={Settings} surtitre="Mon espace" titre="Paramètres" sous="Vos réglages et ceux de cet appareil : apparence, alertes, mises à jour." />

      <ParamsGrille>
        {/* Profil */}
        <ParamsCarte icone={UserRound} couleur={ROUGE} titre="Mon profil" sous="La personne connectée sur cet appareil">
          <div className="flex items-center gap-3.5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white/90 text-2xl font-black text-white shadow-[0_10px_20px_-8px_rgba(0,0,0,0.5),inset_0_2px_2px_rgba(255,255,255,0.5)]" style={{ background: avatarGradient(user?.login || user?.nom) }} aria-hidden="true">
              {(user?.nom || user?.login || '?').trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-gray-800 dark:text-gray-100">{user?.nom || user?.login}</p>
              <p className="truncate text-sm text-gray-500">{roleLabel(role)}{user?.login ? ` · ${user.login}` : ''}</p>
            </div>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Button onClick={() => navigate('/mon-compte')} style={{ backgroundColor: ROUGE }}><UserRound size={15} /> Mon compte</Button>
            <Button variant="outline" onClick={deconnexion}><LogOut size={15} /> Se déconnecter</Button>
          </div>
        </ParamsCarte>

        {/* Mise à jour */}
        <ParamsCarte icone={RefreshCw} couleur="#0284c7" titre="Mise à jour" sous="Récupérer la dernière version de l’application">
          <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md dark:border-white/10 dark:bg-white/5" role="status" aria-live="polite">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]" style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${statutMaj.c} 70%, white), ${statutMaj.c})` }}>
              <statutMaj.Icone size={18} className={statutMaj.tourne ? 'animate-spin' : ''} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-gray-800 dark:text-gray-100">{statutMaj.titre}</p>
              <p className="text-[11px] text-gray-500">
                {maj.disponible && maj.distante?.date ? `Publiée le ${dateLongue(maj.distante.date)}.` : maj.derniereVerif ? `Dernière vérification à ${heure(maj.derniereVerif)}.` : 'La vérification se lance à l’ouverture de cette page.'}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TuileVerre icone={Tag} couleur="#0284c7" titre="Version installée" valeur={`v${VERSION_APP}`} />
            <TuileVerre icone={History} couleur="#7c3aed" titre="Construite le" valeur={DATE_CONSTRUCTION ? new Date(DATE_CONSTRUCTION).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={verifier} disabled={maj.verification || application}><RefreshCw size={15} className={maj.verification ? 'animate-spin' : ''} /> Vérifier les mises à jour</Button>
            {maj.disponible && <Button onClick={mettreAJour} loading={application} style={{ backgroundColor: '#d97706' }}><Rocket size={15} /> Mettre à jour maintenant</Button>}
          </div>
          {maj.disponible && <p className="mt-2 text-[11px] text-gray-500">L’application se recharge pour passer à la nouvelle version. Vos données et votre connexion sont conservées.</p>}
        </ParamsCarte>

        {/* Apparence */}
        <ParamsCarte icone={Palette} couleur="#7c3aed" titre="Apparence" sous="Thème, taille du texte et animations">
          <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">Thème</p>
          <Pastilles value={mode} onChange={setMode} options={[{ id: 'light', label: 'Clair', icone: Sun }, { id: 'dark', label: 'Sombre', icone: Moon }, { id: 'auto', label: 'Automatique', icone: SunMoon }]} />
          <p className="mt-1.5 text-[11px] text-gray-500">Automatique : l’application suit le réglage clair ou sombre de votre appareil.</p>
          <p className="mb-1.5 mt-3.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-500"><Type size={12} aria-hidden="true" /> Taille du texte</p>
          <Pastilles value={taille} onChange={reglerTaille} options={TAILLES} />
          <div className="mt-3.5">
            <Interrupteur actif={sansAnimations} onChange={reglerAnimations} label="Réduire les animations" aide="Moins de mouvements à l’écran : plus sobre, et plus économe sur un vieux téléphone." />
          </div>
        </ParamsCarte>

        {/* Notifications */}
        <ParamsCarte icone={BellRing} couleur="#16a34a" titre="Notifications" sous="Être alerté, même application fermée">
          {iosSansInstall ? (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Sur iPhone, les notifications n’arrivent que si l’application est ajoutée à l’écran d’accueil :</p>
              <ol className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                <li>1. Touchez <Share size={13} className="-mt-0.5 inline" /> <strong>Partager</strong> (barre Safari).</li>
                <li>2. <strong>« Sur l’écran d’accueil »</strong>.</li>
                <li>3. Rouvrez l’app depuis son <strong>icône</strong>, puis revenez ici.</li>
              </ol>
            </div>
          ) : !pushSupported() ? (
            <p className="flex items-center gap-2 text-sm text-gray-500"><Smartphone size={16} /> Non disponible sur ce navigateur ou cet appareil.</p>
          ) : notifPerm === 'granted' ? (
            <div>
              <p className="flex items-center gap-2 text-sm font-extrabold text-green-600 dark:text-green-400"><BellRing size={16} /> Activées sur cet appareil</p>
              <p className="mt-1 text-xs text-gray-500">Demandes d’autorisation, validations et alertes vous parviennent, même application fermée.</p>
              <Button className="mt-3" variant="outline" onClick={testerNotif}><Send size={15} /> Envoyer une notification de test</Button>
            </div>
          ) : notifPerm === 'denied' ? (
            <div>
              <p className="flex items-center gap-2 text-sm font-extrabold text-red-600 dark:text-red-400"><BellOff size={16} /> Refusées</p>
              <p className="mt-1 text-xs text-gray-500">Autorisez-les dans les réglages du navigateur pour cet appareil, puis revenez ici.</p>
            </div>
          ) : (
            <div>
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">Recevez les demandes d’autorisation, sorties et validations sur cet appareil : même application fermée.</p>
              <Button onClick={activerNotifs} loading={activation} style={{ backgroundColor: ROUGE }}><BellRing size={15} /> Activer les notifications</Button>
            </div>
          )}
        </ParamsCarte>

        {/* Application et appareil */}
        <ParamsCarte icone={MonitorSmartphone} couleur="#f59e0b" titre="Application et appareil" sous="Installation, connexion et espace utilisé" large>
          <div className="grid gap-2 sm:grid-cols-3">
            <TuileVerre icone={enLigne ? Wifi : WifiOff} couleur={enLigne ? '#16a34a' : '#dc2626'} titre="Connexion" valeur={enLigne ? 'En ligne' : 'Hors ligne'} sous={enLigne ? 'Données synchronisées' : 'Les saisies partiront au retour du réseau'} />
            <TuileVerre icone={Smartphone} couleur="#0284c7" titre="Mode d’utilisation" valeur={installee ? 'Application installée' : 'Navigateur'} sous={installee ? 'Ouverte depuis son icône' : 'Peut être installée sur l’écran d’accueil'} />
            <TuileVerre icone={ShieldCheck} couleur="#7c3aed" titre="Compte" valeur={roleLabel(role)} sous="Vos accès dépendent de ce rôle" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {maj.installPrompt && !installee && <Button onClick={installer} style={{ backgroundColor: ROUGE }}><Download size={15} /> Installer l’application</Button>}
            <Button variant="outline" onClick={vider}><Trash2 size={15} /> Vider le cache de l’application</Button>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">Le cache garde les fichiers de l’application pour le mode hors ligne. Le vider règle un affichage qui ne se met pas à jour ; vous restez connecté.</p>
        </ParamsCarte>
      </ParamsGrille>
    </div>
  )
}

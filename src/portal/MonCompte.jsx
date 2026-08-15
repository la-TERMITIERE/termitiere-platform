// Mon compte — accessible à tous les utilisateurs connectés (agent, contrôleur, admin).
// Permet de modifier ses informations personnelles et son mot de passe.
import { useEffect, useState } from 'react'
import { KeyRound, Save } from 'lucide-react'
import Card from '../shared/ui/Card'
import Button from '../shared/ui/Button'
import FormGroup from '../shared/forms/FormGroup'
import Input from '../shared/forms/Input'
import { useAuth } from '../hooks/useAuth'
import { useUsersStore } from '../core/users'
import { updatePassword } from 'firebase/auth'
import { hashPassword, legacyHashPassword } from '../core/auth'
import { getOne } from '../core/db'
import { roleLabel } from '../core/roles'
import { isFirebaseConfigured, auth } from '../core/firebase'
import { toast } from '../core/notifications'
import { avatarGradient } from '../utils/color'

export default function MonCompte() {
  const { user, role, updateSession } = useAuth()
  const { users, load, saveUser } = useUsersStore()
  const profile = users.find((u) => u.login === user?.login)

  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [passActuel, setPassActuel] = useState('')
  const [passNouveau, setPassNouveau] = useState('')
  const [passConfirm, setPassConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (profile) {
      setNom(profile.nom || '')
      setTelephone(profile.telephone || '')
    }
  }, [profile])

  async function submit() {
    if (!user || !profile) return toast.error('Profil introuvable')
    if (!nom.trim()) return toast.error('Le nom est requis')

    const changePass = passNouveau || passActuel || passConfirm
    if (changePass) {
      if (!passActuel) return toast.error('Indiquez votre mot de passe actuel')
      if (!passNouveau || passNouveau.length < 4) return toast.error('Nouveau mot de passe : 4 caractères minimum')
      if (passNouveau !== passConfirm) return toast.error('Les mots de passe ne correspondent pas')

      if (isFirebaseConfigured) {
        const secret = await getOne('users_secret', profile.uid || profile.id)
        let ok = false
        if (secret?.salt && secret?.passHash) {
          ok = (await hashPassword(passActuel, secret.salt)) === secret.passHash
        } else {
          // Compte pas encore migré vers le hachage salé (ancien schéma).
          const legacy = secret?.passHash || profile.passHash
          ok = Boolean(legacy) && (await legacyHashPassword(passActuel)) === legacy
        }
        if (!ok) return toast.error('Mot de passe actuel incorrect')
      } else if (profile.pass !== passActuel) {
        return toast.error('Mot de passe actuel incorrect')
      }
    }

    setSaving(true)
    try {
      await saveUser({
        ...profile,
        nom: nom.trim(),
        telephone: telephone.trim(),
        pass: passNouveau || undefined
      })

      // Propage le nouveau mot de passe à Firebase Auth (l'utilisateur est lui-même
      // authentifié → updatePassword autorisé). Best-effort, non bloquant.
      if (changePass && isFirebaseConfigured && auth?.currentUser) {
        try { await updatePassword(auth.currentUser, passNouveau) }
        catch (e) { console.warn('[moncompte] Firebase Auth — màj mot de passe :', e?.code || e?.message) }
      }

      updateSession({ nom: nom.trim() })
      setPassActuel('')
      setPassNouveau('')
      setPassConfirm('')
      toast.success(changePass ? 'Profil et mot de passe mis à jour ✓' : 'Profil mis à jour ✓')
    } catch (e) {
      toast.error('Erreur : ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-[2rem] p-4 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35),0_20px_40px_-16px_rgba(0,0,0,0.5),0_36px_72px_-20px_rgba(188,60,49,0.4)] backdrop-blur-2xl backdrop-saturate-200 sm:p-6"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.92) 0%, rgba(90,20,16,0.92) 100%)' }}>
        <div className="pointer-events-none absolute -right-10 -top-14 h-56 w-56 rounded-full opacity-[0.15]" style={{ background: '#ffffff' }} />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-40 w-40 rounded-full opacity-[0.08]" style={{ background: '#ffffff' }} />
        <div
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-extrabold shadow-md ring-2 ring-white/60"
          style={{ background: avatarGradient(user?.login || profile?.nom) }}
        >
          {(profile?.nom || user?.nom || '?').charAt(0).toUpperCase()}
        </div>
        <div className="relative min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold sm:text-xl">{profile?.nom || user?.nom || 'Mon compte'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm">
              {roleLabel(role)}
            </span>
            {profile?.secteur && (
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
                {profile.secteur}
              </span>
            )}
            <span className="rounded-full border border-white/20 bg-black/10 px-2.5 py-1 font-mono text-[11px] text-white/70">
              {user?.login}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <FormGroup label="Nom complet" required>
          <Input value={nom} onChange={(e) => setNom(e.target.value)} />
        </FormGroup>
        <FormGroup label="Téléphone" hint="Optionnel">
          <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+225 …" />
        </FormGroup>
        <FormGroup label="Secteur">
          <Input value={profile?.secteur || ''} readOnly className="bg-gray-50 dark:bg-white/5 dark:text-gray-400" />
        </FormGroup>
      </Card>

      <Card title="Changer le mot de passe">
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <KeyRound size={16} /> Laissez vide si vous ne souhaitez pas le modifier
        </div>
        <FormGroup label="Mot de passe actuel">
          <Input type="password" value={passActuel} onChange={(e) => setPassActuel(e.target.value)} autoComplete="current-password" />
        </FormGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormGroup label="Nouveau mot de passe">
            <Input type="password" value={passNouveau} onChange={(e) => setPassNouveau(e.target.value)} autoComplete="new-password" />
          </FormGroup>
          <FormGroup label="Confirmer">
            <Input type="password" value={passConfirm} onChange={(e) => setPassConfirm(e.target.value)} autoComplete="new-password" />
          </FormGroup>
        </div>
      </Card>

      <Button onClick={submit} loading={saving} className="w-full sm:w-auto">
        <Save size={16} /> Enregistrer les modifications
      </Button>
    </div>
  )
}

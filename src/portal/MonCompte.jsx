// Mon compte — accessible à tous les utilisateurs connectés (agent, contrôleur, admin).
// Permet de modifier ses informations personnelles et son mot de passe.
import { useEffect, useState } from 'react'
import { UserCircle, KeyRound, Save } from 'lucide-react'
import Card from '../shared/ui/Card'
import Button from '../shared/ui/Button'
import FormGroup from '../shared/forms/FormGroup'
import Input from '../shared/forms/Input'
import Badge from '../shared/ui/Badge'
import { useAuth } from '../hooks/useAuth'
import { useUsersStore } from '../core/users'
import { hashPassword } from '../core/auth'
import { roleLabel, roleTone } from '../core/roles'
import { isFirebaseConfigured } from '../core/firebase'
import { toast } from '../core/notifications'

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
        const hash = await hashPassword(passActuel)
        if (profile.passHash !== hash) return toast.error('Mot de passe actuel incorrect')
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
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UserCircle size={28} />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">Mon compte</h1>
          <p className="text-sm text-gray-500">Gérez vos informations personnelles</p>
        </div>
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Badge tone={roleTone(role)}>{roleLabel(role)}</Badge>
          <span className="font-mono text-xs text-gray-400">{user?.login}</span>
        </div>

        <FormGroup label="Nom complet" required>
          <Input value={nom} onChange={(e) => setNom(e.target.value)} />
        </FormGroup>
        <FormGroup label="Téléphone" hint="Optionnel">
          <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+225 …" />
        </FormGroup>
        <FormGroup label="Secteur">
          <Input value={profile?.secteur || ''} readOnly className="bg-gray-50" />
        </FormGroup>
      </Card>

      <Card title="Changer le mot de passe">
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
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

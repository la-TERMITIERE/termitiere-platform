// Clients événementiel — agrégés depuis les événements (CA total, classement VIP).
import { useMemo } from 'react'
import { Crown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatDateShort } from '../../utils/formatters'

export default function Clients() {
  const { data: evenements } = useCollection('evenementiel_evenements')

  const clients = useMemo(() => {
    const map = {}
    evenements.forEach((e) => {
      const nom = e.client?.nom?.trim()
      if (!nom) return
      if (!map[nom]) map[nom] = { nom, tel: e.client?.tel, nb: 0, ca: 0, derniere: e.dateDebut }
      map[nom].nb += 1
      map[nom].ca += e.budget || 0
      if (e.dateDebut > map[nom].derniere) map[nom].derniere = e.dateDebut
    })
    return Object.values(map).sort((a, b) => b.ca - a.ca)
  }, [evenements])

  return (
    <Card className="p-0">
      <Table
        columns={[
          { key: 'rang', label: '', align: 'center', render: (r) => clients.indexOf(r) === 0 && r.ca > 0 ? <Crown size={16} className="text-amber-500" /> : null },
          { key: 'nom', label: 'Client' },
          { key: 'tel', label: 'Téléphone' },
          { key: 'nb', label: 'Événements', align: 'center' },
          { key: 'ca', label: 'CA total', align: 'right', render: (r) => <strong>{formatMoney(r.ca)}</strong> },
          { key: 'vip', label: 'Statut', align: 'center', render: (r) => r.ca >= 1000000 ? <Badge tone="purple">VIP</Badge> : <Badge tone="neutral">Standard</Badge> },
          { key: 'derniere', label: 'Dernier', align: 'right', render: (r) => formatDateShort(r.derniere) }
        ]}
        rows={clients}
        rowKey="nom"
        empty="Aucun client (créez des événements)."
      />
    </Card>
  )
}

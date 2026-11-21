// E-TACHES : sélecteur de période posé sur le bandeau des vues d'analyse (Pilotage, Par employé, Par directeur).
import { useState } from 'react'
import { OngletsBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'
import { MODES_PERIODE, bornesPilotage } from './pilotageCalculs'
import { formatJour } from './data'

// Renvoie { periode, bande, info } : `bande` est à poser dans le `pied` du bandeau ; `info` est un texte « n tâches · du … au … ».
export function usePeriode(modeInitial = 'month') {
  const [mode, setMode] = useState(modeInitial)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const periode = { mode, from, to }
  const bande = (
    <>
      <OngletsBande options={MODES_PERIODE} valeur={mode} onChange={setMode} taille="sm" />
      {mode === 'custom' && (
        <>
          <ChampBande label="Du"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={CLASSE_CHAMP_BANDE} /></ChampBande>
          <ChampBande label="Au"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={CLASSE_CHAMP_BANDE} /></ChampBande>
        </>
      )}
    </>
  )
  // Version compacte (hors bandeau) : une liste déroulante, plus deux dates quand la période est personnalisée.
  const selecteur = (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Période" className="input-base !w-auto !rounded-full !py-1.5 text-xs font-bold">
        {MODES_PERIODE.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      {mode === 'custom' && (
        <>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Du" className="input-base !w-auto !rounded-full !py-1.5 text-xs font-bold" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Au" className="input-base !w-auto !rounded-full !py-1.5 text-xs font-bold" />
        </>
      )}
    </span>
  )
  const info = (n) => {
    const b = bornesPilotage(periode)
    const t = `${n} tâche${n > 1 ? 's' : ''}`
    return !b.from && !b.to ? `${t} au total` : `${t} · du ${formatJour(b.from) || '...'} au ${formatJour(b.to) || '...'}`
  }
  return { periode, bande, selecteur, info }
}

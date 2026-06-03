// Module MAXI-AGRO — intègre l'application approuvée telle quelle (code identique
// à maxi-agro-deploy) via une iframe servie depuis public/apps/maxi-agro/.
// Aucune modification n'est apportée au code MAXI-AGRO : il est embarqué octet pour octet.
export default function AgroModule() {
  return (
    <div className="-m-4 h-[calc(100%+2rem)] md:-m-6 md:h-[calc(100%+3rem)]">
      <iframe
        src="/apps/maxi-agro/index.html"
        title="MAXI-AGRO"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write; notifications"
      />
    </div>
  )
}

// Enregistrement global des composants Chart.js (à importer une fois au boot).
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

// Thème clair cohérent avec la charte (vert / bleu / gris).
ChartJS.defaults.color = '#475569'
ChartJS.defaults.borderColor = 'rgba(0,0,0,0.06)'
ChartJS.defaults.font.family = "'Inter', system-ui, sans-serif"
ChartJS.defaults.plugins.legend.labels.boxWidth = 12
ChartJS.defaults.plugins.legend.labels.padding = 16

export default ChartJS

import { normalizeText, propertyText } from '../data/building-name'
import { hoverColor } from './hover-color'

export type BuildingIcon = 'school' | 'police' | 'hospital' | 'admin' | 'museum' | 'hotel' | 'restaurant' | 'venue' | 'landmark'

export const BUILDING_ICON_COLORS: Record<BuildingIcon, string> = {
  landmark: '#ff6a00',
  venue: '#a600ff',
  hospital: '#ff006e',
  school: '#555b63',
  police: '#555b63',
  admin: '#555b63',
  museum: '#b45309',
  hotel: '#b45309',
  restaurant: '#b45309',
}

// Explicit asset aliases take precedence over broad keyword matching.
const ASSET_ICONS: Record<string, BuildingIcon> = {
  '해양 박물관': 'museum', '현대 미술관': 'museum',
  'maritime museum': 'museum', 'modern art museum': 'museum',
}
const MUSEUM = /\b(museum|gallery)\b|박물관|미술관/i
const HOTEL = /\b(hotel|motel|inn|hostel|resort)\b|호텔|모텔|여관|리조트/i
const RESTAURANT = /\b(restaurant|diner|steakhouse)\b|레스토랑|식당/i

export function buildingIcon(properties: Record<string, unknown>, area: number): BuildingIcon | null {
  const categories = propertyText(properties, 'Category').split(',').map(token => token.trim())
  if (categories.includes('Extension')) return null
  if (!categories.includes('Transportation') && !categories.includes('Parking') &&
    /dome|stadium|arena|coliseum/i.test(propertyText(properties, 'Name'))) return 'venue'
  if (categories.includes('Fire')) return null
  for (const [category, icon] of [['Police', 'police'], ['Education', 'school'], ['Health', 'hospital']] as const) {
    if (categories.includes(category)) return icon
  }
  if (categories.includes('Transportation') || categories.includes('Parking')) return null
  const asset = normalizeText(propertyText(properties, 'Asset'))
  const product = normalizeText(propertyText(properties, 'Product'))
  // Renamed buildings retain their asset identity. Only use a name when no asset is available.
  const identity = asset || normalizeText(propertyText(properties, 'Name'))
  const tourismEligible = categories.includes('Public') || categories.includes('Property') &&
    propertyText(properties, 'Zoning') === 'Commercial'
  if (tourismEligible) {
    const explicit = ASSET_ICONS[asset]
    if (explicit) return explicit
    if (MUSEUM.test(identity)) return 'museum'
    if (HOTEL.test(identity) || /^(accommodation|lodging|숙박 시설|숙박시설)$/.test(product)) return 'hotel'
    if ((RESTAURANT.test(identity) || /^(meals|식사)$/.test(product)) &&
      (area >= 1000 || typeof properties.Employee === 'number' && properties.Employee >= 50)) return 'restaurant'
  }
  return categories.includes('Admin') ? 'admin' : null
}

const ICON_PATHS: Record<BuildingIcon, string> = {
  landmark: 'M12 4L14.5 9L20 10L16 14L17 20L12 17L7 20L8 14L4 10L9.5 9Z',
  venue: 'M4 10C4 4 20 4 20 10V15C20 21 4 21 4 15Z M4 10C4 16 20 16 20 10 M8 14V18 M12 15V19 M16 14V18 M8 10C8 7 16 7 16 10C16 13 8 13 8 10Z',
  school: 'M6 10L12 5L18 10 M8 9V19H16V9 M4 12H8 M16 12H20 M4 12V19H20V12 M11 19V15H13V19 M12 8V11',
  police: 'M12 4L19 7V12Q19 17 12 21Q5 17 5 12V7Z M12 8L13 11L16 11L14 13L15 16L12 14L9 16L10 13L8 11L11 11Z',
  hospital: 'M9 5H15V9H19V15H15V19H9V15H5V9H9Z',
  admin: 'M3 9L12 4L21 9Z M5 19H19 M3 21H21 M6 11V17 M10 11V17 M14 11V17 M18 11V17',
  museum: 'M3 9L12 4L21 9Z M4 20H20 M6 11V18 M12 11V18 M18 11V18 M10 7H14',
  hotel: 'M4 5V20 M4 15H20V20 M4 10H10V15 M10 9H18Q20 9 20 11V15 M6 12H8',
  restaurant: 'M6 4V10Q6 12 9 12Q12 12 12 10V4 M9 4V20 M17 4Q14 10 17 12H19 M19 4V20',
}

export function registerBuildingIcons(map: { addImage: (id: string, image: ImageData,
  options: { pixelRatio: number }) => unknown }) {
  for (const [kind, path] of Object.entries(ICON_PATHS)) {
    const baseColor = BUILDING_ICON_COLORS[kind as BuildingIcon]
    for (const [suffix, color] of [['', baseColor], ['-hover', hoverColor(baseColor)],
      ['-pressed', hoverColor(hoverColor(baseColor))]]) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 48
      const context = canvas.getContext('2d')
      if (!context) throw new Error(`Could not draw ${kind} building icon`)
      context.scale(2, 2)
      context.fillStyle = color
      context.beginPath()
      context.arc(12, 12, 11, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = '#fffdf9'
      context.lineWidth = 1.2
      context.stroke()
      context.lineWidth = 1.4
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.stroke(new Path2D(path))
      map.addImage(`building-${kind}${suffix}`, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 })
    }
  }
}

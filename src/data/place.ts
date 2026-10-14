import type { LineString, Point, Polygon } from 'geojson'
import type { Selection } from './selection'

export type PlaceEntry = { selection: Selection; geometry: Point | LineString | Polygon }

import type { FeatureCollection, Polygon, LineString } from 'geojson'

export type BuildingData = FeatureCollection<Polygon>
export type NetworkData = FeatureCollection<LineString>
export type Extent = [number, number, number, number]
export type Bounds = [[number, number], [number, number]]
export type AreaInfo = { objects: Record<string, number>; error?: string }
export type WaterInfo = {
  coordinates?: [[number, number], [number, number], [number, number], [number, number]]
  waterPixels?: number
  error?: string
}

export type SourceKey = 'buildings' | 'network' | 'area' | 'water' | 'poi' | 'route'
export type SourceState = { state: 'idle' | 'loading' | 'ready' | 'empty' | 'error'; error?: string }
export type SourceStates = Record<SourceKey, SourceState>

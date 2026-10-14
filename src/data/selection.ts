export type Selection = {
  id: string
  sourceFeatureId: number
  kind: 'building' | 'road' | 'poi' | 'route'
  properties: Record<string, unknown>
}


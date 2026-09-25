import { describe, expect, it } from 'vitest'
import type { FeatureCollection, LineString } from 'geojson'
import { NetworkGraph } from './network'

function network(...features: Array<{ line: number[][]; object?: string; category?: string; direction?: string }>): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: features.map(({ line, object = 'Road', category = 'Small', direction = 'Both' }) => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: line },
    properties: { Object: object, Category: category, Direction: direction, Limit: 40 },
  })) }
}

describe('NetworkGraph', () => {
  it('respects Forward and Backward on a selected road segment', () => {
    const forward = new NetworkGraph('vehicle', network({ line: [[0, 0], [0.001, 0]], direction: 'Forward' }))
    expect(forward.route([0.0002, 0], [0.0008, 0]).route?.distance).toBeGreaterThan(60)
    expect(forward.route([0.0008, 0], [0.0002, 0]).reason).toBe('disconnected')
    const backward = new NetworkGraph('vehicle', network({ line: [[0, 0], [0.001, 0]], direction: 'Backward' }))
    expect(backward.route([0.0008, 0], [0.0002, 0]).route).toBeDefined()
    expect(backward.route([0.0002, 0], [0.0008, 0]).reason).toBe('disconnected')
  })

  it('does not connect lines that only cross at their interiors', () => {
    const graph = new NetworkGraph('vehicle', network(
      { line: [[-0.001, 0], [0.001, 0]] },
      { line: [[0, -0.001], [0, 0.001]] },
    ))
    expect(graph.route([-0.0008, 0], [0, 0.0008]).reason).toBe('disconnected')
  })

  it('omits highways from the walking graph', () => {
    const graph = new NetworkGraph('walk', network({ line: [[0, 0], [0.001, 0]], category: 'Highway' }))
    expect(graph.route([0, 0], [0.001, 0]).reason).toBe('access')
  })

  it('counts partial segment distance without detouring via endpoints', () => {
    const graph = new NetworkGraph('vehicle', network({ line: [[0, 0], [0.001, 0]] }))
    const result = graph.route([0.0002, 0], [0.0003, 0])
    expect(result.route?.distance).toBeCloseTo(11.132, 1)
    expect(result.route?.accessDistance).toBeCloseTo(0, 6)
  })

  it('connects a road endpoint to a closed one-way roundabout at its shared vertex', () => {
    const graph = new NetworkGraph('vehicle', network(
      { line: [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]], direction: 'Forward' },
      { line: [[0.001, -0.001], [0.001, 0]] },
      { line: [[0, 0.001], [-0.001, 0.001]] },
    ))
    const result = graph.route([0.001, -0.0008], [-0.0008, 0.001])
    expect(result.route?.featureIds).toEqual([1, 0, 2])
    expect(result.route?.distance).toBeGreaterThan(400)
  })
})

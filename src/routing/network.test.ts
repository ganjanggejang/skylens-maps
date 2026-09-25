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

  it('connects a large place whose mapped center is 160 meters from the road', () => {
    const graph = new NetworkGraph('vehicle', network({ line: [[0, 0], [0.02, 0]] }))
    const result = graph.route([0.001, 0.00144], [0.019, 0])
    expect(result.route?.accessDistance).toBeGreaterThan(150)
    expect(result.route?.featureIds).toEqual([0])
  })

  it('routes from the boundary of a large building when its center is too far from roads', () => {
    const graph = new NetworkGraph('vehicle', network({ line: [[0, 0], [0.03, 0]] }))
    const building = { type: 'Polygon' as const, coordinates: [[
      [0.005, 0.0001], [0.025, 0.0001], [0.025, 0.02], [0.005, 0.02], [0.005, 0.0001],
    ]] }
    expect(graph.route([0.015, 0.01], [0.029, 0]).reason).toBe('access')
    const result = graph.route(building, [0.029, 0])
    expect(result.route?.accessDistance).toBeLessThan(30)
    expect(result.route?.featureIds).toEqual([0])
    expect(graph.route([0.029, 0], building).route?.accessDistance).toBeLessThan(30)
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

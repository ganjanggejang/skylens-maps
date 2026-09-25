import { expect, it } from 'vitest'
import { routeLines } from './directions-layers'

it('renders connected routing edges as one line without joining a real gap', () => {
  const lines = routeLines({
    distance: 0, seconds: 0, accessDistance: 0, featureIds: [],
    coordinates: [
      [[0, 0], [0.001, 0]],
      [[0.001, 0], [0.002, 0]],
      [[0.01, 0], [0.011, 0]],
    ],
  })
  expect(lines.features).toHaveLength(2)
  expect(lines.features[0].geometry.coordinates).toEqual([[0, 0], [0.001, 0], [0.002, 0]])
})

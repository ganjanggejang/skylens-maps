import { afterEach, expect, it, vi } from 'vitest'
import { createDataSession } from './session-client'

const firstId = '0123456789abcdef'
const secondId = 'fedcba9876543210'
const emptyCollection = { type: 'FeatureCollection', features: [] }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function gameEnvironment() {
  vi.stubEnv('DEV', false)
  vi.stubGlobal('document', { baseURI: 'http://localhost:1234/map/' })
}

it('keeps snapshot roots independent when two views configure different sessions', async () => {
  gameEnvironment()
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ snapshotId: firstId, dataRoot: `snapshots/${firstId}/` }))
    .mockResolvedValueOnce(Response.json({ snapshotId: secondId, dataRoot: `snapshots/${secondId}/` }))
    .mockImplementation(async () => Response.json(emptyCollection))
  vi.stubGlobal('fetch', fetchMock)
  const first = createDataSession()
  const second = createDataSession()
  await first.configure()
  await second.configure()
  await first.loadCollection('POI_Location.json', 'Point', true)
  await second.loadCollection('POI_Location.json', 'Point', true)
  expect(fetchMock.mock.calls.slice(2).map(call => call[0])).toEqual([
    `/map/snapshots/${firstId}/GeoJSON/POI_Location.json`,
    `/map/snapshots/${secondId}/GeoJSON/POI_Location.json`,
  ])
})

it('rejects a session whose data root does not match its snapshot ID', async () => {
  gameEnvironment()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
    snapshotId: firstId, dataRoot: `snapshots/${secondId}/`,
  })))
  await expect(createDataSession().configure()).rejects.toThrow('스냅샷 설정이 올바르지 않습니다')
})

it('rejects a manifest from a different snapshot', async () => {
  gameEnvironment()
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ snapshotId: firstId, dataRoot: `snapshots/${firstId}/` }))
    .mockResolvedValueOnce(Response.json({ datasetId: secondId })))
  const session = createDataSession()
  await session.configure()
  await expect(session.loadExtraInfo()).rejects.toThrow('스냅샷 ID가 세션 설정과 일치하지 않습니다')
})

it('allows empty optional sources while rejecting empty required sources', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(emptyCollection)))
  const session = createDataSession()
  await expect(session.loadCollection('POI_Location.json', 'Point', true)).resolves.toEqual(emptyCollection)
  await expect(session.loadCollection('Building_Boundary.json', 'Polygon')).rejects.toThrow('GeoJSON 구조가 올바르지 않습니다')
})

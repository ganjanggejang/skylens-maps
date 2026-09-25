import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const input = join(process.cwd(), 'exported_files', 'GeoJSON')
const output = join(process.cwd(), 'public', 'data')
const sources = [
  { file: 'Building_Boundary.json', geometry: 'Polygon' },
  { file: 'Network_Centerline.json', geometry: 'LineString' },
]

function walkCoordinates(value, bounds) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('빈 좌표 배열')
  if (typeof value[0] === 'number') {
    if (value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
      throw new Error('유효하지 않은 좌표')
    }
    bounds[0] = Math.min(bounds[0], value[0])
    bounds[1] = Math.min(bounds[1], value[1])
    bounds[2] = Math.max(bounds[2], value[0])
    bounds[3] = Math.max(bounds[3], value[1])
    return
  }
  for (const child of value) walkCoordinates(child, bounds)
}

async function prepare() {
  await mkdir(output, { recursive: true })
  const manifest = { preparedAt: new Date().toISOString(), files: {} }

  for (const { file, geometry } of sources) {
    const sourcePath = join(input, file)
    const bytes = await readFile(sourcePath)
    const data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error(`${file}: FeatureCollection이 아닙니다`)
    }
    const bounds = [Infinity, Infinity, -Infinity, -Infinity]
    const objects = {}
    data.features.forEach((feature, index) => {
      if (feature?.type !== 'Feature' || feature.geometry?.type !== geometry ||
          !Array.isArray(feature.geometry.coordinates) ||
          !feature.properties || typeof feature.properties !== 'object') {
        throw new Error(`${file}: ${index}번 Feature의 구조가 올바르지 않습니다`)
      }
      walkCoordinates(feature.geometry.coordinates, bounds)
      const object = feature.properties.Object
      if (typeof object !== 'string') throw new Error(`${file}: ${index}번 Feature의 Object가 없습니다`)
      objects[object] = (objects[object] ?? 0) + 1
    })
    if (!data.features.length) throw new Error(`${file}: Feature가 비어 있습니다`)
    manifest.files[file] = {
      features: data.features.length,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bounds,
      objects,
    }
  }

  for (const { file } of sources) await copyFile(join(input, file), join(output, file))
  await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  for (const [file, info] of Object.entries(manifest.files)) {
    console.log(`${file}: ${info.features} features, bounds ${info.bounds.join(', ')}`)
  }
}

prepare().catch(error => {
  console.error(`데이터 준비 실패: ${error.message}`)
  process.exitCode = 1
})

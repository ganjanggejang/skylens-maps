import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { prepareWater } from './prepare-water.mjs'

const input = join(process.cwd(), 'exported_files', 'GeoJSON')
const output = join(process.cwd(), 'public', 'data')
const sources = [
  { file: 'Building_Boundary.json', geometry: 'Polygon', required: true },
  { file: 'Network_Centerline.json', geometry: 'LineString', required: true },
  { file: 'Area_Boundary.json', geometry: 'Polygon', required: true },
  { file: 'POI_Location.json', geometry: 'Point', required: true },
  { file: 'Route_Centerline.json', geometry: 'LineString', required: true },
  { file: 'Zoning_Boundary.json', geometry: 'Polygon', required: true },
  { file: 'Network_Boundary.json', geometry: 'Polygon', required: true },
]
const rasters = ['Depth.tif', 'Elevation.tif', 'WorldDepth.tif', 'WorldElevation.tif']

async function styleFiles(root, prefix = '') {
  const paths = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) paths.push(...await styleFiles(root, relative))
    else if (entry.isFile()) paths.push(relative)
  }
  return paths.sort()
}

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
  await mkdir(join(output, 'GeoJSON'), { recursive: true })
  await mkdir(join(output, 'GeoTIFF'), { recursive: true })
  await mkdir(join(output, 'Shapefile'), { recursive: true })
  // Remove flat files left by earlier preparation versions.
  for (const file of [...sources.map(source => source.file), ...rasters]) {
    await rm(join(output, file), { force: true })
  }
  const manifest = { preparedAt: new Date().toISOString(), files: {}, cartoFiles: {}, rasters: {} }

  for (const { file, geometry, required } of sources) {
    try {
      const sourcePath = join(input, file)
      const bytes = await readFile(sourcePath)
      const data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
      if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error(`${file}: FeatureCollection이 아닙니다`)
      }
      const bounds = [Infinity, Infinity, -Infinity, -Infinity]
      const objects = Object.create(null)
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
      if (required && !data.features.length) throw new Error(`${file}: Feature가 비어 있습니다`)
      manifest.files[file] = {
        features: data.features.length,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bounds: data.features.length ? bounds : null,
        objects,
      }
      await copyFile(sourcePath, join(output, 'GeoJSON', file))
    } catch (error) {
      if (required) throw error
      await rm(join(output, 'GeoJSON', file), { force: true })
      manifest.files[file] = { error: error instanceof Error ? error.message : String(error) }
    }
  }

  for (const file of rasters) {
    const source = join(process.cwd(), 'exported_files', 'GeoTIFF', file)
    const bytes = await readFile(source)
    await copyFile(source, join(output, 'GeoTIFF', file))
    manifest.cartoFiles[file] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  }
  const styles = await styleFiles(join(process.cwd(), 'exported_files', 'Styles'))
  for (const relative of styles) {
    const source = join(process.cwd(), 'exported_files', 'Styles', relative)
    const target = join(output, 'Styles', relative)
    const bytes = await readFile(source)
    await mkdir(join(target, '..'), { recursive: true })
    await copyFile(source, target)
    manifest.cartoFiles[`Styles/${relative}`] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  }

  try {
    manifest.rasters.water = await prepareWater(
      join(process.cwd(), 'exported_files', 'GeoTIFF', 'Depth.tif'),
      join(output, 'water-mask.png'),
      manifest.files['Building_Boundary.json'].bounds,
    )
  } catch (error) {
    await rm(join(output, 'water-mask.png'), { force: true })
    manifest.rasters.water = { error: error instanceof Error ? error.message : String(error) }
  }

  const snapshotFiles = Object.entries(manifest.files).map(([file, info]) => `${file}:${info.sha256 ?? 'unavailable'}`)
  snapshotFiles.push(...rasters.map(file => `${file}:${manifest.cartoFiles[file].sha256}`))
  snapshotFiles.push(...styles.map(file => `Styles/${file}:${manifest.cartoFiles[`Styles/${file}`].sha256}`))
  snapshotFiles.unshift('CityMap-snapshot-layout-v2')
  manifest.datasetId = createHash('sha256').update(snapshotFiles.join('\n')).digest('hex').slice(0, 16)

  await writeFile(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  for (const [file, info] of Object.entries(manifest.files)) {
    if (info.error) console.warn(`${file}: ${info.error}`)
    else console.log(`${file}: ${info.features} features, bounds ${info.bounds?.join(', ') ?? 'empty'}`)
  }
  if (manifest.rasters.water.error) console.warn(`Depth.tif: ${manifest.rasters.water.error}`)
  else console.log(`Depth.tif: ${manifest.rasters.water.waterPixels} water pixels`)
}

prepare().catch(error => {
  console.error(`데이터 준비 실패: ${error.message}`)
  process.exitCode = 1
})

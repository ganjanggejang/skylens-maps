import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fromFile } from 'geotiff'
import proj4 from 'proj4'
import pngjs from 'pngjs'

const { PNG } = pngjs

export async function prepareWater(inputPath, outputPath, buildingBounds) {
  const sourceBytes = await readFile(inputPath)
  const tiff = await fromFile(inputPath)
  const image = await tiff.getImage()
  const geoKeys = image.getGeoKeys()
  const epsg = geoKeys.ProjectedCSTypeGeoKey
  const zone = epsg >= 32601 && epsg <= 32660 ? epsg - 32600 :
    epsg >= 32701 && epsg <= 32760 ? epsg - 32700 : null
  if (zone === null) throw new Error(`지원하지 않는 수심 GeoTIFF 좌표계: ${epsg ?? '없음'}`)

  const tiePoints = await image.getTiePoints()
  const pixelScale = await image.fileDirectory.getValue(33550)
  const noData = image.getGDALNoData()
  if (tiePoints.length !== 1 || !pixelScale || pixelScale[0] <= 0 || pixelScale[1] <= 0 ||
      !Number.isFinite(noData)) {
    throw new Error('수심 GeoTIFF의 기준점·픽셀 크기·NoData를 확인할 수 없습니다')
  }

  const width = image.getWidth()
  const height = image.getHeight()
  const tie = tiePoints[0]
  const left = tie.x - tie.i * pixelScale[0]
  const top = tie.y + tie.j * pixelScale[1]
  const right = left + width * pixelScale[0]
  const bottom = top - height * pixelScale[1]
  const utm = `+proj=utm +zone=${zone} ${epsg >= 32700 ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`
  const coordinates = [
    [left, top], [right, top], [right, bottom], [left, bottom],
  ].map(point => proj4(utm, 'EPSG:4326', point))
  const longitude = coordinates.map(point => point[0])
  const latitude = coordinates.map(point => point[1])
  const bounds = [Math.min(...longitude), Math.min(...latitude), Math.max(...longitude), Math.max(...latitude)]
  if (buildingBounds && (bounds[2] < buildingBounds[0] || bounds[0] > buildingBounds[2] ||
      bounds[3] < buildingBounds[1] || bounds[1] > buildingBounds[3])) {
    throw new Error('수심 GeoTIFF와 건물 좌표 범위가 겹치지 않습니다')
  }

  const [depth] = await image.readRasters({ samples: [0] })
  if (depth.length !== width * height) throw new Error('수심 픽셀 수가 이미지 크기와 다릅니다')
  const png = new PNG({ width, height })
  let waterPixels = 0
  for (let i = 0; i < depth.length; i += 1) {
    if (depth[i] === noData || depth[i] <= 0) continue
    const offset = i * 4
    png.data[offset] = 166
    png.data[offset + 1] = 208
    png.data[offset + 2] = 221
    png.data[offset + 3] = 255
    waterPixels += 1
  }
  if (!waterPixels) throw new Error('수심 GeoTIFF에 물 픽셀이 없습니다')
  await writeFile(outputPath, PNG.sync.write(png))
  return {
    file: 'water-mask.png',
    source: 'Depth.tif',
    sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
    epsg,
    noData,
    width,
    height,
    waterPixels,
    coordinates,
    bounds,
  }
}

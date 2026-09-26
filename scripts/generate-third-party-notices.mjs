import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const app = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
const names = new Set()

function visit(name) {
  if (names.has(name)) return
  const entry = lock.packages[`node_modules/${name}`]
  if (!entry) throw new Error(`Runtime dependency missing from lockfile: ${name}`)
  names.add(name)
  for (const child of Object.keys(entry.dependencies ?? {})) visit(child)
}

for (const name of Object.keys(app.dependencies)) visit(name)

const parts = [
  'SKYLENS MAPS — third-party notices',
  'Generated from package-lock.json and installed runtime packages.',
  'Only the compiled web app is distributed; Node.js packages are not installed on player machines.',
  'Carto is a separate required mod and its DLL is not included in this package:',
  'https://github.com/taipei-native/Carto/blob/main/LICENSE.txt',
]
for (const name of [...names].sort()) {
  const packageDir = path.join(root, 'node_modules', name)
  const metadata = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
  const licenseName = fs.readdirSync(packageDir).find(file => /^(license|licence|copying)(\.|$)/i.test(file))
  const readme = fs.readdirSync(packageDir).find(file => /^readme\.md$/i.test(file))
  const readmeText = readme ? fs.readFileSync(path.join(packageDir, readme), 'utf8') : ''
  const readmeLicense = readmeText.match(/^## License[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.trim()
  const license = licenseName
    ? fs.readFileSync(path.join(packageDir, licenseName), 'utf8').trim()
    : readmeLicense ?? `${metadata.license ?? 'UNSPECIFIED'} (package metadata); no license text shipped by the package.`
  parts.push(`\n${'='.repeat(72)}\n${name} ${metadata.version} — ${metadata.license ?? 'see text'}\n${'='.repeat(72)}\n${license}`)
}

const output = path.join(root, 'mod', 'CityMap', 'Properties', 'THIRD_PARTY_NOTICES.txt')
fs.writeFileSync(output, parts.join('\n') + '\n')
console.log(`Wrote ${names.size} runtime package notices to ${path.relative(root, output)}`)

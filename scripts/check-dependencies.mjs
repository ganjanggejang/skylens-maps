import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cruise } from 'dependency-cruiser'
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config'
import ts from 'typescript'
import config from '../.dependency-cruiser.cjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const slash = path => path.replaceAll('\\', '/')
const matches = (patterns, path) => patterns && [patterns].flat().some(pattern => new RegExp(pattern).test(path))

// dependency-cruiser does not extract new Worker(new URL(..., import.meta.url)).
// Scan all src files, so workers are independently checked, then validate their
// actual creation targets instead of silently omitting these runtime connections.
function checkWorkerEntries(root, graph) {
  const violations = []
  const modules = new Set(graph.modules.map(module => module.source))
  for (const module of graph.modules) {
    if (!/^src\/.*\.(?:ts|tsx|js|mjs)$/.test(module.source) || /[.](?:test|spec)[.]/.test(module.source)) continue
    const source = ts.createSourceFile(module.source, readFileSync(resolve(root, module.source), 'utf8'),
      ts.ScriptTarget.Latest, true)
    function visit(node) {
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
        ['Worker', 'SharedWorker'].includes(node.expression.text)) {
        const url = node.arguments?.[0]
        const literal = url && ts.isNewExpression(url) && ts.isIdentifier(url.expression) &&
          url.expression.text === 'URL' && url.arguments?.[0]
        const base = url && ts.isNewExpression(url) && url.arguments?.[1]
        const isModuleUrl = base && ts.isPropertyAccessExpression(base) && base.name.text === 'url' &&
          ts.isMetaProperty(base.expression) && base.expression.keywordToken === ts.SyntaxKind.ImportKeyword
        const isStatic = literal && (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal))
        let target = '(non-static worker entry)'
        if (isStatic && isModuleUrl) {
          target = slash(relative(root, resolve(dirname(resolve(root, module.source)), literal.text)))
        }
        const isCoreWorker = /^src\/routing\/[^/]+[.]worker[.]ts$/.test(target)
        if (!isCoreWorker || !modules.has(target)) {
          violations.push({ from: module.source, to: target,
            rule: { name: 'worker-entry-boundary', severity: 'error' } })
        }
        // Worker URL edges must obey the same module direction as normal imports.
        for (const rule of config.forbidden.filter(rule => rule.name.endsWith('-boundary'))) {
          if (matches(rule.from.path, module.source) && !matches(rule.from.pathNot, module.source) &&
            matches(rule.to.path, target) && !matches(rule.to.pathNot, target)) {
            violations.push({ from: module.source, to: target,
              rule: { name: rule.name, severity: rule.severity } })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return violations
}

export async function checkDependencies(root = projectRoot) {
  root = resolve(root)
  const tsConfigPath = resolve(root, 'tsconfig.json')
  const configPath = existsSync(tsConfigPath) ? tsConfigPath : resolve(projectRoot, 'tsconfig.json')
  const tsConfig = extractTSConfig(configPath)
  const options = { ...config.options, baseDir: root, outputType: 'json', validate: true,
    tsConfig: { fileName: configPath } }
  const readGraph = async (rules, types) => {
    const result = await cruise(['src'], {
      ...options, tsPreCompilationDeps: types, ruleSet: { forbidden: rules },
    }, config.options.enhancedResolveOptions, { tsConfig })
    return typeof result.output === 'string' ? JSON.parse(result.output) : result.output
  }
  // Keep the passes sequential: dependency-cruiser shares internal parser caches.
  const fullGraph = await readGraph(config.forbidden.filter(rule => rule.name !== 'no-runtime-circular'), 'specify')
  const runtimeGraph = await readGraph(config.forbidden.filter(rule => rule.name === 'no-runtime-circular'), false)
  const violations = [...fullGraph.summary.violations, ...runtimeGraph.summary.violations,
    ...checkWorkerEntries(root, fullGraph)]
  return { violations, fullGraph, runtimeGraph }
}

export function reportDependencies({ violations }, output = console) {
  for (const violation of violations) {
    const message = violation.rule.severity + ' ' + violation.rule.name + ': ' + violation.from + ' -> ' + violation.to
    if (violation.rule.severity === 'error') output.error(message)
    else output.warn(message)
  }
  const errors = violations.filter(violation => violation.rule.severity === 'error').length
  const warnings = violations.filter(violation => violation.rule.severity === 'warn').length
  output.log('Dependency checks: ' + errors + ' errors, ' + warnings + ' warnings (runtime + types).')
  return errors ? 1 : 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length && !(args.length === 2 && args[0] === '--root' && isAbsolute(args[1]))) {
      throw new Error('Usage: node scripts/check-dependencies.mjs [--root <absolute fixture root>]')
    }
    process.exitCode = reportDependencies(await checkDependencies(args[1] ?? projectRoot))
  } catch (error) {
    console.error('Dependency check failed: ' + error.message)
    process.exitCode = 1
  }
}

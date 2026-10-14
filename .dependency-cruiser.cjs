/** @type {import('dependency-cruiser').IConfiguration} */
const tests = '[.](?:test|spec)[.](?:ts|tsx|js|mjs)$'
const routingAdapters = '^src/routing/(?:Directions[.]tsx|useDirections[.]ts|directions-model[.]ts|directions-layers[.]ts|worker-client[.]ts)$'
const react = '(?:^|/)node_modules/(?:react(?:-dom)?|@types/react(?:-dom)?)(?:/|$)'
const frameworks = '(?:^|/)node_modules/(?:react(?:-dom)?|@types/react(?:-dom)?|maplibre-gl|@maplibre)(?:/|$)'
const routingCore = { path: '^src/routing/', pathNot: [tests, routingAdapters] }

function boundary(name, from, allowed) {
  return {
    name, severity: 'error',
    comment: 'Keep imports, including type references, within this module and its lower-level dependencies.',
    from: { path: from, pathNot: tests },
    to: { path: '^src/', pathNot: allowed },
  }
}

module.exports = {
  forbidden: [
    {
      name: 'no-runtime-circular', severity: 'error',
      comment: 'The checker evaluates this rule on the runtime graph, without erased TypeScript imports.',
      from: { path: '^src/', pathNot: tests }, to: { circular: true },
    },
    {
      name: 'no-type-circular', severity: 'warn',
      comment: 'Cycles that require erased type references are advisory; module boundaries still apply.',
      from: { path: '^src/', pathNot: tests },
      to: { circular: true, preCompilationOnly: true },
    },
    boundary('data-boundary', '^src/data/', ['^src/data/']),
    boundary('layer-boundary', '^src/layer/', ['^src/(?:layer|data)/', '^src/i18n[.]tsx$']),
    boundary('search-boundary', '^src/search/', ['^src/(?:search|data)/', '^src/i18n[.]tsx$']),
    boundary('routing-boundary', '^src/routing/', ['^src/(?:routing|search|data)/', '^src/i18n[.]tsx$']),
    boundary('map-boundary', '^src/map/', ['^src/(?:map|data|layer|routing)/']),
    boundary('sidebar-boundary', '^src/sidebar/', ['^src/(?:sidebar|search|routing|data)/', '^src/i18n[.]tsx$']),
    boundary('i18n-boundary', '^src/i18n[.]tsx$', ['^src/i18n[.]tsx$']),
    {
      name: 'no-feature-to-composition', severity: 'error',
      comment: 'Only main, App and MapView compose the application; lower-level modules cannot import them.',
      from: { path: '^src/', pathNot: [tests, '^src/(?:main|App|MapView)[.]tsx$'] },
      to: { path: '^src/(?:main|App|MapView)[.]tsx$' },
    },
    {
      name: 'data-no-react', severity: 'error',
      comment: 'useCityDataset is the React adapter; other data code must not reach React or that adapter.',
      from: { path: '^src/data/', pathNot: [tests, '^src/data/useCityDataset[.]ts$'] },
      to: { path: [react, '^src/data/useCityDataset[.]ts$'], reachable: true },
    },
    {
      name: 'routing-core-no-ui', severity: 'error',
      comment: 'Algorithms and worker contracts cannot reach UI, adapters or rendering code, even via a helper.',
      from: routingCore,
      to: {
        path: [routingAdapters, '^src/(?:map|layer|search|sidebar)/', '^src/(?:i18n|main|App|MapView)[.]tsx$',
          '^src/data/useCityDataset[.]ts$'],
        reachable: true,
      },
    },
    {
      name: 'routing-core-no-frameworks', severity: 'error',
      comment: 'Routing algorithms must remain independent of React and MapLibre, including their types.',
      from: routingCore, to: { path: frameworks, reachable: true },
    },
    {
      name: 'no-production-to-tests', severity: 'error',
      from: { path: '^src/', pathNot: tests }, to: { path: tests },
    },
    {
      name: 'no-unresolved', severity: 'error',
      from: { path: '^src/' }, to: { couldNotResolve: true },
    },
    {
      name: 'no-undeclared-packages', severity: 'error',
      from: { path: '^src/' }, to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-runtime-dev-deps', severity: 'error',
      from: { path: '^src/', pathNot: tests },
      to: { dependencyTypes: ['npm-dev'], preCompilationOnly: false, pathNot: '(?:^|/)node_modules/@types/' },
    },
  ],
  options: {
    doNotFollow: { path: '(?:^|/)node_modules/' },
    // Standalone CLI defaults to runtime cycles; check:deps also runs the full type graph.
    tsPreCompilationDeps: false,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.js', '.ts', '.tsx', '.mjs', '.cjs', '.d.ts', '.json'],
      mainFields: ['types', 'typings', 'module', 'main'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
}

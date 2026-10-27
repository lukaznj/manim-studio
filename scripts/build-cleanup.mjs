import { build } from 'esbuild'
await build({ entryPoints: ['src/main/cleanup-cli.ts'], outfile: 'out/main/cleanup-cli.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22' })

#!/usr/bin/env node
/**
 * Bundle the Lambda handler for deployment.
 * Uses esbuild to create a single-file bundle.
 * @sparticuz/chromium is provided via Lambda Layer, not bundled.
 */
import * as esbuild from 'esbuild'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const outDir = join(projectRoot, 'dist', 'lambda')
const fontsDir = join(projectRoot, 'fonts')

// Clean and recreate output directory
if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true })
}
mkdirSync(outDir, { recursive: true })

console.log('Bundling Lambda handler...')

await esbuild.build({
  entryPoints: [join(projectRoot, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: join(outDir, 'index.js'),
  format: 'cjs',
  minify: true,
  sourcemap: false,
  external: [
    '@aws-sdk/*', // AWS SDK v3 is available in Lambda runtime
    '@sparticuz/chromium', // Provided via Lambda Layer
  ],
})

// Copy fonts directory if it exists (for emoji support)
if (existsSync(fontsDir)) {
  const outFontsDir = join(outDir, 'fonts')
  cpSync(fontsDir, outFontsDir, { recursive: true })
  console.log(`Copied fonts to ${outFontsDir}`)
}

// Check final size
const { execSync } = await import('node:child_process')
const size = execSync(`du -sh ${outDir}`, { encoding: 'utf-8' }).trim()
console.log(`Bundle size: ${size}`)
console.log(`Bundle created at ${outDir}/index.js`)

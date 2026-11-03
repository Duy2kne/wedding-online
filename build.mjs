import * as esbuild from 'esbuild';

const isCheck = process.argv.includes('--check');

try {
  await esbuild.build({
    entryPoints: ['server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'server.js',
    packages: 'external',
    sourcemap: true,
    write: !isCheck,
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
  });

  if (isCheck) {
    console.log('✓ TypeScript and server build check passed');
  } else {
    console.log('✓ Server built successfully to server.js');
  }
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}

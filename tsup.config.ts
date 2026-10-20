import { defineConfig } from 'tsup';

const entry = {
  index: 'src/index.ts',
  'contracts/index': 'src/contracts/index.ts',
};

const common = {
  entry,
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: 'es2020' as const,
  external: ['@stellar/stellar-sdk'],
};

export default defineConfig([
  {
    ...common,
    format: ['esm'],
    outDir: 'dist/esm',
  },
  {
    ...common,
    // Do not clean: this would wipe the ESM output emitted above.
    clean: false,
    format: ['cjs'],
    outDir: 'dist/cjs',
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.js' };
    },
  },
]);

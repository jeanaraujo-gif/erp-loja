// Starts an embedded PostgreSQL, applies migrations, creates an admin user,
// and launches the Next.js dev server — no external database needed.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const port = 5488;
const dbUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?schema=public`;
const origin = 'http://localhost:3000';

console.log('⏳ Iniciando PostgreSQL embutido...');
const pg = new EmbeddedPostgres({
  database_dir: './work/pg-data',
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
});

try {
  await pg.initialise();
} catch {
  // already initialised
}
await pg.start();
console.log(`✅ PostgreSQL rodando na porta ${port}`);

// Write .env so prisma and next can find the database
writeFileSync('.env', `DATABASE_URL="${dbUrl}"\nAPP_ORIGIN="${origin}"\n`);
console.log('✅ Arquivo .env criado');

// Generate prisma client & apply migrations
console.log('⏳ Gerando Prisma Client...');
execSync('npx prisma generate', { stdio: 'inherit' });

console.log('⏳ Aplicando migrações...');
execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: dbUrl } });

// Create admin user if none exists
console.log('⏳ Verificando administrador...');
try {
  execSync('npm run tools:build', { stdio: 'inherit' });
  const { authService } = require('../.tools/src/modules/auth/service.js');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasourceUrl: dbUrl });
  const count = await prisma.user.count();
  if (count === 0) {
    const password = `Admin-1!${randomBytes(8).toString('base64url')}`;
    const adapter = {
      query: async (sql, params = []) => {
        const result = await prisma.$queryRawUnsafe(sql, ...params);
        return result;
      },
      transaction: (fn) => prisma.$transaction(async (tx) => {
        const txAdapter = {
          query: async (sql, params = []) => tx.$queryRawUnsafe(sql, ...params),
          transaction: (fn2) => fn2(txAdapter),
        };
        return fn(txAdapter);
      }),
    };
    await authService(adapter).bootstrap({
      name: 'Admin',
      email: 'admin@loja.local',
      password,
      roleCode: 'ADMIN',
    });
    console.log(`\n╔════════════════════════════════════════════╗`);
    console.log(`║  Administrador criado!                     ║`);
    console.log(`║  E-mail: admin@loja.local                  ║`);
    console.log(`║  Senha:  ${password.padEnd(33)}║`);
    console.log(`╚════════════════════════════════════════════╝\n`);
    await prisma.$disconnect();
  } else {
    console.log(`✅ Já existem ${count} usuário(s) — pulando criação do admin.`);
    await prisma.$disconnect();
  }
} catch (e) {
  console.log('⚠️  Não foi possível criar admin automaticamente:', e.message);
  console.log('   Use "npm run admin:create" manualmente depois.');
}

// Start Next.js dev
console.log('🚀 Iniciando Next.js em http://localhost:3000 ...\n');
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: dbUrl, APP_ORIGIN: origin },
  windowsHide: true,
});

process.on('SIGINT', async () => {
  next.kill();
  await pg.stop();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  next.kill();
  await pg.stop();
  process.exit(0);
});
next.on('exit', async (code) => {
  await pg.stop();
  process.exit(code ?? 1);
});

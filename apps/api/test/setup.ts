import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = async () => {
  const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/forecastccu_test';
  process.env.DATABASE_URL = url;

  // Push schema to test database (idempotent)
  execSync('npx prisma db push --schema ../../prisma/schema.prisma --skip-generate --force-reset', {
    cwd: __dirname + '/..',
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  await prisma.$connect();
  (global as Record<string, unknown>).__PRISMA__ = prisma;
};

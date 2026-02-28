import { PrismaClient } from '@prisma/client';

module.exports = async () => {
  const prisma = (global as Record<string, unknown>).__PRISMA__ as PrismaClient | undefined;
  if (prisma) {
    await prisma.$disconnect();
  }
};

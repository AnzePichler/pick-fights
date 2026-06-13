// scripts/clear-base64-avatars.ts
import { prisma } from "../lib/prisma";

async function main() {
  const result = await prisma.user.updateMany({
    where: {
      imageUrl: {
        startsWith: "data:image/",
      },
    },
    data: {
      imageUrl: null,
    },
  });

  console.log(`Cleared ${result.count} base64 avatar(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

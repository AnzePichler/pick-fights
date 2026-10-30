import "dotenv/config";
import { AvatarValidationError, decodeAvatar } from "../lib/avatars";
import { prisma } from "../lib/prisma";

class ChangedAvatarError extends Error {}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== "--apply")) {
    throw new Error("Usage: npx tsx scripts/migrate-avatars.ts [--apply]");
  }

  const apply = args.includes("--apply");
  const counts = { scanned: 0, valid: 0, migrated: 0, invalid: 0, changed: 0, failed: 0 };
  let cursor: string | undefined;

  while (true) {
    const users = await prisma.user.findMany({
      where: { imageUrl: { startsWith: "data:" } },
      select: { id: true, imageUrl: true },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (users.length === 0) break;

    for (const user of users) {
      counts.scanned++;
      try {
        const decoded = decodeAvatar(user.imageUrl!);
        counts.valid++;
        if (!apply) continue;

        await prisma.$transaction(async (transaction) => {
          const current = await transaction.user.findUnique({
            where: { id: user.id },
            select: { imageUrl: true },
          });
          if (!current || current.imageUrl !== user.imageUrl) throw new ChangedAvatarError();

          await transaction.userAvatar.deleteMany({ where: { userId: user.id } });
          const avatar = await transaction.userAvatar.create({
            data: { userId: user.id, ...decoded },
            select: { id: true },
          });
          const updated = await transaction.user.updateMany({
            where: { id: user.id, imageUrl: user.imageUrl },
            data: { imageUrl: `/api/avatars/${avatar.id}` },
          });
          if (updated.count !== 1) throw new ChangedAvatarError();
        });
        counts.migrated++;
      } catch (error) {
        if (error instanceof AvatarValidationError) counts.invalid++;
        else if (error instanceof ChangedAvatarError) counts.changed++;
        else counts.failed++;
      }
    }
    cursor = users[users.length - 1].id;
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...counts }));
  if (counts.failed > 0) process.exitCode = 1;
}

main()
  .catch(() => {
    console.error("Avatar migration failed; no profile values were logged.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

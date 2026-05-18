import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env.vercel-test") });
dotenv.config();

async function main() {
  const { prisma } = await import("@/lib/prisma");

  const subs = await prisma.pushSubscription.findMany({
    where: { enabled: true },
    orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
    take: 10,
    select: {
      id: true,
      userId: true,
      endpoint: true,
      userAgent: true,
      lastSeenAt: true,
      updatedAt: true,
      user: {
        select: {
          favoriteTeam: true,
        },
      },
    },
  });

  const notes = await prisma.notification.findMany({
    where: {
      payload: {
        path: ["source"],
        equals: "manual_test",
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      userId: true,
      title: true,
      body: true,
      sentAt: true,
      createdAt: true,
      payload: true,
    },
  });

  console.log("SUBS");
  console.log(JSON.stringify(subs, null, 2));
  console.log("NOTES");
  console.log(JSON.stringify(notes, null, 2));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

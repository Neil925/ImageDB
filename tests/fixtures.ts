import crypto from "crypto";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, posts, users } from "@/db/schema";
import { handleUpload } from "@/lib/upload";
import { handleMedia } from "@/worker/handlers";

export interface Fixtures {
  adminId: string;
  uploaderId: string;
  modId: string;
  viewerId: string;
  postIds: number[];
}

export async function makeImage(i: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
    <rect width="300" height="200" fill="hsl(${(i * 41) % 360} 60% 45%)"/>
    <circle cx="${(i * 17) % 300}" cy="${(i * 11) % 200}" r="50" fill="hsl(${(i * 91) % 360} 70% 65%)"/>
  </svg>`;
  return sharp(Buffer.from(svg))
    .withExif({ IFD0: { Make: "TestCam" } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function user(name: string, role: string) {
  const id = `u-${role}-${name}`;
  const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (existing[0]) return id;
  await db.insert(users).values({ id, name, email: `${id}@example.invalid`, role: role as never });
  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: "test-no-login",
  });
  return id;
}

let done: Promise<Fixtures> | null = null;

export function fixtures(): Promise<Fixtures> {
  done ??= (async () => {
    const adminId = await user("admin", "admin");
    const uploaderId = await user("upload", "uploader");
    const modId = await user("mod", "moderator");
    const viewerId = await user("view", "viewer");

    const TAGSETS: string[][] = [
      ["cat", "cat_ears"], // implies animal_ears (added below)
      ["cat"],
      ["cat", "night"],
      ["night", "stars"],
      ["night"],
      ["snow", "mountains"],
      ["snow"],
      ["fog", "street"],
      ["fog"],
      ["sunset", "sky", "clouds"],
      ["sky"],
      ["water", "reflection"],
      ["generated"],
    ];

    const postIds: number[] = [];
    for (let i = 0; i < TAGSETS.length; i++) {
      const buf = await makeImage(i + 1000);
      const res = await handleUpload({
        buf,
        uploaderId,
        tags: TAGSETS[i],
        rating: i % 3 === 0 ? "general" : i % 3 === 1 ? "sensitive" : "questionable",
        sourceUrl: i === 0 ? "https://example.invalid/src" : undefined,
      });
      postIds.push(res.postId);
      await handleMedia({ postId: res.postId });
      await db.update(posts).set({ status: "active" }).where(eq(posts.id, res.postId));
    }

    const { setAliases, addImplication } = await import("@/lib/tags");
    const cat = await (await import("@/lib/tags")).findTagByName("cat");
    if (cat) await setAliases(cat.id, ["kitten"]);
    // implication + backfill applied synchronously (worker path):
    await addImplication("cat_ears", "animal_ears");
    const { handleBackfill } = await import("@/worker/handlers");
    const a = await (await import("@/lib/tags")).findTagByName("cat_ears");
    const c = await (await import("@/lib/tags")).findTagByName("animal_ears");
    if (a && c) await handleBackfill({ antecedentId: a.id, consequentId: c.id });

    return { adminId, uploaderId, modId, viewerId, postIds };
  })();
  return done;
}

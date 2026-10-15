// What App Service starts ("node server.js"): Next's own standalone server,
// renamed next-server.js by the deploy, with its cache moved to local disk first.
//
// Next keeps the optimized images under .next/cache/images and, before it
// serves or stores the first one after a boot, reads every entry back to size
// its LRU. On App Service that directory sits on /home, a network share: with
// twenty-five thousand entries the read took over twenty minutes, and every
// /_next/image request waited for it — after each restart the portal showed no
// photos at all. /tmp belongs to the container and is empty at every boot, so
// the read costs nothing; what a restart loses is the optimized copies, which
// are made again on demand.
//
// CommonJS, because the standalone output has no package.json "type"; the
// modules are imported rather than required only to keep the linter's rule.
async function start() {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const next = path.join(__dirname, ".next");
  const cache = path.join(next, "cache");
  const local = path.join(os.tmpdir(), "next-cache");

  await moveCacheToLocalDisk(fs, cache, local).catch((error) =>
    console.error("Image cache left on /home:", error),
  );
  await import("./next-server.js");
  deleteStaleCaches(fs, path, next).catch((error) =>
    console.error("Stale image cache not deleted:", error),
  );
}

async function moveCacheToLocalDisk(fs, cache, local) {
  await fs.mkdir(local, { recursive: true });
  const current = await fs.lstat(cache).catch(() => null);
  if (current?.isSymbolicLink()) return;
  // The cache a boot before this one left on the share is set aside at once —
  // a rename is one operation — and deleted in the background, since deleting
  // it file by file takes as long as reading it. A deletion a restart cut
  // short is picked up again here.
  if (current) await fs.rename(cache, `${cache}-stale-${Date.now()}`);
  await fs.symlink(local, cache);
}

async function deleteStaleCaches(fs, path, next) {
  for (const name of await fs.readdir(next)) {
    if (name.startsWith("cache-stale-")) {
      await fs.rm(path.join(next, name), { recursive: true, force: true });
    }
  }
}

start();

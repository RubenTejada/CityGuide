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

  const cache = path.join(__dirname, ".next", "cache");
  const local = path.join(os.tmpdir(), "next-cache");

  await moveCacheToLocalDisk(fs, cache, local).catch((error) =>
    console.error("Image cache left on /home:", error),
  );
  await import("./next-server.js");
}

async function moveCacheToLocalDisk(fs, cache, local) {
  await fs.mkdir(local, { recursive: true });
  const current = await fs.lstat(cache).catch(() => null);
  if (current?.isSymbolicLink()) return;
  // The cache a boot before this one left on the share is set aside — a
  // rename is one operation. It is not deleted from here: unlinking tens of
  // thousands of files over the share fills libuv's thread pool, and the server
  // then never finished booting inside App Service's 230-second startup probe.
  if (current) await fs.rename(cache, `${cache}-stale-${Date.now()}`);
  await fs.symlink(local, cache);
}

start();

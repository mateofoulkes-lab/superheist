const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
http
  .createServer((req, res) => {
    try {
      const url = new URL(req.url, "http://localhost"),
        rel = decodeURIComponent(url.pathname),
        file = path.resolve(root, "." + rel);
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      let target = file;
      if (fs.statSync(target).isDirectory())
        target = path.join(target, "index.html");
      res.writeHead(200, {
        "Content-Type":
          mime[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(target).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("No encontrado");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log("Superheist: http://127.0.0.1:" + port + "/tools/simulator/"),
  );

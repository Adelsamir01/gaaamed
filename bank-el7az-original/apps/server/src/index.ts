import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { RoomManager } from "./rooms/RoomManager.js";
import { StatsStore, resolveStatsFilePath } from "./stats/StatsStore.js";
import { parseClientMessage } from "./websocket/validation.js";

const port = Number(process.env.PORT ?? 3001);
const statsStore = new StatsStore(resolveStatsFilePath());
const roomManager = new RoomManager(statsStore);

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        ok: true,
        name: "سيرفر بنك الحظ",
        time: new Date().toISOString()
      })
    );
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname === "/api/stats") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(JSON.stringify(statsStore.getSnapshot(roomManager.getLiveStats())));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: false, error: "مش موجود" }));
});

const wss = new WebSocketServer({ server, path: "/ws", perMessageDeflate: false });

wss.on("connection", (socket) => {
  roomManager.register(socket);

  socket.on("message", (data) => {
    const message = parseClientMessage(data.toString());
    if (!message) {
      socket.send(JSON.stringify({ type: "ACTION_REJECTED", payload: { message: "رسالة مش صحيحة." } }));
      return;
    }

    roomManager.handleMessage(socket, message);
  });

  socket.on("close", () => {
    roomManager.handleClose(socket);
  });
});

setInterval(() => {
  roomManager.cleanup();
}, 1000 * 60 * 10).unref();

server.listen(port, () => {
  console.log(`سيرفر بنك الحظ شغال على ${port}`);
});

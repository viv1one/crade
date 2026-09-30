import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fetchWithProgress } from "./client";
import type { ProgressUpdate } from "./types";

// Real sockets, not mocks: these exercise the failure modes that only show
// up over an actual connection (server dies mid-stream, proxy answers with
// an HTML error page, chunk boundaries fall mid-line).
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const nd = { "Content-Type": "application/x-ndjson" };
    switch (req.url) {
      case "/ok":
        res.writeHead(200, nd);
        res.write('{"type":"progress","text":"a","done":1,"total":2}\n');
        res.end('{"type":"result","status":200,"data":{"v":1}}\n');
        break;
      case "/split": {
        // one event split across two chunks, mid-JSON
        res.writeHead(200, nd);
        const line = '{"type":"result","status":200,"data":{"v":"split"}}\n';
        res.write(line.slice(0, 20));
        setTimeout(() => res.end(line.slice(20)), 30);
        break;
      }
      case "/drop":
        // progress then the socket dies with no result/error event
        res.writeHead(200, nd);
        res.write('{"type":"progress","text":"working"}\n');
        setTimeout(() => res.end(), 30); // clean close, but never sent a result
        break;
      case "/reset":
        res.writeHead(200, nd);
        res.write('{"type":"progress","text":"working"}\n');
        setTimeout(() => req.socket.destroy(), 30); // abrupt connection reset
        break;
      case "/stream-error":
        res.writeHead(200, nd);
        res.end('{"type":"error","status":502,"error":"AI down"}\n');
        break;
      case "/proxy-html":
        res.writeHead(502, { "Content-Type": "text/html" });
        res.end("<html><body>502 Bad Gateway</body></html>");
        break;
      case "/plain-json":
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"rows":[1,2,3]}');
        break;
      case "/plain-json-error":
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"error":"bad input"}');
        break;
      case "/html-200":
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html>login page</html>");
        break;
      default:
        res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("fetchWithProgress against a real socket", () => {
  it("delivers progress then the result", async () => {
    const seen: ProgressUpdate[] = [];
    const data = await fetchWithProgress<{ v: number }>(`${base}/ok`, {}, (u) => seen.push(u));
    expect(data).toEqual({ v: 1 });
    expect(seen).toEqual([{ text: "a", done: 1, total: 2 }]);
  });

  it("reassembles an event split across chunks", async () => {
    expect(await fetchWithProgress(`${base}/split`)).toEqual({ v: "split" });
  });

  it("gives a clear error when the stream ends without a result", async () => {
    await expect(fetchWithProgress(`${base}/drop`)).rejects.toThrow(/connection lost/i);
  });

  it("rejects (does not hang) when the connection is reset mid-stream", async () => {
    await expect(fetchWithProgress(`${base}/reset`)).rejects.toThrow();
  });

  it("surfaces an error event's message", async () => {
    await expect(fetchWithProgress(`${base}/stream-error`)).rejects.toThrow("AI down");
  });

  it("handles a proxy HTML error page without a cryptic JSON parse error", async () => {
    await expect(fetchWithProgress(`${base}/proxy-html`)).rejects.toThrow("Request failed (502)");
  });

  it("handles a 200 HTML page (e.g. a login redirect) as an unexpected response", async () => {
    await expect(fetchWithProgress(`${base}/html-200`)).rejects.toThrow(/unexpected response/i);
  });

  it("passes plain JSON success and error responses through", async () => {
    expect(await fetchWithProgress(`${base}/plain-json`)).toEqual({ rows: [1, 2, 3] });
    await expect(fetchWithProgress(`${base}/plain-json-error`)).rejects.toThrow("bad input");
  });
});

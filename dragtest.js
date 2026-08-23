const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => console.log("JSDOM ERROR:", e.message));
const html =
  '<!doctype html><html><body>' +
  '<div id="ball" style="position:fixed;right:20px;bottom:80px;width:44px;height:44px"></div>' +
  '<div id="panel"><div id="pi-header"><button id="pi-close">x</button></div><div id="pi-list"></div></div>' +
  "</body></html>";
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;
for (const f of ["ev-emitter.js", "get-size.js", "unidragger.js", "draggabilly.js"]) {
  const code = fs.readFileSync("lib/" + f, "utf8");
  const s = window.document.createElement("script");
  s.textContent = code;
  window.document.body.appendChild(s);
}
console.log("Draggabilly type:", typeof window.Draggabilly);
try {
  const ball = window.document.getElementById("ball");
  const d1 = new window.Draggabilly(ball, { dragThreshold: 4 });
  console.log("ball Draggabilly constructed OK");
  d1.on("staticClick", function () {});
  const panel = window.document.getElementById("panel");
  const header = panel.querySelector("#pi-header");
  const d2 = new window.Draggabilly(panel, { handle: header, dragThreshold: 4 });
  console.log("panel Draggabilly constructed OK");
} catch (e) {
  console.log("CONSTRUCTION ERROR:", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
}

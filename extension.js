// vscode-ntfy-client — VS Code toasts + beeps streamed from an ntfy topic.
// Zero dependencies. Desktop + Web: uses only `vscode`, fetch and timers.
// Pairs with the opencode ntfy-notify plugin (session done / error / approval).
const vscode = require("vscode");

const SECTION = "ntfyClient";
const BEEP_VIEW = "ntfyClient.beeper";

let status = null;
let output = null;
let beepView = null;
let beepHintShown = false;

function cfg() {
  const c = vscode.workspace.getConfiguration(SECTION);
  return {
    server: String(c.get("server", "https://ntfy.sh")).replace(/\/+$/, ""),
    topic: String(c.get("topic", "")),
    token: String(c.get("token", "")),
    sound: c.get("sound", true) === true,
    toast: c.get("toast", true) === true,
  };
}

function log(msg) {
  try {
    if (output) output.appendLine(new Date().toISOString() + " " + msg);
  } catch {
    // Logging must never break the loop.
  }
}

function setStatus(text, isError) {
  try {
    if (!status) return;
    status.text = text;
    status.backgroundColor = isError ? new vscode.ThemeColor("statusBarItem.errorBackground") : undefined;
  } catch {
    // Status must never break the loop.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Inline webview: oscillator beep, no audio assets. Unlock with one click
// (browser autoplay policy), then it beeps on postMessage even when hidden
// thanks to retainContextWhenHidden.
function beeperHtml() {
  return (
    '<!DOCTYPE html><html><body style="background:#1e1e1e;color:#ccc;font-family:sans-serif;padding:12px">' +
    '<button id="b">Enable sound</button><div id="s">click once to unlock audio</div>' +
    "<script>(function(){var C=null;var api=(window.acquireVsCodeApi?window.acquireVsCodeApi():null);" +
    "function tone(f){try{C=C||new (window.AudioContext||window.webkitAudioContext)();" +
    "if(C.state==='suspended'){C.resume();}" +
    "var o=C.createOscillator(),g=C.createGain();o.type='sine';o.frequency.value=f||660;" +
    "g.gain.setValueAtTime(0.0001,C.currentTime);" +
    "g.gain.exponentialRampToValueAtTime(0.5,C.currentTime+0.02);" +
    "g.gain.exponentialRampToValueAtTime(0.0001,C.currentTime+0.4);" +
    "o.connect(g);g.connect(C.destination);o.start();o.stop(C.currentTime+0.45);}catch(e){}}" +
    "document.getElementById('b').addEventListener('click',function(){tone(660);" +
    "document.getElementById('s').textContent='sound unlocked';});" +
    "window.addEventListener('message',function(ev){var m=ev.data||{};if(m.beep){tone(m.beep);}});" +
    "if(api){api.postMessage({ready:true});}" +
    "})();</script></body></html>"
  );
}

function beep(freq) {
  try {
    if (beepView) {
      beepView.webview.postMessage({ beep: freq });
      return;
    }
    if (!beepHintShown) {
      beepHintShown = true;
      log("beeper view not open yet: Explorer -> NTFY Beeper, click Enable sound once");
    }
  } catch {
    // Sound must never break the loop.
  }
}

function handleMessage(m) {
  const c = cfg();
  const pri = Number(m.priority || 3);
  const title = m.title || "ntfy";
  const body = m.message || "";
  const text = title + ": " + body;
  log("msg pri=" + pri + " " + text);
  try {
    if (status) status.text = "$(bell) ntfy " + new Date().toLocaleTimeString();
  } catch {
    // ignore
  }
  if (c.toast) {
    try {
      if (pri >= 4) vscode.window.showWarningMessage(text);
      else vscode.window.showInformationMessage(text);
    } catch {
      // ignore
    }
  }
  if (c.sound) beep(pri >= 4 ? 880 : 660);
}

async function consume(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const m = JSON.parse(t);
        if (m && m.event === "message") handleMessage(m);
      } catch {
        // Skip keep-alives / partial frames.
      }
    }
  }
}

function startLoop() {
  let stopped = false;
  let backoff = 1000;
  let ctrl = null;

  async function run() {
    while (!stopped) {
      const c = cfg();
      if (!c.topic) {
        setStatus("$(bell) ntfy: no topic", true);
        log("ntfyClient.topic unset, waiting");
        await sleep(5000);
        continue;
      }
      setStatus("$(radio-tower) ntfy: connecting…");
      try {
        ctrl = new AbortController();
        const headers = {};
        if (c.token) headers.Authorization = "Bearer " + c.token;
        const res = await fetch(c.server + "/" + encodeURIComponent(c.topic) + "/json", {
          headers,
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error("http " + res.status);
        backoff = 1000;
        setStatus("$(check) ntfy: live");
        log("stream connected to " + c.server);
        await consume(res.body);
        log("stream closed by server, reconnecting");
      } catch (err) {
        if (stopped) break;
        setStatus("$(sync~spin) ntfy: retry…", true);
        log("stream error, retry in " + backoff + "ms");
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30000);
      }
    }
  }

  const p = run();
  p.catch(() => {
    // run() already guards internally; belt and suspenders.
  });
  return {
    reconnect(reason) {
      log("reconnect: " + reason);
      try {
        if (ctrl) ctrl.abort();
      } catch {
        // ignore
      }
    },
    stop() {
      stopped = true;
      try {
        if (ctrl) ctrl.abort();
      } catch {
        // ignore
      }
    },
  };
}

/**
 * @param {vscode.ExtensionContext} ctx
 */
function activate(ctx) {
  output = vscode.window.createOutputChannel("NTFY Client");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "ntfy-client.openBeeper";
  status.text = "$(bell) ntfy";
  status.tooltip = "NTFY Client: click to open the beeper view";
  status.show();

  const loop = startLoop();

  ctx.subscriptions.push(status, output);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      BEEP_VIEW,
      {
        resolveWebviewView(view) {
          beepView = view;
          view.webview.options = { enableScripts: true };
          view.webview.html = beeperHtml();
          view.webview.onDidReceiveMessage((m) => {
            if (m && m.ready) log("beeper view ready");
          });
          view.onDidDispose(() => {
            beepView = null;
          });
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand("ntfy-client.openBeeper", async () => {
      try {
        await vscode.commands.executeCommand(BEEP_VIEW + ".focus");
      } catch {
        // View container may be hidden; non-fatal.
      }
    }),
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand("ntfy-client.testSound", () => {
      log("test sound requested");
      beep(660);
    }),
  );
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) loop.reconnect("config changed");
    }),
  );
  ctx.subscriptions.push({ dispose: () => loop.stop() });

  log("activated");
}

function deactivate() {
  // Loop disposal is wired via subscriptions.
}

module.exports = { activate, deactivate };

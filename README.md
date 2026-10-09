# vscode-ntfy-client

VS Code toasts + beeps streamed from an ntfy topic. Companion to the opencode
`ntfy-notify` plugin (session done / error / approval). Zero dependencies,
works on Desktop and Web (tunnel).

## Setup (on your laptop/Mac)

1. Install (source: `~/lab-data/vscode-ntfy-client/`):
   - **Desktop:** copy this folder to `~/.vscode/extensions/ntfy-client/`
     (or `…/ntfy-client-0.1.0/`), then reload VS Code. Or package it:
     `npx -y @vscode/vsce package` here, then
     Extensions view `…` → `Install from VSIX…`.
   - **Web (tunnel):** package to `.vsix` as above, then install the `.vsix`
     via the Extensions view `…` → `Install from VSIX…` in the web UI.
2. Settings (`settings.json`) — same topic as `OPENCODE_NTFY_TOPIC` on the VPS:
   ```json
   {
     "ntfyClient.server": "https://ntfy.sh",
     "ntfyClient.topic": "<your-random-topic>",
     "ntfyClient.token": "",
     "ntfyClient.sound": true,
     "ntfyClient.toast": true
   }
   ```
3. Unlock audio (once): Explorer → `NTFY Beeper` → click **Enable sound**.
   (Browser autoplay policy; the view stays alive hidden afterwards.)
4. Verify: Command Palette → `NTFY: Test Sound` (beep), and post a VPS test:
   `curl -X POST https://ntfy.sh/<topic> -d "hello vscode"` → toast + beep.

Priority ≥ 4 (errors, approvals) arrives as a warning toast + higher beep.
Status bar shows `ntfy: live` / retry state; details in Output → NTFY Client.

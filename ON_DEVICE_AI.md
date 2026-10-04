# On-device AI in ChargeMesh

ChargeMesh uses open-source language models that run **locally** — on the phone, or on your own
laptop — never through a cloud AI API. The code is in `lib/edgeai/`, the settings page is `/ai`.

## What the model does

| Feature | Where in the app | Model task |
|---|---|---|
| **Ask ChargeMesh** | text box on the Drive page | Turns a sentence in English, Hindi, Tamil, Telugu, Kannada, Malayalam or Marathi ("cheapest charge on the way to Tambaram, I can wait an hour") into a structured request: destination, priority, flexibility, target battery, priority pass. The app then runs the normal search or trip plan with it. |
| **Explain this pick** | under the recommended station | Writes a two-sentence explanation of the recommendation in the driver's chosen language, from the facts the matcher returned. |

Station matching, queue prediction, pricing and routing are **not** done by the language model.
They run on the ChargeMesh backend (deterministic optimiser + Ola Maps). The model only handles
language, so a wrong answer from a small model can never produce an unsafe or invalid booking:
its output is validated and clamped (`clean()` in `lib/edgeai/tasks.ts`) before use.

## Engines (tried in this order)

1. **Phone · Snapdragon NPU** — an OpenAI-compatible model server on the phone itself, executing on
   the Hexagon NPU. ChargeMesh calls it at `http://127.0.0.1:<port>/v1` (loopback only).
   - Qualcomm **GenieAPIService** (from `quic/ai-engine-direct-helper`, Android APK) — port `8910`
   - Qualcomm **GenieX** (`geniex serve`) — port `18181`
   - Models: QNN context binaries from Qualcomm AI Hub (Llama 3.2 3B, Phi-3.5-mini, Qwen 2.5, IBM Granite …)
2. **Phone · in-app model** — WebLLM (MLC) inside the PWA. Zero install: the weights download once,
   are cached on the phone and work offline. Default `Llama-3.2-1B-Instruct-q4f16_1`; Qwen 2.5 1.5B,
   Gemma 2 2B and SmolLM2 360M are selectable.
   **This path runs on the Adreno GPU through WebGPU, not on the NPU** — browsers have no NPU access.
3. **Laptop · Office Kit link** — a bigger model on the laptop for deeper compute (see below).
4. **Built-in rules** — keyword/regex parser, so every feature still works with no model at all.

Every answer carries a badge saying which engine produced it and how long it took.

## Set up the phone NPU engine (iQOO, Snapdragon 8 Elite)

1. Install GenieAPIService on the phone and push a model built for the phone's chipset
   (see the `samples/genie/python` + Android docs in `quic/ai-engine-direct-helper`), **or** run GenieX.
2. Start the service. It must allow browser calls (CORS) from the app's origin — if your build
   doesn't, run the bridge below *on the phone* (Termux: `node laptop-bridge.mjs --upstream http://127.0.0.1:8910/v1 --no-code --port 8911`)
   and point the app at `http://127.0.0.1:8911/v1`.
3. Open **AI** in the app → the "Phone · Snapdragon NPU" row turns green → *Try it*.

Until that is running, press **Download and load model** on the AI page to use the in-app model.

## Office Kit: bridging the phone to the laptop

Small phone models are good at extracting intent; longer explanations are better from a larger model.
When a laptop is paired, ChargeMesh sends the *explanation* task there first and keeps intent
parsing on the phone.

1. On the laptop run a model server — e.g. `ollama run qwen2.5:7b`, or GenieX on a Snapdragon X laptop
   (which uses the laptop's NPU).
2. `node tools/laptop-bridge.mjs` (add `--upstream http://127.0.0.1:18181/v1` for GenieX).
   It prints a link and a pairing code and **copies them to the clipboard**.
3. With **Office Kit** connected, the clipboard is shared: paste the link and code on the phone in
   **AI → Laptop · Office Kit link**.
4. Give the phone a path to the laptop port (the app is https, so the browser only allows plain-http
   to `127.0.0.1`):
   - USB: `adb reverse tcp:8787 tcp:8787`, or
   - wireless: `cloudflared tunnel --url http://127.0.0.1:8787` and paste the https link + `/v1`.

Office Kit also covers the demo itself: mirror the phone on the laptop screen for the judges, and
drag a sideloaded model file from laptop to phone.

**What Office Kit is and isn't here:** it is the pairing and transport convenience (shared clipboard,
file transfer, screen mirroring). The inference call itself is ordinary HTTP to the bridge; Office Kit
has no public compute-offload API that we call.

## Not verified yet

Built and tested in a sandbox with a mock OpenAI-compatible server on port 8910 — the engine routing,
JSON handling, UI and fallbacks are tested end-to-end. **Not yet run on real hardware:** GenieAPIService
/ GenieX on the iQOO phone (including whether it sends CORS headers), WebLLM model download on the
phone's Chrome, and the Office Kit clipboard hand-off. Check these three on the device before the demo.

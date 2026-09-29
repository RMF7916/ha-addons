#!/usr/bin/env python3
"""whisper.cpp achter een HTTP-eindpunt, voor FlightTrackNL.

Alleen de standaardbibliotheek, net als de rest van FlightTrackNL, zodat er in dit image niets
te onderhouden valt behalve whisper.cpp zelf.

De verdeling van het werk: FlightTrackNL bepaalt wat er gebeurt, deze dienst voert het uit.
Het knippen per transmissie, de kandidaten uit wat er nu in de lucht is, het lexicon en het
leren blijven bij de tracker, want die heeft de ADS-B-gegevens. Ook de keuze van de vlaggen
blijft daar: beam, best_of en het rekenvenster komen als queryparameters mee. Zo staan de
instellingen die we hebben uitgemeten op één plek, in config.json van de tracker, en hoeft dit
image niet opnieuw gebouwd te worden als je er iets aan verandert.

  GET  /health                       -> {"ok":true,"model":"atc-small","threads":3,...}
  POST /stt?beam=1&best_of=1&ac=0    -> {"ok":true,"raw":"klm five three delta","ms":4210,...}
       body: audio/wav, 16 kHz mono 16 bit
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BIN = os.environ.get("WHISPER_BIN", "/usr/local/bin/whisper-cli")
MODEL = os.environ.get("WHISPER_MODEL", "")
PORT = int(os.environ.get("WHISPER_PORT", "8091"))
THREADS = int(os.environ.get("WHISPER_THREADS", "3"))
LANG = os.environ.get("WHISPER_LANG", "en")
TIMEOUT = float(os.environ.get("WHISPER_TIMEOUT", "90"))
NIVEAU = os.environ.get("WHISPER_LOG", "info").lower()

# Eén transmissie tegelijk. Deze machine heeft twee kernen en draait ook het huis; twee
# transcripties naast elkaar maken ze allebei trager en zetten de rest stil.
sem = threading.Semaphore(1)
stand = {"runs": 0, "fails": 0, "last_ms": 0, "queue": 0}

# Geluidsaanduidingen die whisper bij ruis verzint, zelfde lijst als in de tracker.
RUIS = re.compile(r"[\[(](?:blank_audio|silence|music|noise|static|wind|beep|click|clicking|"
                  r"applause|laughter|breathing|typing|footsteps|engine|radio|"
                  r"speaking foreign language|unintelligible)[^\])]*[\])]", re.I)


def log(msg, niveau="info"):
    if NIVEAU == "debug" or niveau != "debug":
        print(f"[flighttracknl] {msg}", flush=True)


_vlaggen = None


def vlaggen():
    """Welke vlaggen kent deze whisper.cpp? Scheelt gedoe tussen versies."""
    global _vlaggen
    if _vlaggen is None:
        txt = ""
        try:
            h = subprocess.run([BIN, "--help"], capture_output=True, timeout=20)
            txt = (h.stdout + h.stderr).decode("utf-8", "replace")
        except Exception as e:                                   # noqa: BLE001
            log(f"kan de vlaggen van whisper-cli niet uitlezen: {e}")
        _vlaggen = set(re.findall(r"-{1,2}[A-Za-z][\w-]*", txt))
    return _vlaggen


def schoon(text):
    out = []
    for regel in text.splitlines():
        regel = re.sub(r"\s+", " ", RUIS.sub(" ", regel)).strip()
        if regel and regel not in ("-", ".", "...", "…"):
            out.append(regel)
    txt = " ".join(out).strip()
    return "" if len(re.sub(r"[^0-9A-Za-z]", "", txt)) < 2 else txt[:400]


def getal(q, naam, standaard):
    try:
        return int(q.get(naam, [standaard])[0])
    except (TypeError, ValueError):
        return standaard


def transcribeer(wav, q):
    if not MODEL or not Path(MODEL).is_file():
        return {"ok": False, "reason": "geen model"}
    fl = vlaggen()
    beam = getal(q, "beam", 1)
    best = getal(q, "best_of", 1)
    ac = getal(q, "ac", 0)
    taal = (q.get("lang") or [LANG])[0][:8] or LANG
    tmp = ""
    stand["queue"] += 1
    try:
        with sem:
            with tempfile.NamedTemporaryFile(prefix="stt", suffix=".wav", delete=False) as f:
                f.write(wav)
                tmp = f.name
            cmd = [BIN, "-m", MODEL, "-f", tmp, "-l", taal, "-nt", "-np",
                   "-t", str(THREADS), "-bs", str(max(1, beam))]
            for vlag, waarde in (("-bo", max(1, best)), ("-ac", ac)):
                if vlag in fl and not (vlag == "-ac" and not waarde):
                    cmd += [vlag, str(waarde)]
            for vlag in ("-sns", "--suppress-nst"):      # geen [wind] en ander verzinsel
                if vlag in fl:
                    cmd.append(vlag)
                    break
            t0 = time.time()
            try:
                r = subprocess.run(cmd, capture_output=True, timeout=TIMEOUT)
            except subprocess.TimeoutExpired:
                stand["fails"] += 1
                return {"ok": False, "reason": "te traag"}
            ms = int((time.time() - t0) * 1000)
            stand["last_ms"] = ms
            stand["runs"] += 1
            if r.returncode != 0:
                stand["fails"] += 1
                err = (r.stderr or b"").decode("utf-8", "replace").strip().splitlines()
                log(f"whisper mislukt ({r.returncode}): {err[-1] if err else ''}")
                return {"ok": False, "reason": "whisper gaf een fout"}
            raw = schoon(r.stdout.decode("utf-8", "replace"))
            log(f"{ms} ms  {raw[:70]}", "debug")
            return {"ok": True, "raw": raw, "ms": ms,
                    "model": Path(MODEL).stem.replace("ggml-", "")}
    finally:
        stand["queue"] -= 1
        if tmp:
            try:
                os.unlink(tmp)
            except OSError:
                pass


class Handler(BaseHTTPRequestHandler):
    server_version = "flighttracknl/1.0"

    def log_message(self, fmt, *args):
        pass

    def stuur(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):                                        # noqa: N802
        pad = self.path.split("?", 1)[0]
        if pad in ("/health", "/", "/api/health"):
            klaar = bool(MODEL and Path(MODEL).is_file())
            return self.stuur(200, {"ok": klaar, "model": Path(MODEL).stem.replace("ggml-", "") if klaar else "",
                                    "threads": THREADS, "bin": BIN, **stand})
        return self.stuur(404, {"ok": False, "reason": "onbekend pad"})

    def do_POST(self):                                       # noqa: N802
        import urllib.parse
        pad, _, vraag = self.path.partition("?")
        if pad not in ("/stt", "/transcribe"):
            return self.stuur(404, {"ok": False, "reason": "onbekend pad"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n < 1000 or n > 50 * 1024 * 1024:
            return self.stuur(400, {"ok": False, "reason": "audio"})
        wav = self.rfile.read(n)
        q = urllib.parse.parse_qs(vraag)
        try:
            return self.stuur(200, transcribeer(wav, q))
        except Exception as e:                               # noqa: BLE001
            log(f"onverwachte fout: {e}")
            return self.stuur(500, {"ok": False, "reason": str(e)[:120]})


def main():
    if not Path(BIN).is_file():
        log(f"whisper-cli niet gevonden op {BIN}")
        sys.exit(1)
    if MODEL and Path(MODEL).is_file():
        mb = Path(MODEL).stat().st_size // (1024 * 1024)
        log(f"model {Path(MODEL).name} ({mb} MB), {THREADS} draden")
    else:
        log(f"LET OP: geen bruikbaar model op {MODEL or '(niet ingesteld)'}; "
            f"/stt geeft een fout tot het er staat")
    log(f"luistert op poort {PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()

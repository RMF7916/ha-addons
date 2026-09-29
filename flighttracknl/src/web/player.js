// Eigen luisterspeler: praat rechtstreeks met de websocket van OpenWebRX (zoals openwebrx.js zelf),
// vraagt één AM-kanaal op en speelt het af in deze pagina. Geen waterval, alleen geluid en S-meter.
//
// Protocol (OpenWebRX+ 1.2):
//   -> "SERVER DE CLIENT client=openwebrx.js type=receiver"
//   -> {"type":"connectionproperties","params":{"output_rate":12000,"hd_output_rate":48000}}
//   <- {"type":"config","value":{center_freq, samp_rate, audio_compression, ...}}
//   -> {"type":"dspcontrol","params":{offset_freq, mod:"am", low_cut, high_cut, squelch_level}}
//   -> {"type":"dspcontrol","action":"start"}
//   <- binair: eerste byte 2 = audio (ADPCM met SYNC-woorden, of int16), tekst {"type":"smeter"}

const RATE = 12000;                  // audio van OpenWebRX in Hz; de AudioContext draait op hetzelfde tempo
const STT_RATE = 16000;              // whisper.cpp wil 16 kHz mono
// Knippen op het geluid zelf. Op een drukke frequentie volgt de ene transmissie de andere binnen
// een halve seconde, dus een gat in de audiostroom is geen betrouwbare grens meer. Wel betrouwbaar:
// het niveau valt even weg als de zendknop wordt losgelaten. Daar knippen we op, en van elke
// transmissie gaat alleen het begin naar de Pi - daar staat het callsign.
const FRAME = 240;                   // 20 ms bij 12 kHz: zo fijn kijken we naar het niveau
const SIL_MS = 260;                  // zoveel stilte sluit een transmissie af (korter = woordpauze)
const TX_MIN_S = 0.6;                // korter is een klik, een ruispuls of een "roger"
let TX_SLICE_S = 2.6;                // zoveel van het begin gaat naar de Pi (stt.slice_seconds)
const TX_LONG_S = 12;                // blijft iemand doorpraten, dan na zoveel nog eens kijken
const SEG_MAX_S = 20;                // langer dan dit knippen we sowieso af
const HOLD_MS = 4000;                // na een treffer even niets opsturen uit dezelfde stroom
const AM_CUT = 4000;                 // AM-bandbreedte ±4 kHz, standaard in OpenWebRX

// IMA-ADPCM met synchronisatiewoorden, overgenomen uit OpenWebRX (AudioEngine.js, ImaAdpcmCodec)
const IDX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80,
  88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724,
  796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428,
  4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385,
  24623, 27086, 29794, 32767];
export function makeAdpcm() {
  const s = { idx: 0, pred: 0, step: 0, phase: 0, sync: 0, buf: new Uint8Array(4), bi: 0, cnt: 0 };
  const nib = n => {
    s.idx = Math.min(Math.max(s.idx + IDX[n], 0), 88);
    let d = s.step >> 3;
    if (n & 1) d += s.step >> 2;
    if (n & 2) d += s.step >> 1;
    if (n & 4) d += s.step;
    if (n & 8) d = -d;
    s.pred = Math.min(Math.max(s.pred + d, -32768), 32767);
    s.step = STEP[s.idx];
    return s.pred;
  };
  return data => {
    const out = new Int16Array(data.length * 2);
    let o = 0;
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      if (s.phase === 0) {                                  // SYNC zoeken
        if (b !== 'SYNC'.charCodeAt(s.sync++)) s.sync = 0;
        if (s.sync === 4) { s.bi = 0; s.phase = 1; }
      } else if (s.phase === 1) {                           // stapindex en voorspeller
        s.buf[s.bi++] = b;
        if (s.bi === 4) {
          const v = new Int16Array(s.buf.buffer);
          s.idx = v[0]; s.pred = v[1]; s.cnt = 1000; s.phase = 2;
        }
      } else {
        out[o++] = nib(b & 0x0F);
        out[o++] = nib(b >> 4);
        if (s.cnt-- === 0) { s.sync = 0; s.phase = 0; }
      }
    }
    return out.subarray(0, o);
  };
}

// ---- opnemen per transmissie, voor spraak naar tekst ------------------------------------------
// OpenWebRX stuurt alleen audio als de squelch open is. Een gat in de stroom is dus het einde van
// een transmissie; dat knipt beter dan op het niveau kijken, en werkt ook als de squelch dicht blijft.

function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.max(1, Math.round(x.length * to / from)), out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * from / to, j = p | 0, f = p - j;
    const a = x[j] || 0, b = j + 1 < x.length ? x[j + 1] : a;
    out[i] = a + (b - a) * f;
  }
  return out;
}

function wavOf(pcm, rate) {
  const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const txt = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); txt(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return buf;
}

// Wat whisper krijgt: bandje van 250-3800 Hz (daarbuiten zit bij AM alleen brom en ruis) en een
// vaste luidheid. Scheelt meer dan het lijkt: whisper is getraind op nette, goed uitgestuurde spraak.
function bandpass(pcm, rate) {
  const hp = Math.exp(-2 * Math.PI * 250 / rate);           // eerste-orde hoogdoorlaat
  const lp = 1 - Math.exp(-2 * Math.PI * 3800 / rate);      // eerste-orde laagdoorlaat
  let xPrev = 0, yHp = 0, yLp = 0;
  for (let i = 0; i < pcm.length; i++) {
    const x = pcm[i];
    yHp = hp * (yHp + x - xPrev);
    xPrev = x;
    yLp += lp * (yHp - yLp);
    pcm[i] = yLp;
  }
  return pcm;
}

function normalize(pcm) {
  let sum = 0, peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i], a = v < 0 ? -v : v;
    sum += v * v;
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / Math.max(1, pcm.length));
  if (!rms || !peak) return pcm;
  const g = Math.max(1, Math.min(12, Math.min(3000 / rms, 30000 / peak)));
  if (g <= 1.05) return pcm;
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, pcm[i] * g));
  return pcm;
}

export function createPlayer(onState, onSegment) {
  let ws = null, ctx = null, gain = null, playAt = 0;
  let want = null;                       // { hz, label, sql }
  let center = null, rate = null, compression = 'none', decode = null, started = false;
  let level = -150, volume = 1, alive = false;
  let capture = false, seg = null, segTimer = null;   // seg = { parts, n, t0, last }
  const vad = { floor: 300, sil: 0 };                 // ruisvloer en hoelang het al stil is
  const tel = { tx: 0, sent: 0 };                     // transmissies gehoord, plakjes opgestuurd
  const emit = extra => onState && onState({
    playing: !!want && alive, hz: want && want.hz, label: want && want.label, sql: want && want.sql,
    level, center, rate, outOfBand: want && center != null && Math.abs(want.hz - center) > rate / 2,
    ...extra,
  });

  // Niveaumeter over de binnenkomende audio: stil of spraak, met een ruisvloer die meeloopt.
  function vadFrames(pcm) {
    const out = [];
    for (let i = 0; i + FRAME <= pcm.length; i += FRAME) {
      let sum = 0;
      for (let j = i; j < i + FRAME; j++) sum += pcm[j] * pcm[j];
      const rms = Math.sqrt(sum / FRAME);
      if (rms < vad.floor) vad.floor += (rms - vad.floor) * 0.25;      // snel omlaag
      else vad.floor += (rms - vad.floor) * 0.004;                     // traag omhoog
      vad.floor = Math.max(30, vad.floor);
      out.push(rms > Math.max(vad.floor * 2.5, 120));                  // ruim boven de ruis = spraak
    }
    return out;
  }

  // Eén plakje per transmissie: zodra er TX_SLICE_S geluid is, of eerder als de zender al losliet.
  function segPush(pcm) {
    if (!capture || !onSegment || !pcm.length) return;
    const now = Date.now();
    const frames = vadFrames(pcm);
    const spraak = frames.some(Boolean);
    const stilMs = frames.length ? frames.length * (FRAME / RATE) * 1000 : 0;
    if (spraak) vad.sil = 0; else vad.sil += stilMs;

    if (!seg && spraak) {                                    // begin van een nieuwe transmissie
      seg = { parts: [], n: 0, t0: now, last: now, sent: 0, k: 0, hold: 0 };
      tel.tx++;
    }
    if (!seg) return;                                        // stilte tussen transmissies
    seg.parts.push(pcm.slice());
    seg.n += pcm.length;
    seg.last = now;

    const rust = seg.hold && now < seg.hold;
    if (!rust && !seg.k && seg.n >= TX_SLICE_S * RATE) {      // het begin is binnen: opsturen
      segSend(seg, 0, seg.n);
      seg.sent = seg.n;
    } else if (!rust && seg.k && seg.n - seg.sent >= TX_LONG_S * RATE) {
      segSend(seg, seg.sent, seg.n);                         // iemand praat lang door
      seg.sent = seg.n;
    }
    if (vad.sil >= SIL_MS || seg.n >= SEG_MAX_S * RATE) segFlush();
  }

  function segFlush() {
    const s = seg;
    seg = null;
    if (!s || !onSegment) return;
    if (s.hold && Date.now() < s.hold) return;                // net iemand gevonden in deze stroom
    if (s.k) return;                                          // begin is al opgestuurd
    if (s.n < TX_MIN_S * RATE) return;                        // klikje of ruispuls
    segSend(s, 0, s.n);                                       // korte transmissie: in zijn geheel
  }

  function segSend(s, from, to) {
    const pcm = new Int16Array(to - from);
    let o = 0, pos = 0;
    for (const part of s.parts) {                            // alleen het gevraagde stuk uitknippen
      const a = Math.max(from, pos), b = Math.min(to, pos + part.length);
      if (b > a) { pcm.set(part.subarray(a - pos, b - pos), o); o += b - a; }
      pos += part.length;
    }
    const cut = pcm.subarray(0, o);
    const first = s.k === 0;
    s.k++;
    tel.sent++;
    try {
      onSegment({ wav: wavOf(resample(normalize(bandpass(cut, RATE)), RATE, STT_RATE), STT_RATE),
                  hz: want && want.hz, label: want && want.label,
                  t0: s.t0, seconds: o / RATE, first, part: s.k });
    } catch (e) { /* de pagina bepaalt zelf wat er met een transmissie gebeurt */ }
  }

  // Komt er helemaal geen audio meer binnen (squelch dicht), dan telt dat ook als stilte.
  function segIdle() {
    if (!seg) return;
    const stil = Date.now() - seg.last;
    if (stil < SIL_MS) return;
    vad.sil = stil;
    segFlush();
  }

  function segStop() {
    segFlush();
    if (segTimer) { clearInterval(segTimer); segTimer = null; }
  }

  function audioOut(pcm) {
    segPush(pcm);
    if (!ctx || !pcm.length) return;
    const buf = ctx.createBuffer(1, pcm.length, RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    // kleine buffer tegen haperen; loopt de achterstand op, dan terug naar 0,25 s
    const now = ctx.currentTime;
    if (playAt < now + 0.05 || playAt > now + 1.0) playAt = now + 0.25;
    src.start(playAt);
    playAt += buf.duration;
  }

  function applyDsp() {
    if (!ws || ws.readyState !== 1 || !want || center == null) return;
    const params = { offset_freq: Math.round(want.hz - center), mod: 'am', low_cut: -AM_CUT, high_cut: AM_CUT,
      squelch_level: want.sql == null ? -150 : Number(want.sql) };
    ws.send(JSON.stringify({ type: 'dspcontrol', params }));
    if (!started) { ws.send(JSON.stringify({ type: 'dspcontrol', action: 'start' })); started = true; }
    emit();
  }

  function connect(url) {
    close(true);
    started = false; center = null; decode = null; alive = false;
    let opened = false;
    try { ws = new WebSocket(url); } catch (e) { emit({ error: String(e) }); return; }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      ws.send('SERVER DE CLIENT client=openwebrx.js type=receiver');
      ws.send(JSON.stringify({ type: 'connectionproperties', params: { output_rate: RATE, hd_output_rate: 48000 } }));
      alive = true; opened = true; emit();
    };
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') {
        if (ev.data[0] !== '{') return;
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === 'config' && m.value) {
          const v = m.value;
          if ('audio_compression' in v) { compression = v.audio_compression; decode = compression === 'adpcm' ? makeAdpcm() : null; }
          if ('samp_rate' in v) rate = v.samp_rate;
          if ('center_freq' in v) { center = v.center_freq; applyDsp(); }
        } else if (m.type === 'smeter') {
          level = 10 * Math.log10(Math.max(1e-15, m.value));
          emit();
        }
        return;
      }
      const d = new Uint8Array(ev.data);
      if (d[0] !== 2) return;                          // alleen audio; FFT en HD-audio overslaan
      const body = d.subarray(1);
      if (compression === 'adpcm') {
        if (!decode) decode = makeAdpcm();
        audioOut(decode(body));
      } else {
        audioOut(new Int16Array(body.buffer.slice(body.byteOffset, body.byteOffset + (body.byteLength & ~1))));
      }
    };
    // nooit open geweest = geen verbinding (poort dicht, verkeerde URL); anders is hij weggevallen
    ws.onclose = () => { alive = false; emit(opened ? { closed: true } : { error: 'websocket' }); };
    ws.onerror = () => { if (!opened) emit({ error: 'websocket' }); };
  }

  function close(quiet) {
    if (ws) { ws.onclose = null; try { ws.close(); } catch { /* al dicht */ } }
    ws = null; alive = false; started = false;
    if (!quiet) emit();
  }

  return {
    // url: ws(s)://host:poort/ws/ van OpenWebRX
    play(url, hz, label, sql) {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: RATE });
        gain = ctx.createGain(); gain.gain.value = volume; gain.connect(ctx.destination);
      }
      ctx.resume();
      const same = ws && ws.readyState <= 1 && want && want.url === url;
      want = { url, hz, label, sql };
      if (same && center != null) applyDsp(); else connect(url);
      if (capture && !segTimer) segTimer = setInterval(segIdle, 120);
      emit();
    },
    stop() { want = null; segStop(); close(); if (ctx) ctx.suspend(); emit(); },
    // opnemen per transmissie aan of uit; uit gooit een halve transmissie weg
    // lengte van het plakje, zoals de Pi hem meegeeft
    setSlice(sec) { if (sec > 0.8 && sec < 15) TX_SLICE_S = sec; },
    // de pagina heeft iemand herkend in deze transmissie: de rest hoeft niet meer
    stopSegment(t0) { if (seg && seg.t0 === t0) { seg.hold = Date.now() + HOLD_MS; seg.sent = seg.n; } },
    setCapture(on) {
      capture = !!on;
      if (!capture) { seg = null; segStop(); }
      else if (want && !segTimer) segTimer = setInterval(segIdle, 120);
    },
    setSquelch(db) { if (want) { want.sql = db; applyDsp(); } },
    setVolume(v) { volume = v; if (gain) gain.gain.value = v; },
    get state() { return { hz: want && want.hz, playing: !!want } },
    get counts() { return { tx: tel.tx, sent: tel.sent } },
  };
}

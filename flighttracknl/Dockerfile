ARG BUILD_FROM
FROM ${BUILD_FROM}

# Home Assistant bouwt dit image op de machine zelf; er komt geen registry of bouwstraat aan te
# pas. Het bouwen van whisper.cpp duurt op twee kernen een minuut of tien, eenmalig per versie.

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential cmake git ca-certificates curl python3 tzdata \
 && rm -rf /var/lib/apt/lists/*

# Vastgezet op een tag in plaats van master: een bouw die vandaag werkt moet over een half jaar
# nog hetzelfde doen. Ophogen is een bewuste stap, met een nieuw versienummer in config.yaml.
ARG WHISPER_REF=v1.7.4
RUN git clone --depth 1 --branch "${WHISPER_REF}" https://github.com/ggml-org/whisper.cpp /tmp/whisper \
 && cmake -S /tmp/whisper -B /tmp/whisper/build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build /tmp/whisper/build -j"$(nproc)" --target whisper-cli \
 && install -m 0755 /tmp/whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli \
 && rm -rf /tmp/whisper

# De tracker zelf. Alleen de broncode: cache en config.json staan buiten het image, want die
# moeten een update overleven. FlightTrackNL draait op de standaardbibliotheek, dus verder
# is er niets te installeren.
COPY src /app
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

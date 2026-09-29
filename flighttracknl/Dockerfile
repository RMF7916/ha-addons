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
# BUILD_SHARED_LIBS=OFF is geen voorkeur maar een noodzaak. whisper.cpp bouwt standaard
# libwhisper.so en de libggml-*.so ernaast, en whisper-cli is daaraan gelinkt. Zetten we alleen
# die ene binary apart en gooien we de bouwmap weg, dan valt hij bij de eerste transcriptie om
# met "error while loading shared libraries" -- binnen twee milliseconden, dus het leek alsof
# whisper zelf stuk was. Statisch gelinkt staat alles in de binary en kan de bouwmap weg.
#
# De controle met ldd erna is er om die fout niet nog een keer te laten passeren: is whisper-cli
# tóch aan een van die bibliotheken gelinkt, dan faalt de bouw hier hard in plaats van een image
# af te leveren waarin het meeluisteren stil kapot is.
RUN git clone --depth 1 --branch "${WHISPER_REF}" https://github.com/ggml-org/whisper.cpp /tmp/whisper \
 && cmake -S /tmp/whisper -B /tmp/whisper/build -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
 && cmake --build /tmp/whisper/build -j"$(nproc)" --target whisper-cli \
 && install -m 0755 /tmp/whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli \
 && if ldd /usr/local/bin/whisper-cli | grep -qE 'libwhisper|libggml'; then \
      echo "FOUT: whisper-cli is gelinkt aan bibliotheken uit de bouwmap:"; \
      ldd /usr/local/bin/whisper-cli | grep -E 'libwhisper|libggml'; exit 1; fi \
 && rm -rf /tmp/whisper \
 && if /usr/local/bin/whisper-cli --help 2>&1 | grep -qi 'shared librar'; then \
      echo "FOUT: whisper-cli start niet meer nu de bouwmap weg is:"; \
      /usr/local/bin/whisper-cli --help 2>&1 | head -2; exit 1; fi

# De tracker zelf. Alleen de broncode: cache en config.json staan buiten het image, want die
# moeten een update overleven. FlightTrackNL draait op de standaardbibliotheek, dus verder
# is er niets te installeren.
COPY src /app
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

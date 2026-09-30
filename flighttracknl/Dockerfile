ARG BUILD_FROM
FROM ${BUILD_FROM}

# Home Assistant builds this image on the machine itself; no registry or build pipeline is
# involved. Compiling whisper.cpp takes about ten minutes on two cores, once per version.

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential cmake git ca-certificates curl python3 tzdata \
 && rm -rf /var/lib/apt/lists/*

# Pinned to a tag rather than master: a build that works today should still do the same thing in
# six months. Moving it up is a deliberate step, with a new version number in config.yaml.
ARG WHISPER_REF=v1.7.4
# BUILD_SHARED_LIBS=OFF is a necessity, not a preference. whisper.cpp builds libwhisper.so and
# the libggml-*.so alongside the binary, and whisper-cli is linked against them. Copy out that one
# binary and delete the build directory, and it falls over on the first transcription with
# "error while loading shared libraries" -- within two milliseconds, so it looks as though whisper
# itself is broken. Linked statically, everything is in the binary and the build directory can go.
#
# The ldd check below exists so that mistake cannot pass unnoticed a second time: if whisper-cli
# still depends on one of those libraries, the build fails here instead of shipping an image in
# which listening is quietly broken.
RUN git clone --depth 1 --branch "${WHISPER_REF}" https://github.com/ggml-org/whisper.cpp /tmp/whisper \
 && cmake -S /tmp/whisper -B /tmp/whisper/build -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
 && cmake --build /tmp/whisper/build -j"$(nproc)" --target whisper-cli \
 && install -m 0755 /tmp/whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli \
 && if ldd /usr/local/bin/whisper-cli | grep -qE 'libwhisper|libggml'; then \
      echo "ERROR: whisper-cli is linked against libraries from the build directory:"; \
      ldd /usr/local/bin/whisper-cli | grep -E 'libwhisper|libggml'; exit 1; fi \
 && rm -rf /tmp/whisper \
 && if /usr/local/bin/whisper-cli --help 2>&1 | grep -qi 'shared librar'; then \
      echo "ERROR: whisper-cli no longer starts now that the build directory is gone:"; \
      /usr/local/bin/whisper-cli --help 2>&1 | head -2; exit 1; fi

# The tracker itself. Source only: the cache and config.json live outside the image because they
# have to survive an update. FlightTrackNL runs on the Python standard library, so there is
# nothing further to install.
COPY src /app
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

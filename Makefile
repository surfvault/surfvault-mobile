# SurfVault mobile — EAS OTA helpers
#
# Why a Makefile (and NOT package.json scripts): the EAS fingerprint hashes
# package.json "scripts", so baking the env-sourcing into an npm script would
# change the runtime fingerprint and break OTA matching with already-shipped
# store builds. A Makefile is not a fingerprint input, so it's safe.
#
# What these targets guarantee:
#   1. Node 22 (tsc/eas misbehave on the shell's default Node).
#   2. The env file is sourced into the OS shell BEFORE eas runs, so EVERY
#      eas sub-step — including the manifest step — sees the vars. Without this
#      the manifest ships empty `extra` (auth0Domain="") -> Auth0 launch crash.
#   3. Post-publish verification: fetches the served manifest at the exact
#      fingerprint that was just published and asserts auth0Domain is non-empty.
#      Fails the target if the OTA is the crash-bug build.
#
# Usage:
#   make update-prod MSG="hero thumbnail fix + surfer-only vault settings"
#   make update-dev  MSG="testing new feed layout"
#
# Local dev runs (USE THESE instead of `npm run ios|android`):
#   make ios          # native debug build on a connected device, dev env
#   make android      # native debug build, dev env
#   make ios-clean    # prebuild --clean first — after adding a native module
#   make android-clean#   (e.g. expo-video) or changing app.config.ts plugins
#
# Why: `npx expo run:*` lets REAL shell env vars override .env files. If you've
# ever sourced .env.production into your terminal (the old manual OTA workaround),
# those prod vars leak into `npm run ios` and you silently hit prod. These targets
# re-source .env.development.local inside make's own subshell, so dev wins every
# time regardless of what's exported in your interactive shell — and nothing
# leaks back out. (Kept in the Makefile, not package.json scripts, so the EAS
# fingerprint stays stable — same reasoning as the OTA targets above.)

# NOTE: macOS ships GNU Make 3.81, which silently IGNORES .ONESHELL: — every
# recipe LINE runs in its own shell, so exported vars / sourced functions (nvm!)
# do NOT carry across lines. That's why every multi-line recipe below is written
# as ONE shell invocation using `\` line-continuations + `;`. Do not "tidy" these
# into separate lines or nvm will vanish between steps (Error 127). .ONESHELL is
# kept as a harmless no-op that also makes this correct on Make 3.82+.
SHELL := /bin/bash
.ONESHELL:
.PHONY: update-prod update-dev _ota ios android ios-clean android-clean _run

PROJECT_ID  := f0f75cbd-8e64-43a6-b251-438dcd684772
NODE_VERSION := 22

update:
	@$(MAKE) --no-print-directory _ota ENVFILE=.env.production BRANCH=production APP_ENV=production MSG="$(MSG)"

ios:
	@$(MAKE) --no-print-directory _run PLATFORM=ios RUNFLAGS="--device"

android:
	@$(MAKE) --no-print-directory _run PLATFORM=android RUNFLAGS=""

# Clean variants: regenerate native projects (expo prebuild --clean) before the
# run. USE THESE after adding/removing a native module (e.g. expo-video) or
# changing app.config.ts native fields/plugins — a plain `make ios` reuses the
# existing ios/ + Pods and may not link the new native code (runtime crash /
# "module not found"). WARNING: prebuild --clean regenerates ios/ + android/, so
# any hand edits there are overwritten — check `git status ios android` after.
ios-clean:
	@$(MAKE) --no-print-directory _run PLATFORM=ios RUNFLAGS="--device" PREBUILD=1

android-clean:
	@$(MAKE) --no-print-directory _run PLATFORM=android RUNFLAGS="" PREBUILD=1

_run:
	@if [ ! -f ".env.development.local" ]; then echo "ERROR: missing .env.development.local"; exit 1; fi
	@export NVM_DIR="$$HOME/.nvm"; \
	. "$$NVM_DIR/nvm.sh"; \
	nvm use $(NODE_VERSION) >/dev/null; \
	set -a && . ./.env.development.local && set +a; \
	export NODE_ENV=development; \
	export ANDROID_HOME="$${ANDROID_HOME:-$$HOME/Library/Android/sdk}"; \
	export ANDROID_SDK_ROOT="$$ANDROID_HOME"; \
	export PATH="$$ANDROID_HOME/platform-tools:$$ANDROID_HOME/emulator:$$PATH"; \
	set -eo pipefail; \
	if [ "$(PREBUILD)" = "1" ]; then \
	  echo "▶ Clean prebuild for $(PLATFORM) (regenerating native project + Pods)…"; \
	  npx expo prebuild --clean --platform $(PLATFORM); \
	fi; \
	echo "▶ Running $(PLATFORM) (dev env: API_BASE_URL=$$API_BASE_URL, node=$$(node -v))"; \
	npx expo run:$(PLATFORM) $(RUNFLAGS)

_ota:
	@if [ -z "$(MSG)" ]; then echo "ERROR: MSG is required, e.g. make update-prod MSG=\"what changed\""; exit 1; fi
	@if [ ! -f "$(ENVFILE)" ]; then echo "ERROR: missing $(ENVFILE)"; exit 1; fi
	@export NVM_DIR="$$HOME/.nvm"; \
	. "$$NVM_DIR/nvm.sh"; \
	nvm use $(NODE_VERSION) >/dev/null; \
	set -a && . ./$(ENVFILE) && set +a; \
	export NODE_ENV=$(APP_ENV); \
	set -eo pipefail; \
	echo "▶ Publishing OTA to branch '$(BRANCH)' (env=$(ENVFILE), node=$$(node -v))"; \
	npx eas-cli update --branch $(BRANCH) --message "$(MSG)"; \
	echo "▶ Verifying served manifest env on both platforms…"; \
	FAILED=0; \
	for PLAT in ios android; do \
	  RT=$$(npx expo-updates fingerprint:generate --platform $$PLAT 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(JSON.parse(d).hash))'); \
	  DOM=$$(curl -s -H "expo-platform: $$PLAT" -H "expo-channel-name: $(BRANCH)" -H "expo-runtime-version: $$RT" -H "expo-protocol-version: 1" -H "expo-api-version: 1" -H "Accept: multipart/mixed" "https://u.expo.dev/$(PROJECT_ID)" | tr -d '\r' | grep -o '"auth0Domain":"[^"]*"' || true); \
	  echo "  $$PLAT  rt=$$RT  ->  $${DOM:-<none>}"; \
	  if [ -z "$$DOM" ] || [ "$$DOM" = '"auth0Domain":""' ]; then \
	    echo "  ✖ FAIL: manifest auth0Domain is empty for $$PLAT — env did not load into the manifest. This OTA will crash on launch."; \
	    FAILED=1; \
	  fi; \
	done; \
	if [ "$$FAILED" != "0" ]; then \
	  echo "✖ Verification failed. Republish after confirming '$(ENVFILE)' is sourced (the target does this; check the file exists and has AUTH0_DOMAIN)."; \
	  exit 1; \
	fi; \
	echo "✅ Published to '$(BRANCH)' and verified manifest env on iOS + Android."

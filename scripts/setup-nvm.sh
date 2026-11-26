# install node — nvm is a shell function, not a binary. When wtp *sources* this
# script into an interactive shell it's already defined, but when the script is
# *executed* (./scripts/clean-install.sh) the fresh shell never loaded the rc, so
# `nvm` is missing. Load nvm.sh if it isn't already available. Covers the standard
# $NVM_DIR layout and Homebrew's (brew --prefix)/opt/nvm.
if ! command -v nvm >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    \. "$NVM_DIR/nvm.sh"
  elif command -v brew >/dev/null 2>&1 && [ -s "$(brew --prefix)/opt/nvm/nvm.sh" ]; then
    \. "$(brew --prefix)/opt/nvm/nvm.sh"
  fi
fi

if ! command -v nvm >/dev/null 2>&1; then
  echo "clean-install.sh: could not locate nvm.sh — is nvm installed?" >&2
  exit 1
fi

nvm install
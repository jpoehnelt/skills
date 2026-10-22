---
name: nix-darwin
description: Manage macOS system defaults, Homebrew casks, Lix or Nix daemon settings, and Home Manager packages and dotfiles with a nix-darwin flake. Use when adding packages or casks, changing macOS defaults or launchd agents, debugging flake evaluation or brew bundle failures, or activating changes from an agent shell.
---

# macOS configuration with nix-darwin

Declare all macOS system settings, packages, and dotfiles in the flake instead of running imperative installers or mutating local preference files by hand.

Repo facts (from `AGENTS.md` or `CLAUDE.md`): the flake directory path, the shared `nix-darwin` module path, the shared Home Manager module path, the per-host override directory, and how local secrets are stored.

## Place each setting in the right layer

- Put macOS `system.defaults`, PAM settings, `/etc` files, and GUI Homebrew casks in the `nix-darwin` module.
- Put CLI packages, dotfiles, shell aliases, `home.sessionVariables`, and user `launchd.agents` in the Home Manager module.
- Put machine-specific hardware mappings, computer names, and host-only packages in the host module.
- Prefer Nix packages for CLI tools and language toolchains. Prefer Homebrew casks for GUI `.app` bundles that auto-update or need macOS code-signing entitlements.

## Evaluate and build

1. Stage any new file before evaluating the flake. Nix flakes ignore untracked Git files and fail with a missing-file error:
   ```bash
   git -C <flake-dir> add --intent-to-add <new-file>
   ```
2. Check attribute names and option paths with `nix eval` before building the full system closure:
   ```bash
   nix eval <flake-dir>#darwinConfigurations.<host>.pkgs.<pkg>.version
   ```
3. Build the host system closure without root privileges to catch module type errors and missing options early:
   ```bash
   nix build --no-link --print-out-paths <flake-dir>#darwinConfigurations.<host>.system
   ```
4. If a macOS preference key has no typed option under `system.defaults.<domain>`, place it under `system.defaults.CustomUserPreferences.<domain>`.

## Activate from an agent shell

An agent background shell has no controlling terminal app, so `pam_tid.so` skips Touch ID and `sudo darwin-rebuild switch` hangs waiting for a password on standard input.

1. For Home Manager changes (CLI packages, dotfiles, environment variables, and user `launchd` agents), build and run the user activation package directly without `sudo`:
   ```bash
   HOST="$(scutil --get LocalHostName)"
   SYS_PATH="$(nix build --no-link --print-out-paths "<flake-dir>#darwinConfigurations.${HOST}.system")"
   ln -sfn "$(readlink -f "$SYS_PATH/etc/profiles/per-user/$USER")" "$HOME/.local/state/nix/profiles/profile"
   HM_ACTIVATE="$(nix build --no-link --print-out-paths "<flake-dir>#darwinConfigurations.${HOST}.config.home-manager.users.${USER}.home.activationPackage")"
   "$HM_ACTIVATE/activate"
   ```
2. For `system.defaults` changes that belong to the current user (such as `com.apple.dock`, `com.apple.finder`, or `com.apple.screencapture`), write the same plist key with `defaults write` and restart the affected service (`killall Dock`, `killall Finder`, or `killall SystemUIServer`) so the change takes effect immediately.
3. For root-only changes (`/etc`, PAM, system daemons, or Homebrew casks), ask the operator to run `sudo darwin-rebuild switch` in their terminal after `nix build` succeeds.

## Secrets and Homebrew drift

- Never write tokens or credentials into `.nix` files. Everything copied into `/nix/store` is world-readable on the machine and tracked in Git.
- Store secrets in the macOS Keychain with `security add-generic-password -U -a "$USER" -s "<service>" -w "<secret>"`. Read them at Home Manager activation or shell startup with `security find-generic-password -a "$USER" -s "<service>" -w`.
- Before adding a Homebrew cask for an application that already exists in `/Applications`, adopt the existing bundle so `brew bundle` does not fail:
  ```bash
  brew install --cask --adopt <cask>
  ```
- Set `homebrew.onActivation.cleanup = "zap"` when you want activation to remove undeclared Homebrew formulae and casks. Check `brew list --formula` and `brew list --cask` before enabling it for the first time.
- If an external installer such as Lix or the Determinate Nix Installer manages the Nix daemon (`nix.enable = false`), put custom daemon settings in `environment.etc."nix/nix.custom.conf"` instead of `nix.settings`.

## Verify

- `nix build --no-link <flake-dir>#darwinConfigurations.<host>.system` exits 0 with no deprecation warnings.
- User activation (`$HM_ACTIVATE/activate`) exits 0.
- Installed binaries resolve on `PATH`, or changed preferences appear in `defaults read`.
- `git diff` contains no plaintext tokens or machine-private credentials.

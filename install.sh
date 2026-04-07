#!/bin/sh
set -eu

REPO="yoonhoGo/colima-desktop"
APP_NAME="Colima Desktop"
INSTALL_DIR="/Applications"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { printf "${GREEN}[info]${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}[warn]${NC} %s\n" "$1"; }
error() { printf "${RED}[error]${NC} %s\n" "$1"; exit 1; }

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Darwin) PLATFORM="darwin" ;;
        Linux)  PLATFORM="linux" ;;
        *)      error "Unsupported OS: $OS" ;;
    esac

    case "$ARCH" in
        x86_64|amd64)  ARCH="x86_64" ;;
        arm64|aarch64) ARCH="aarch64" ;;
        *)             error "Unsupported architecture: $ARCH" ;;
    esac
}

# Get latest release version
get_latest_version() {
    VERSION=$(curl -sI "https://github.com/${REPO}/releases/latest" \
        | grep -i "^location:" \
        | sed 's/.*\/v//' \
        | tr -d '\r\n')

    if [ -z "$VERSION" ]; then
        error "Failed to determine latest version"
    fi

    info "Latest version: v${VERSION}"
}

# Map architecture to Tauri asset naming
map_arch_macos() {
    case "$1" in
        aarch64) echo "aarch64" ;;
        x86_64)  echo "x64" ;;
    esac
}

# Find asset URL by pattern from GitHub API
find_asset_url() {
    PATTERN="$1"
    ASSET_URL=$(curl -sL "https://api.github.com/repos/${REPO}/releases/latest" \
        | grep "browser_download_url" \
        | grep "$PATTERN" \
        | head -1 \
        | sed 's/.*"browser_download_url": "\(.*\)"/\1/')

    if [ -z "$ASSET_URL" ]; then
        error "Asset matching '${PATTERN}' not found in release v${VERSION}"
    fi
    echo "$ASSET_URL"
}

# Install on macOS
install_macos() {
    TAURI_ARCH=$(map_arch_macos "$ARCH")
    DOWNLOAD_URL=$(find_asset_url "${TAURI_ARCH}.dmg\"")
    ASSET_NAME=$(basename "$DOWNLOAD_URL")

    TMPDIR_INSTALL="$(mktemp -d)"
    DMG_PATH="${TMPDIR_INSTALL}/${ASSET_NAME}"

    info "Downloading ${ASSET_NAME}..."
    curl -#fSL "$DOWNLOAD_URL" -o "$DMG_PATH" || error "Download failed. Check if the release exists."

    info "Mounting DMG..."
    MOUNT_POINT=$(hdiutil attach "$DMG_PATH" -nobrowse -noautoopen 2>/dev/null | grep "/Volumes" | awk -F'\t' '{print $NF}')

    if [ -z "$MOUNT_POINT" ]; then
        error "Failed to mount DMG"
    fi

    if [ -d "${INSTALL_DIR}/${APP_NAME}.app" ]; then
        warn "Existing installation found. Removing..."
        rm -rf "${INSTALL_DIR}/${APP_NAME}.app"
    fi

    info "Installing to ${INSTALL_DIR}..."
    cp -R "${MOUNT_POINT}/${APP_NAME}.app" "$INSTALL_DIR/"

    info "Cleaning up..."
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    rm -rf "$TMPDIR_INSTALL"

    info "Removing quarantine attribute..."
    xattr -rd com.apple.quarantine "${INSTALL_DIR}/${APP_NAME}.app" 2>/dev/null || true

    printf "\n${GREEN}%s installed successfully!${NC}\n" "$APP_NAME"
    echo "  Open from Applications or run:"
    echo "  open -a '${APP_NAME}'"
}

# Install on Linux
install_linux() {
    if command -v dpkg >/dev/null 2>&1; then
        info "Detected Debian-based system. Installing .deb package..."
        DEB_URL=$(find_asset_url "amd64.deb\"")
        DEB_NAME=$(basename "$DEB_URL")
        TMPDIR_INSTALL="$(mktemp -d)"
        DEB_PATH="${TMPDIR_INSTALL}/${DEB_NAME}"

        curl -#fSL "$DEB_URL" -o "$DEB_PATH" || error "Download failed"

        sudo dpkg -i "$DEB_PATH" || sudo apt-get install -f -y
        rm -rf "$TMPDIR_INSTALL"

        printf "\n${GREEN}%s installed successfully!${NC}\n" "$APP_NAME"
    else
        info "Installing AppImage..."
        APPIMAGE_URL=$(find_asset_url "amd64.AppImage\"")
        LOCAL_BIN="${HOME}/.local/bin"
        mkdir -p "$LOCAL_BIN"

        curl -#fSL "$APPIMAGE_URL" -o "${LOCAL_BIN}/colima-desktop" || error "Download failed"
        chmod +x "${LOCAL_BIN}/colima-desktop"

        printf "\n${GREEN}%s installed successfully!${NC}\n" "$APP_NAME"
        echo "  Run: colima-desktop"
        echo "  (Make sure ${LOCAL_BIN} is in your PATH)"
    fi
}

# Main
main() {
    printf "\n  ${GREEN}Colima Desktop Installer${NC}\n\n"

    detect_platform
    get_latest_version

    case "$PLATFORM" in
        darwin) install_macos ;;
        linux)  install_linux ;;
    esac
}

main

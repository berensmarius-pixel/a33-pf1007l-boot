#!/usr/bin/env bash
# Build our SD-boot U-Boot for the PF1007L and the eMMC dump script. Run in Linux (or WSL) from
# the repository root:
#   bash scripts/a33-sdboot/build.sh /path/to/u-boot
# The U-Boot source must be the pinned v2025.10 commit (checked below). Output goes to
# diagnostics/a33-sdboot/ (git-ignored). See docs/allwinner-a33-sdcard-adb-wifi.md.
set -euo pipefail

SRC="${1:?usage: build.sh <u-boot source dir>}"
PIN=e50b1e8715011def8aff1588081a2649a2c6cd47
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/diagnostics/a33-sdboot"
O="$OUT/build"

[ "$(git -C "$SRC" rev-parse HEAD)" = "$PIN" ] || { echo "FAIL: $SRC is not at $PIN" >&2; exit 1; }
mkdir -p "$O"
export CROSS_COMPILE=arm-linux-gnueabihf-

make -s -C "$SRC" O="$O" Sinlinx_SinA33_defconfig
"$SRC/scripts/kconfig/merge_config.sh" -m -O "$O" "$O/.config" "$HERE/a33.config" >/dev/null
make -s -C "$SRC" O="$O" olddefconfig

# Every setting from a33.config must have survived olddefconfig.
fail=0
while IFS= read -r line; do
  case "$line" in
    CONFIG_*) grep -qxF "$line" "$O/.config" || { echo "FAIL: not applied: $line" >&2; fail=1; } ;;
    "# CONFIG_"*) key="${line#\# }"; key="${key%% *}"
                  ! grep -q "^$key=" "$O/.config" || { echo "FAIL: still set: $key" >&2; fail=1; } ;;
  esac
done < "$HERE/a33.config"
[ "$fail" = 0 ] || exit 1

make -s -C "$SRC" O="$O" -j"$(nproc)"
cp "$O/u-boot-sunxi-with-spl.bin" "$OUT/"
"$O/tools/mkimage" -q -A arm -T script -C none -n "a33 emmc dump" \
  -d "$HERE/emmc-dump.cmd" "$OUT/a33.scr"
cd "$OUT"
sha256sum u-boot-sunxi-with-spl.bin a33.scr | tee SHA256SUMS
ls -l u-boot-sunxi-with-spl.bin a33.scr

"""Put an Allwinner boot image on a new microSD card, from Windows: the official FEL stub
(default) or the SD-boot U-Boot from build.sh in this folder.

Windows port of the guarded Linux procedure in Wes's PF1007L guide. With the stub card in the
frame's TF slot at power-on, the A33 Boot ROM loads the stub instead of Android and stays in
FEL (USB 1f3a:efe8), if the USB-C data lines reach the SoC. With the U-Boot image it runs
a33.scr from the card's FAT partition instead. This script never touches the frame's eMMC.
See docs/allwinner-a33-sdcard-adb-wifi.md.

Use a new card, only for the frame. The script makes no backup of the card.

The image goes at byte offset 8192 of the card, inside the boot area that ends at 1 MiB, which
on an MBR card with partitions at 1 MiB or later is unused space before the first partition.
(Their guide requires 4 MiB; 1 MiB is Windows' standard alignment.) Before writing, the first
4 MiB is read twice and compared; afterwards it is read back and compared byte for byte, so
nothing outside the image area may change. The script refuses a card that already holds a
different boot image (eGON header at 8 KiB), except the FEL stub.

Usage (elevated PowerShell for prepare):
  python -I scripts/a33-sdboot/fel-sdcard.py list
  python -I scripts/a33-sdboot/fel-sdcard.py prepare <disk number> [image]
"""
import ctypes
import hashlib
import json
import os
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STUB = ROOT / "diagnostics" / "tools" / "sunxi" / "fel-sdboot.sunxi"
STUB_SHA256 = "2ccec08a026840571f3804671ba72afae840db27112a43f2b1f122075bc808bc"
PREFIX = 4 * 1024 * 1024
OFFSET, STUB_LEN = 8192, 8192
MIN_START = 2048  # sectors (1 MiB)
AREA_END = MIN_START * 512
MAX_CARD = 256 * 1000 ** 3


def die(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def disks():
    ps = ("Get-Disk | Select-Object Number,FriendlyName,BusType,Size,"
          "PartitionStyle,IsBoot,IsSystem,IsOffline | ConvertTo-Json -Compress")
    out = subprocess.check_output(["powershell", "-NoProfile", "-Command", ps], text=True)
    data = json.loads(out)
    return data if isinstance(data, list) else [data]


def show(d):
    return (f"disk {d['Number']}: {d['FriendlyName']} ({d['BusType']}), "
            f"{d['Size'] / 1e9:.1f} GB, {d['PartitionStyle']}")


def card(number):
    match = [d for d in disks() if d["Number"] == number]
    if not match:
        die(f"no disk {number}")
    d = match[0]
    if d["IsBoot"] or d["IsSystem"]:
        die(f"disk {number} is a boot/system disk")
    if d["BusType"] not in ("SD", "USB", "MMC"):
        die(f"disk {number} bus is {d['BusType']}, expected SD/USB/MMC (a card reader)")
    if not 0 < d["Size"] <= MAX_CARD:
        die(f"disk {number} is {d['Size'] / 1e9:.1f} GB; refusing anything over 256 GB")
    if d["PartitionStyle"] != "MBR":
        die(f"disk {number} is {d['PartitionStyle']}, only MBR cards are supported")
    return d


def read_prefix(number):
    fd = os.open(rf"\\.\PhysicalDrive{number}", os.O_RDONLY | os.O_BINARY)
    try:
        data = os.read(fd, PREFIX)
    finally:
        os.close(fd)
    if len(data) != PREFIX:
        die(f"short read: {len(data)} bytes")
    return data


def check_layout(prefix):
    if prefix[510:512] != b"\x55\xaa":
        die("no MBR signature")
    parts = [prefix[446 + i * 16:462 + i * 16] for i in range(4)]
    used = [p for p in parts if p[4]]
    if not used or any(p[4] == 0xEE for p in used):
        die("empty or GPT-protective partition table")
    starts = [struct.unpack_from("<I", p, 8)[0] for p in used]
    if min(starts) < MIN_START:
        die(f"a partition starts at sector {min(starts)}, before 1 MiB")
    return starts


def confirm(d, what):
    print(show(d))
    answer = input(f"Type WRITE {d['Number']} to write {what} to this card: ")
    if answer.strip() != f"WRITE {d['Number']}":
        die("not confirmed")


def stub_bytes():
    data = STUB.read_bytes()
    if len(data) != STUB_LEN or data[4:12] != b"eGON.BT0" or hashlib.sha256(data).hexdigest() != STUB_SHA256:
        die(f"{STUB} is not the verified stub")
    return data


def image_bytes(path):
    if path is None:
        return stub_bytes(), "the FEL stub"
    data = Path(path).read_bytes()
    if data[4:12] != b"eGON.BT0":
        die(f"{path} has no eGON.BT0 header")
    if OFFSET + len(data) > AREA_END:
        die(f"{path} is {len(data)} bytes; it would run past 1 MiB into the partition")
    return data, f"{Path(path).name} (sha256 {hashlib.sha256(data).hexdigest()})"


def write_region(number, offset, data):
    fd = os.open(rf"\\.\PhysicalDrive{number}", os.O_RDWR | os.O_BINARY)
    try:
        os.lseek(fd, offset, os.SEEK_SET)
        n = os.write(fd, data)
    finally:
        os.close(fd)
    if n != len(data):
        die(f"short write: {n} bytes")


def require_admin():
    if not ctypes.windll.shell32.IsUserAnAdmin():
        die("run from an elevated PowerShell (raw disk access)")


def cmd_list():
    for d in disks():
        flags = " [boot/system]" if d["IsBoot"] or d["IsSystem"] else ""
        print(show(d) + flags)


def cmd_prepare(number, image=None):
    require_admin()
    data, what = image_bytes(image)
    d = card(number)
    before = read_prefix(number)
    starts = check_layout(before)
    if read_prefix(number) != before:
        die("two reads of the first 4 MiB differ")
    # Pad to whole sectors with the card's own bytes, so nothing else changes.
    end = OFFSET + len(data)
    end_padded = -(-end // 512) * 512
    region = data + before[end:end_padded]
    if before[OFFSET:end_padded] == region:
        print("Image already present; nothing to do.")
        return
    existing = before[OFFSET:OFFSET + STUB_LEN]
    is_stub = STUB.exists() and existing == stub_bytes()
    if existing[4:12] == b"eGON.BT0" and not is_stub:
        print("Note: replacing existing eGON.BT0 boot image.")
    print(f"Partitions start at sectors {starts}; writing {len(region)} bytes at 8192 "
          f"(ends at {end_padded}, partition starts at {min(starts) * 512}).")
    confirm(d, what)
    write_region(number, OFFSET, region)
    expected = before[:OFFSET] + region + before[end_padded:]
    if read_prefix(number) != expected:
        die("readback mismatch after write; do not use this card")
    changed = sum(x != y for x, y in zip(before[OFFSET:end_padded], region))
    print(f"Verified: image in place at 8192-{end_padded - 1} ({changed} bytes changed), "
          "nothing else in the first 4 MiB changed.")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["list"]:
        cmd_list()
    elif args[:1] == ["prepare"] and len(args) in (2, 3):
        cmd_prepare(int(args[1]), args[2] if len(args) == 3 else None)
    else:
        print(__doc__)
        sys.exit(2)

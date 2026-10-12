"""Check the eMMC dump that emmc-dump.cmd or data-dump.cmd wrote to the SD card, and save a verified copy.

For each chunk listed in a33-status.txt: the file must be exactly 64 MiB (or the sector count
U-Boot recorded, for a short last chunk), its SHA-256 must match the hash U-Boot computed on the
frame (after its own read-twice compare), and it must not contain all-0xCC filler blocks. Verified
chunks are copied to backups/pf1007-emmc/ and re-hashed there; SHA256SUMS there keeps the entries
of earlier runs. Then the MBR in chunk 00 is parsed, including logical partitions, against every
chunk in the backup folder.

Usage: python -I scripts/a33-sdboot/check-dump.py G:\\
"""
import hashlib
import shutil
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "backups" / "pf1007-emmc"
CHUNK = 64 * 1024 * 1024
SECTOR = 512


def die(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def status(card):
    env = {}
    text = (card / "a33-status.txt").read_bytes().split(b"\0")[0].decode("ascii", "replace")
    for line in text.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            env[k] = v
    return env


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while block := f.read(1 << 20):
            h.update(block)
    return h.hexdigest()


def filler_blocks(path):
    bad, cc = 0, b"\xcc" * 65536
    with open(path, "rb") as f:
        while block := f.read(65536):
            bad += block == cc
    return bad


def partitions(first_sectors, read_sector):
    """Primary and logical MBR entries as (number, type, start, size) in sectors."""
    mbr = first_sectors
    if mbr[510:512] != b"\x55\xaa":
        return None
    out, num = [], 0
    for i in range(4):
        t, start, size = mbr[446 + i * 16 + 4], *struct.unpack_from("<II", mbr, 446 + i * 16 + 8)
        if not t:
            continue
        num += 1
        out.append((num, t, start, size))
        if t in (0x05, 0x0F, 0x85):
            ebr_base, ebr = start, start
            num = 4
            while ebr:
                sec = read_sector(ebr)
                if sec is None or sec[510:512] != b"\x55\xaa":
                    out.append(("?", 0, ebr, 0))
                    break
                lt, ls, lsz = sec[446 + 4], *struct.unpack_from("<II", sec, 446 + 8)
                num += 1
                out.append((num, lt, ebr + ls, lsz))
                nt, ns = sec[462 + 4], struct.unpack_from("<I", sec, 462 + 8)[0]
                ebr = ebr_base + ns if nt else 0
    return out


def main(card):
    card = Path(card)
    env = status(card)
    print(f"stage: {env.get('a33_stage')}, emmc_dev: {env.get('emmc_dev')}, "
          f"layout: {env.get('layout', '-')}, ver: {env.get('ver', '?')}")
    chunks = sorted(k for k in env if k.startswith("st_"))
    if not chunks:
        die("no chunks recorded; U-Boot ran but read nothing (see emmc_dev above)")
    DEST.mkdir(parents=True, exist_ok=True)
    good = []
    for key in chunks:
        i, parts = key[3:], env[key].split()
        if parts[0] != "ok":
            print(f"  {i}: {env[key]}")
            continue
        src = card / f"emmc-{i}.bin"
        want = parts[2].lower()
        size = int(parts[3], 16) * SECTOR if len(parts) > 3 else CHUNK
        if src.stat().st_size != size:
            die(f"{src.name} is {src.stat().st_size} bytes, expected {size}")
        if sha256_file(src) != want:
            die(f"{src.name} differs from the hash computed on the frame")
        if (n := filler_blocks(src)):
            die(f"{src.name} has {n} all-0xCC 64 KiB blocks")
        dst = DEST / src.name
        if dst.exists() and sha256_file(dst) != want:
            die(f"{dst} already exists with different content")
        shutil.copyfile(src, dst)
        if sha256_file(dst) != want:
            die(f"copy of {src.name} differs after copying")
        good.append(int(i, 16))
        print(f"  {i}: ok, sector {int(parts[1], 16)}, sha256 {want[:16]}...")
    sums = DEST / "SHA256SUMS"
    known = dict(reversed(line.split()) for line in sums.read_text().splitlines()) if sums.exists() else {}
    for i in good:
        known[f"emmc-{i:02x}.bin"] = env["st_" + format(i, "02x")].split()[2].lower()
    # LF endings so `sha256sum -c` works on the file from any OS.
    sums.write_text("".join(f"{h}  {name}\n" for name, h in sorted(known.items())), newline="\n")
    if not good or good != list(range(good[0], good[0] + len(good))):
        die("no verified chunks, or they are not contiguous")
    print(f"{len(good)} chunks verified ({good[0]:02x}-{good[-1]:02x}) and copied to {DEST}")

    def read_sector(lba):
        idx, off = divmod(lba * SECTOR, CHUNK)
        path = DEST / f"emmc-{idx:02x}.bin"
        if not path.exists() or path.stat().st_size < off + SECTOR:
            return None
        with open(path, "rb") as f:
            f.seek(off)
            return f.read(SECTOR)

    first = read_sector(0)
    parts = partitions(first, read_sector) if first else None
    if parts is None:
        print("No MBR at sector 0 in the backup folder.")
        return
    covered = 0
    while (path := DEST / f"emmc-{covered * SECTOR // CHUNK:02x}.bin").exists():
        covered += path.stat().st_size // SECTOR
        if path.stat().st_size < CHUNK:
            break
    print(f"Backup folder covers sectors 0-{covered - 1} without gaps.")
    print("Partitions (sectors):")
    for num, t, start, size in parts:
        end = start + size
        note = "in dump" if end <= covered else ("partly" if start < covered else "not in dump")
        print(f"  {num!s:>3} type 0x{t:02x} start {start:>9} size {size:>9} "
              f"({size * SECTOR / 2**20:8.1f} MiB)  {note}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])

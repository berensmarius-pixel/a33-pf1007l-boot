# a33: read-only dump of the first 2 GiB of the PF1007L eMMC to the SD card's FAT partition.
# Runs from our SD-booted U-Boot (no screen or console). Nothing here writes to the eMMC: only
# "mmc read" touches it; every write is fatwrite to mmc 0:1 (the SD card).
#
# Per 64 MiB chunk: read it twice, compare, SHA-256, write emmc-XX.bin, record the result in
# a33-status.txt. Stops at the first failure. Checked on the PC by scripts/a33-sdboot/check-dump.py.
# mmc 0 = SD slot, mmc 1 = eMMC (MMC2). Buffers sit above the script at 0x43100000.

setenv a 0x48000000
setenv b 0x4c000000
setenv e 0x47000000
setenv n 0x20000
setenv bytes 0x4000000
setenv longs 0x1000000
setenv a33_stage started
env export -t ${e}
fatwrite mmc 0:1 ${e} a33-status.txt ${filesize}

if mmc dev 1; then setenv emmc_dev ok; else setenv emmc_dev FAIL; setenv stop yes; fi
if part start mmc 1 1 p1_start; then part size mmc 1 1 p1_size; fi

for i in 00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10 11 12 13 14 15 16 17 18 19 1a 1b 1c 1d 1e 1f; do
  if test -z "${stop}"; then
    setexpr s 0x${i} * ${n}
    mmc dev 1
    if mmc read ${a} ${s} ${n}; then
      if mmc read ${b} ${s} ${n}; then
        if cmp.l ${a} ${b} ${longs}; then
          hash sha256 ${a} ${bytes} h
          if fatwrite mmc 0:1 ${a} emmc-${i}.bin ${bytes}; then
            setenv st_${i} "ok ${s} ${h}"
          else
            setenv st_${i} "FAIL fatwrite"; setenv stop yes
          fi
        else
          setenv st_${i} "FAIL reread differs"; setenv stop yes
        fi
      else
        setenv st_${i} "FAIL second read"; setenv stop yes
      fi
    else
      setenv st_${i} "FAIL first read"; setenv stop yes
    fi
    env export -t ${e}
    fatwrite mmc 0:1 ${e} a33-status.txt ${filesize}
  fi
done

setenv a33_stage finished
env export -t ${e}
fatwrite mmc 0:1 ${e} a33-status.txt ${filesize}

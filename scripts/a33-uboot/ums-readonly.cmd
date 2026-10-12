# Expose storage over USB as READ-ONLY disks (writes are patched out of this build).
# LUN 0 is the SD card (mmc 0), LUN 1 the eMMC (mmc 1). Identify them by size on the host.
ums 0 mmc 0,1 || ums 0 mmc 1 || ums 0 mmc 0

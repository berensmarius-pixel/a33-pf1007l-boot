# PF1007L 20260410: temporary root ADB through AiMOR

Tested on one **PF1007L / AiMOR 6.0.78 / April 20260410** frame on 2026-10-11,
using an Apple silicon Mac. This route starts the existing ADB daemon through
AiMOR's vendor command connection. It does not flash a boot image or enable
permanent ADB. The temporary connection ended at the next frame reboot.

Try stock USB ADB and stock network ADB first, as described in
[pf1007l-start-here.md](pf1007l-start-here.md). This is an additional option for
the exact firmware below when those tests fail. Read
[aimor-remote-root-shell.md](aimor-remote-root-shell.md) and the repository's
[backup, approval and privacy rules](../README.md#rules-we-learned-the-hard-way).
The tested session already had a verified private backup. Once you have access,
back up your own unit before installing packages or changing system files.

## 1. Tested unit

| Item | Observed value |
| --- | --- |
| About model | PF1007L |
| Android model / hardware | `AEEZO` / `sun8i` (Allwinner A33 family) |
| Firmware | `YHK.F-null-A33-1001-D1024-PF1007L-321-OS-AIMOR.0.20260410` |
| AiMOR | `com.efercro.os.aimor`, 6.0.78 (code 78) |
| Launcher APK SHA-256 | `abc4e274940e21729de7b9dbaf1f7969efdf427955d0c4881a319611942fb65d` (matches PR #3's January APK) |
| Android / display | 6.0.1, API 23 / 1280 × 800, density 160 |
| Stock WebView | 44.0.2403.119 |
| Ports | USB-C only, TF slot, button |
| eMMC | 30,777,344 sectors (15,758,000,128 bytes), from private backup |
| Boot partition | p6, start sector 172032, 65,536-sector partition, from private backup |
| Boot image | 15,886,336 bytes; hash below is the 31,028-sector image, not the whole partition |
| Boot image SHA-256 | `8ffc2a7d95972422b97ecf7e82da7002011bdacedcbfcc74dd52ae871b98a24e` |
| Successful access | `adb -s <frame-ip>:5555 shell id` returned `uid=0(root)` |

The firmware hash matches the April reports in [#13](https://github.com/wesbos/photo-frame-dashboard/pull/13)
and [#17](https://github.com/wesbos/photo-frame-dashboard/issues/17). Those reports
use different access routes; this unit's successful command did not write boot
or system storage. Host-only parsing rechecked the partition information and
boot hash in the saved backup when preparing this contribution.

USB attempts on this Mac showed transient `1f3a:efe8` FEL recovery enumeration,
then a black screen. A data path that enumerated a phone did not produce usable
normal Android USB ADB on the frame. Normal boot worked with its wall supply;
the precise cause of the Mac-connected failure was not established. Stock TCP
5555 refused connections. TCP 8086 was a separate paired WLAN file service,
not a verified ADB endpoint.

## 2. Why the command hostname matters

AiMOR sends command **12009** to `FileUtils.runCommand`, which starts `su`.
The existing [root-shell findings](aimor-remote-root-shell.md#4-code-path)
describe that handler. This firmware's backed-up optimized DEX code was inspected
before the live test. The one command sent was:

```sh
setprop service.adb.tcp.port 5555; stop adbd; start adbd
```

The connection is unencrypted TCP **7806**. The selected host on this unit was
**`imsconnect.efercro.com`**. The app also contains `iwsconnect.efercro.com`, but
that is the mode-0 host. An initial decompiler output misleadingly showed a zero
initializer. Fallback disassembly recovered the call to
`AndroidUtil.getBuildPropServerMode()`; the absent saved
`persist.sys.es_frame.server` property defaults to **mode 2**. After access, a
live property read was also empty. Redirecting only `imsconnect.efercro.com`
produced the real login and successful ADB connection.

The command sets only a runtime port property and restarts `adbd`. It does not
install keys, change authentication settings, or persist the port across boots.
Root ADB connected without an authorization prompt on this unit. This is root
access on the network; keep the session short and limited to your own frame.

On 2026-10-12, a host SHA-256 check of the captured launcher APK confirmed the
hash in the table matches the January APK reported in PR #3. The APK contains
no DEX files; its executable code is stored separately in
`oat/arm/launcher_aimor.odex`. APK equality corroborates the earlier finding but
does not prove that the optimized code or complete firmware is identical.
The command path was independently inspected in this unit's optimized code
and then verified by the successful live temporary-ADB session above.

## 3. Enable temporary Wi-Fi ADB

> **While this access is active, port 5555 is root ADB with no key check, open to every device on
> your network.** Do it on a network you control, keep the session short, finish the lock-down in
> [aimor-remote-root-shell.md](aimor-remote-root-shell.md) section 8 in the same session, and reboot
> the frame to close the port when you are done.

Use these steps only on a frame you own or have permission to administer. Python 3 and Android platform tools (`adb`) are required. The helpers use only the Python standard library. Start with a working AiMOR home screen and normal wall-supply power. A disabled AiMOR package cannot make this connection. If you already replaced Home, re-enable it through your working launcher's Android Settings first.

1. Record the frame's current IP, the Mac's LAN IP, and the existing DNS settings. Keep any device backup, credentials and identifiers private. Define the current addresses in each terminal; the following values are examples:

   ```sh
   task_mac_ip=192.168.50.10
   task_frame_ip=192.168.50.20
   task_router_ip=192.168.50.1
   ```

2. Check for existing listeners on ports 53 and 7806. Do not stop unrelated services:

   ```sh
   lsof -nP -iUDP:53 -iTCP:53 -iTCP:7806
   python3 scripts/aimor-network-adb/test-protocol.py
   python3 scripts/aimor-network-adb/test-dns.py
   python3 scripts/aimor-network-adb/server.py --dry-run
   ```

3. Obtain the owner's approval for the exact runtime command above, then in one terminal, start the one-shot command listener for the verified frame:

   ```sh
   /usr/bin/python3 scripts/aimor-network-adb/server.py \
     --bind "$task_mac_ip" --frame-ip "$task_frame_ip" --seconds 600
   ```

   It accepts only that peer, waits for login command 110009, and sends the fixed temporary ADB command once. It does not decode or log login contents. The outer header is 110019; protobuf field 4 holds command 12009 and field 5 the shell text. Heartbeat command 101 is echoed. A transmitted command is not proof that ADB started.

4. In another terminal, start the temporary DNS proxy **before changing DNS**:

   ```sh
   sudo /usr/bin/python3 scripts/aimor-network-adb/dns.py \
     --bind "$task_mac_ip" --hostname imsconnect.efercro.com \
     --allow-client "$task_frame_ip" --allow-client "$task_mac_ip"
   ```

   If an outbound TCP 7806 block is already in place, the frame must be allowed to reach the temporary host listener on that port. Keep the public vendor destination blocked.

   Prefer a DNS setting affecting only the frame. If the router intermediates DNS, additionally allow only its verified address with `--allow-client "$task_router_ip"`. In the tested Google Home setup, DNS was set to Custom, primary = Mac LAN IP, secondary blank. Router-wide DNS also affects other devices; record and restore its original mode and servers.

   Only the selected command hostname is redirected. Unrelated queries are forwarded to public resolvers; the selected host's AAAA query returns no address. The default host is `imsconnect.efercro.com`; `--hostname iwsconnect.efercro.com` is for a separately verified mode-0 unit. The helper does not change DNS settings itself. After binding port 53 through sudo it drops privileges to the invoking Mac user.

   The tested Mac had a separate TCP 53 listener. `--udp-only` avoided disturbing it; that option does not provide DNS over TCP. Use it only after verifying UDP queries reach this helper. Homebrew Python was blocked by the Mac firewall; `/usr/bin/python3` was already allowed. Diagnose the actual firewall/listener state if requests time out.

5. Verify both the helper and the frame's actual resolver path:

   ```sh
   dig -b "$task_mac_ip" @"$task_mac_ip" imsconnect.efercro.com A +short
   dig -b "$task_mac_ip" @"$task_mac_ip" example.com A +short
   # If the router is the frame's DNS resolver:
   dig @"$task_router_ip" imsconnect.efercro.com A +short
   dig @"$task_router_ip" imsconnect.efercro.com AAAA +short
   ```

   The command-host A answer must be the Mac address. An unrelated hostname should still resolve publicly. A direct helper lookup alone does not prove the frame uses it. Confirm the expected source appears in helper events.

6. Reconnect Wi-Fi or reboot the frame to trigger a fresh AiMOR connection. Re-read its IP afterward. If it changed, restart the command listener with the new verified address and update the DNS allowlist. For a sudo DNS process, an optional `--clients-file diagnostics/aimor-network-adb/clients.json` reloads a small JSON array of verified addresses on each request; replace the file atomically rather than adding an entire subnet. Explicit `--allow-client` entries remain allowed, so avoid retaining a stale frame there when using a reloadable file.

7. After the helper reports transmission, verify ADB and identity:

   ```sh
   adb connect "$task_frame_ip:5555"
   adb -s "$task_frame_ip:5555" get-state
   adb -s "$task_frame_ip:5555" shell id
   adb -s "$task_frame_ip:5555" shell getprop ro.hardware
   adb -s "$task_frame_ip:5555" shell getprop ro.build.version.release
   adb -s "$task_frame_ip:5555" shell getprop ro.build.display.id
   adb -s "$task_frame_ip:5555" shell getprop persist.sys.es_frame.server
   ```

   Expect `device`, UID 0, `sun8i`, Android 6.0.1 and the exact firmware above. A timeout, `unauthorized`, or an open TCP socket alone does not pass. Stop on an identity mismatch.

8. Restore original DNS **before stopping the DNS helper**, then verify public vendor and unrelated resolution. Stop only these task-owned helpers. The command listener exits after its one-shot session. Temporary ADB remains available until the frame reboots, so complete installation before that reboot.

## 4. After access: the existing dashboard

The verified result of this guide is temporary root ADB on the matching firmware.
The repository already supplies [`dashboard/`](../dashboard), a Vite dashboard
with sample data, and [`dashboard/kiosk/`](../dashboard/kiosk), its fullscreen
Android WebView app. Follow the existing
[backup and launcher steps](allwinner-a33-pf1007l.md#4-back-up-before-modifying-android)
before replacing Home or disabling AiMOR. Use `adb -s <frame-ip>:5555` wherever
the older USB examples use `adb -d`.

The dashboard build targets Chrome 106. This unit's stock WebView was 44, so
obtaining ADB alone does not prove that the dashboard renders. The existing
[WebView replacement guide](allwinner-a33-pf1007l.md#6-upgrade-webview-before-using-the-kiosk)
and [kiosk guide](allwinner-a33-pf1007l.md#7-build-the-fullscreen-kiosk-and-serve-the-demo-over-usb)
cover the next steps. They require their own backups and verification. The USB
serving example needs a working USB connection; a Wi-Fi-only setup needs a page
reachable from the frame over the LAN instead.

A different local replacement was installed during this unit's session and
survived reboot. The upstream dashboard, WebView 106 replacement and permanent
ADB were not tested on this unit and are not added by this contribution. If you
disable AiMOR after verifying a usable replacement Home, its vendor connection
closes and this access route is unavailable until you re-enable it. Reboot ends
temporary ADB even if the replacement software still works.

## 5. Report and validation

```text
About model / firmware: PF1007L / YHK.F-null-A33-1001-D1024-PF1007L-321-OS-AIMOR.0.20260410
AiMOR version: 6.0.78 (code 78)
Launcher APK SHA-256: abc4e274940e21729de7b9dbaf1f7969efdf427955d0c4881a319611942fb65d (independently checked; matches PR #3)
Ports (DC jack, or USB-C only): USB-C only, TF slot, button
Cable and port that gave USB data (or none): A-to-C data path verified with a phone; transient FEL on Mac, no usable normal Android USB ADB
T3 USB IDs seen / adb devices output: transient 1f3a:efe8; adb list empty
T3b network ADB result (port 5555): refused before the vendor-channel command
T4 sunxi-fel version output (or skipped): usb_bulk_recv() ERROR -1: Input/Output Error during transient FEL; no successful identity query in this test
T5 check-dump stage / chunks (or skipped): not used for this network access route; private full backup already existed
eMMC size in sectors: 30,777,344
Boot partition start sector: 172032 (read from backup)
Boot image SHA-256 (sector 172032, 31,028 sectors): 8ffc2a7d95972422b97ecf7e82da7002011bdacedcbfcc74dd52ae871b98a24e
Route used and result: one vendor-channel runtime command; root ADB over Wi-Fi verified; DNS restored; ADB ended after reboot
Host OS: macOS, Apple silicon
First failed step and its exact output: USB ADB absent; FEL version query failed as recorded above
```

Before publication, the two host-only test scripts passed with both the host
Python and Apple's `/usr/bin/python3`: **8 tests** per interpreter. Tests cover a
known byte vector, fragmented/malformed frames, wrong-peer rejection, login
gating, exactly one dispatch, the default production hostname, reloadable
allowlists, and real loopback UDP/TCP DNS. `server.py --dry-run` reports a 73-byte
packet with `network_contact=false`. No frame is contacted by these checks.

The live test separately verified `device`, UID 0, `sun8i`, Android 6.0.1 and the
exact firmware, then restored DNS and stopped both temporary helpers. A packet
transmission alone was not treated as success. Private dumps, login contents,
serials, MACs, Wi-Fi settings, whole-eMMC hashes and replacement-app source are
excluded from this contribution.

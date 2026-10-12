#!/usr/bin/env python3
"""All-in-one Hotspot ADB unlocker for PF1007L AiMOR frames."""
import ipaddress
import json
import os
import re
import socket
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Add current folder to sys.path for proto and dns
sys.path.insert(0, str(Path(__file__).parent))
from proto import FrameReader, frame, edu_pipeline, CMD_PIP_HEAD, RECEIVE_SHELL_COMMAND
from dns import Resolver, UDPHandler, TCPHandler, UDPServer, TCPServer

ADB_COMMAND = 'setprop service.adb.tcp.port 5555; stop adbd; start adbd'
HOST_IP = '192.168.137.1'


def get_hotspot_clients():
    """Find all active client IPs on the 192.168.137.x interface."""
    try:
        out = subprocess.check_output(['arp', '-a', '-N', HOST_IP], text=True)
        ips = []
        for line in out.splitlines():
            m = re.search(r'192\.168\.137\.(\d+)', line)
            if m:
                last_octet = int(m.group(1))
                if last_octet not in (1, 255):
                    ips.append(f'192.168.137.{last_octet}')
        return ips
    except Exception:
        return []


class WildcardResolver(Resolver):
    def reply(self, packet):
        # Override to log every query
        try:
            ident, flags, name, kind, cls, end = self._question_safe(packet)
            print(f"[DNS Query] Name: {name} (type: {kind})")
        except Exception as e:
            print(f"[DNS Query] Malformed packet: {e}")
        return super().reply(packet)

    def _question_safe(self, packet):
        from dns import question
        return question(packet)


def run_dns(stop_event):
    resolver = WildcardResolver(HOST_IP, upstreams=('8.8.8.8', '1.1.1.1'))
    udp = UDPServer((HOST_IP, 53), UDPHandler)
    tcp = TCPServer((HOST_IP, 53), TCPHandler)

    # Allow ALL hotspot clients
    class AlwaysAllowSet(set):
        def __contains__(self, item):
            return True

    for server in (udp, tcp):
        server.resolver = resolver
        server.allowed = AlwaysAllowSet()
        server.bind_ip = HOST_IP
        server.clients_file = None

    t_tcp = threading.Thread(target=tcp.serve_forever, daemon=True)
    t_tcp.start()
    t_udp = threading.Thread(target=udp.serve_forever, daemon=True)
    t_udp.start()
    print(f"[DNS] Listening on {HOST_IP}:53 (redirecting imsconnect & iwsconnect to {HOST_IP})")

    def cleanup():
        stop_event.wait()
        udp.shutdown()
        tcp.shutdown()

    threading.Thread(target=cleanup, daemon=True).start()
    return udp, tcp


def run_aimor_server(stop_event, on_cmd_sent):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind((HOST_IP, 7806))
        listener.listen(5)
        listener.settimeout(1)
        print(f"[AIMOR] Listening on {HOST_IP}:7806 for frame connections...")

        while not stop_event.is_set():
            try:
                conn, (peer_ip, peer_port) = listener.accept()
            except socket.timeout:
                continue

            print(f"\n[AIMOR] >>> INCOMING CONNECTION from {peer_ip}:{peer_port} <<<")
            reader = FrameReader()
            conn.settimeout(2)
            session_start = time.monotonic()
            cmd_sent = False

            with conn:
                while time.monotonic() - session_start < 60 and not stop_event.is_set():
                    try:
                        data = conn.recv(4096)
                    except socket.timeout:
                        continue
                    if not data:
                        print(f"[AIMOR] Connection closed by {peer_ip}")
                        break

                    for seq, cmd, payload in reader.feed(data):
                        print(f"[AIMOR] Received command {cmd} ({len(payload)} bytes) from {peer_ip}")
                        if cmd == 101 and not payload:
                            conn.sendall(frame(seq, 101, b''))
                            print("[AIMOR] Heartbeat echoed")
                        elif not cmd_sent:
                            print(f"[AIMOR] Received trigger cmd {cmd}. Sending ADB shell command!")
                            payload_cmd = edu_pipeline(RECEIVE_SHELL_COMMAND, ADB_COMMAND.encode())
                            packet = frame(1, CMD_PIP_HEAD, payload_cmd)
                            conn.sendall(packet)
                            cmd_sent = True
                            print(f"[AIMOR] >>> EXECUTED ROOT SHELL COMMAND: {ADB_COMMAND} <<<")
                            on_cmd_sent(peer_ip)
                            time.sleep(1)


def main():
    print("=" * 60)
    print("PF1007L AiMOR Hotspot ADB Unlocker")
    print(f"Host IP: {HOST_IP}")
    print("=" * 60)

    stop_event = threading.Event()
    run_dns(stop_event)

    known_peers = set()

    def on_cmd_sent(peer_ip):
        known_peers.add(peer_ip)

    t_server = threading.Thread(target=run_aimor_server, args=(stop_event, on_cmd_sent), daemon=True)
    t_server.start()

    adb_path = r"C:\Users\beren\platform-tools\adb.exe"
    print("\n[INFO] Server aktiv. Bitte jetzt auf dem Rahmen WLAN kurz aus/einschalten")
    print("[INFO] oder den Rahmen neu starten, damit AiMOR sich verbindet.\n")

    start_time = time.monotonic()
    adb_connected = False

    while time.monotonic() - start_time < 300 and not adb_connected:
        time.sleep(2)
        # Check active clients
        clients = get_hotspot_clients()
        for ip in clients + list(known_peers):
            try:
                res = subprocess.run(
                    [adb_path, "connect", f"{ip}:5555"],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                if "connected to" in res.stdout and "unable" not in res.stdout:
                    print(f"\n[ADB] SUCCESS! Verbunden mit {ip}:5555")
                    id_res = subprocess.run(
                        [adb_path, "-s", f"{ip}:5555", "shell", "id"],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    print(f"[ADB] Root-Check: {id_res.stdout.strip()}")
                    adb_connected = True
                    break
            except Exception:
                pass

    if adb_connected:
        print("\n" + "=" * 60)
        print("ZIEL ERREICHT: ADB ROOT IST AKTIV!")
        print("=" * 60)
    else:
        print("\nTimeout: Keine Verbindung hergestellt.")

    stop_event.set()


if __name__ == '__main__':
    main()

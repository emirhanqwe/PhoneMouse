import asyncio
import json
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

import websockets
from pynput.keyboard import Controller as KeyboardController, Key
from pynput.mouse import Controller, Button

HOST = "0.0.0.0"
WS_PORT = 8765
HTTP_PORT = 8443

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"

mouse = Controller()
keyboard = KeyboardController()


SPECIAL_KEYS = {
    "backspace": Key.backspace,
    "delete": Key.delete,
    "enter": Key.enter,
    "tab": Key.tab,
    "escape": Key.esc,
    "space": Key.space,
    "arrowleft": Key.left,
    "arrowright": Key.right,
    "arrowup": Key.up,
    "arrowdown": Key.down,
}


def process_message(message):
    message = message.strip()
    if not message:
        return

    if message.startswith("{"):
        try:
            keyboard_message = json.loads(message)
        except json.JSONDecodeError:
            return

        if keyboard_message.get("type") == "text":
            text = keyboard_message.get("value", "")
            if isinstance(text, str) and text:
                try:
                    keyboard.type(text)
                except (KeyError, ValueError):
                    pass
            return

        if keyboard_message.get("type") == "key":
            key_name = keyboard_message.get("value", "").lower()
            key = SPECIAL_KEYS.get(key_name)
            if key is not None:
                keyboard.press(key)
                keyboard.release(key)
            return

    if message == "left":
        mouse.click(Button.left, 1)
        return

    if message == "right":
        mouse.click(Button.right, 1)
        return

    if message.startswith("scroll,"):
        try:
            value = float(message.split(",", 1)[1])
            mouse.scroll(0, value)
        except ValueError:
            pass
        return

    if "," in message:
        try:
            dx, dy = message.split(",", 1)
            mouse.move(float(dx), float(dy))
        except ValueError:
            pass


async def websocket_handler(websocket):
    print(f"[+] Telefon bağlandı: {websocket.remote_address}")
    try:
        async for message in websocket:
            if isinstance(message, str):
                process_message(message)
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print(f"[-] Telefon bağlantısı kesildi: {websocket.remote_address}")


class WebHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/":
            self.path = "/index.html"
        return super().do_GET()


def start_web_server():
    if not WEB_DIR.exists():
        print(f"[HATA] '{WEB_DIR}' klasörü bulunamadı!")
        print("[İPUCU] Dosyaları şu yapıda dizinize koyun:")
        print("  proje/")
        print("  ├── server.py")
        print("  └── web/")
        print("      ├── index.html")
        print("      ├── style.css")
        print("      ├── app.js")
        print("      ├── manifest.json")
        print("      └── sw.js")
        return

    server = ThreadingHTTPServer((HOST, HTTP_PORT), WebHandler)
    print(f"[HTTP] http://0.0.0.0:{HTTP_PORT}")
    server.serve_forever()


async def start_websocket_server():
    print(f"[WS] ws://0.0.0.0:{WS_PORT}")
    async with websockets.serve(
        websocket_handler,
        HOST,
        WS_PORT,
        ping_interval=20,
        ping_timeout=20,
        max_size=1024
    ):
        await asyncio.Future()


def main():
    web_thread = threading.Thread(target=start_web_server, daemon=True)
    web_thread.start()
    asyncio.run(start_websocket_server())


if __name__ == "__main__":
    main()
const connectScreen = document.getElementById("connectScreen");
const trackpadScreen = document.getElementById("trackpadScreen");

const ipInput = document.getElementById("ipInput");
const connectButton = document.getElementById("connectButton");
const statusElement = document.getElementById("status");
const savedIpsElement = document.getElementById("savedIps");
const savedIpList = document.getElementById("savedIpList");
const settingsButton = document.getElementById("settingsButton");
const settingsPanel = document.getElementById("settingsPanel");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const keepScreenAwake = document.getElementById("keepScreenAwake");
const wakeLockStatus = document.getElementById("wakeLockStatus");

const trackpad = document.getElementById("trackpad");
const keyboardButton = document.getElementById("keyboardButton");
const keyboardPanel = document.getElementById("keyboardPanel");
const closeKeyboardButton = document.getElementById("closeKeyboardButton");
const keyboardInput = document.getElementById("keyboardInput");

let socket = null;
let wakeLock = null;

let touchState = {
    count: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
    startTime: 0
};

let scrollState = {
    lastY: 0,
    initialized: false
};

const MOVE_THRESHOLD = 8;
const CLICK_TIME = 280;
const MOVE_SENSITIVITY = 2;
const SAVED_IPS_KEY = "phoneMouse.savedIps";
const KEEP_SCREEN_AWAKE_KEY = "phoneMouse.keepScreenAwake";

function getSavedIps() {
    try {
        const savedIps = JSON.parse(localStorage.getItem(SAVED_IPS_KEY) || "[]");
        return Array.isArray(savedIps) ? savedIps.filter(ip => typeof ip === "string") : [];
    } catch (error) {
        return [];
    }
}

function saveIp(ip) {
    const savedIps = [ip, ...getSavedIps().filter(savedIp => savedIp !== ip)].slice(0, 6);
    localStorage.setItem(SAVED_IPS_KEY, JSON.stringify(savedIps));
    renderSavedIps();
}

function removeSavedIp(ip) {
    const savedIps = getSavedIps().filter(savedIp => savedIp !== ip);
    localStorage.setItem(SAVED_IPS_KEY, JSON.stringify(savedIps));
    renderSavedIps();
}

function renderSavedIps() {
    const savedIps = getSavedIps();
    savedIpList.replaceChildren();
    savedIpsElement.classList.toggle("hidden", savedIps.length === 0);

    for (const ip of savedIps) {
        const row = document.createElement("div");
        row.className = "savedIpRow";

        const connectSavedButton = document.createElement("button");
        connectSavedButton.className = "savedIpButton";
        connectSavedButton.textContent = ip;
        connectSavedButton.addEventListener("click", () => {
            ipInput.value = ip;
            connect();
        });

        const removeButton = document.createElement("button");
        removeButton.className = "removeIpButton";
        removeButton.textContent = "×";
        removeButton.title = `${ip} kaydını sil`;
        removeButton.addEventListener("click", () => removeSavedIp(ip));

        row.append(connectSavedButton, removeButton);
        savedIpList.append(row);
    }
}

function setStatus(text) {
    statusElement.textContent = text;
}

function send(data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
    }

    socket.send(data);
}

function sendKeyboardMessage(type, value) {
    send(JSON.stringify({ type, value }));
}

async function requestWakeLock() {
    if (!keepScreenAwake.checked || !("wakeLock" in navigator)) {
        return;
    }

    if (wakeLock && !wakeLock.released) {
        return;
    }

    try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
            wakeLock = null;
        });
    } catch (error) {
        console.log("Wake Lock alınamadı:", error);
    }
}

async function releaseWakeLock() {
    if (!wakeLock) {
        return;
    }

    await wakeLock.release();
    wakeLock = null;
}

async function reconnectWakeLock() {
    if (
        document.visibilityState === "visible" &&
        socket &&
        socket.readyState === WebSocket.OPEN
    ) {
        await requestWakeLock();
    }
}

async function connect() {
    const ip = ipInput.value.trim();

    if (!ip) {
        setStatus("IP adresini gir.");
        return;
    }

    connectButton.disabled = true;
    setStatus("Bağlanıyor...");

    if (socket) {
        socket.close();
    }

    const protocol =
        window.location.protocol === "https:"
            ? "wss:"
            : "ws:";

    socket = new WebSocket(
        `${protocol}//${ip}:8765`
    );

    socket.addEventListener("open", async () => {
        saveIp(ip);
        setStatus("Bağlandı");

        connectScreen.classList.add("hidden");
        trackpadScreen.classList.remove("hidden");

        await requestWakeLock();
    });

    socket.addEventListener("close", () => {
        releaseWakeLock();
        connectButton.disabled = false;

        trackpadScreen.classList.add("hidden");
        connectScreen.classList.remove("hidden");

        setStatus("Bağlantı kesildi");
    });

    socket.addEventListener("error", () => {
        connectButton.disabled = false;
        setStatus("Bağlantı başarısız");
    });
}

settingsButton.addEventListener("click", () => {
    settingsPanel.classList.remove("hidden");
});

closeSettingsButton.addEventListener("click", () => {
    settingsPanel.classList.add("hidden");
});

keepScreenAwake.checked = localStorage.getItem(KEEP_SCREEN_AWAKE_KEY) !== "false";

keepScreenAwake.addEventListener("change", async () => {
    localStorage.setItem(KEEP_SCREEN_AWAKE_KEY, String(keepScreenAwake.checked));

    if (keepScreenAwake.checked) {
        await requestWakeLock();
    } else {
        await releaseWakeLock();
    }
});

if (!("wakeLock" in navigator)) {
    wakeLockStatus.textContent = "Bu tarayıcı ekranı açık tutmayı desteklemiyor.";
}

renderSavedIps();

function openKeyboard() {
    keyboardPanel.classList.remove("hidden");
    keyboardInput.focus();
}

function closeKeyboard() {
    keyboardInput.blur();
    keyboardPanel.classList.add("hidden");
}

keyboardButton.addEventListener("click", openKeyboard);
closeKeyboardButton.addEventListener("click", closeKeyboard);

keyboardInput.addEventListener("input", (event) => {
    if (event.inputType.startsWith("insert")) {
        const text = event.data || keyboardInput.value;

        if (text) {
            sendKeyboardMessage("text", text);
        }

        keyboardInput.value = "";
    }
});

keyboardInput.addEventListener("keydown", (event) => {
    const specialKeys = [
        "Backspace",
        "Delete",
        "Enter",
        "Tab",
        "Escape",
        "Space",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown"
    ];

    if (event.key === " ") {
        event.preventDefault();
        sendKeyboardMessage("key", "space");
    } else if (specialKeys.includes(event.key)) {
        event.preventDefault();
        sendKeyboardMessage("key", event.key.toLowerCase());
    }
});

function getAverageTouch(touches) {
    let x = 0;
    let y = 0;

    for (const touch of touches) {
        x += touch.clientX;
        y += touch.clientY;
    }

    return {
        x: x / touches.length,
        y: y / touches.length
    };
}

trackpad.addEventListener(
    "touchstart",
    (event) => {
        event.preventDefault();

        const touches = event.touches;

        touchState.count = touches.length;
        touchState.startTime = performance.now();
        touchState.moved = false;

        if (touches.length === 1) {
            const touch = touches[0];

            touchState.startX = touch.clientX;
            touchState.startY = touch.clientY;

            touchState.lastX = touch.clientX;
            touchState.lastY = touch.clientY;

            scrollState.initialized = false;
        }

        if (touches.length === 2) {
            const center = getAverageTouch(touches);

            touchState.startX = center.x;
            touchState.startY = center.y;

            touchState.lastX = center.x;
            touchState.lastY = center.y;

            scrollState.lastY = center.y;
            scrollState.initialized = true;
        }
    },
    {
        passive: false
    }
);

trackpad.addEventListener(
    "touchmove",
    (event) => {
        event.preventDefault();

        const touches = event.touches;

        if (touches.length === 1) {
            const touch = touches[0];

            const dx = touch.clientX - touchState.lastX;
            const dy = touch.clientY - touchState.lastY;

            const totalDx =
                touch.clientX - touchState.startX;

            const totalDy =
                touch.clientY - touchState.startY;

            if (
                Math.abs(totalDx) > MOVE_THRESHOLD ||
                Math.abs(totalDy) > MOVE_THRESHOLD
            ) {
                touchState.moved = true;
            }

            if (dx !== 0 || dy !== 0) {
                send(`${dx * MOVE_SENSITIVITY},${dy * MOVE_SENSITIVITY}`);
            }

            touchState.lastX = touch.clientX;
            touchState.lastY = touch.clientY;
        }

        if (touches.length === 2) {
            const center = getAverageTouch(touches);

            if (!scrollState.initialized) {
                scrollState.lastY = center.y;
                scrollState.initialized = true;
            }

            const dy = center.y - scrollState.lastY;

            if (Math.abs(dy) > 0.5) {
                const scrollAmount = -dy * 0.12;

                send(`scroll,${scrollAmount}`);
            }

            scrollState.lastY = center.y;
            touchState.moved = true;
        }
    },
    {
        passive: false
    }
);

trackpad.addEventListener(
    "touchend",
    (event) => {
        event.preventDefault();

        const elapsed = performance.now() - touchState.startTime;
        const remainingTouches = event.touches.length;

        // Tüm parmaklar kalktığında karar ver
        if (remainingTouches === 0) {
            if (!touchState.moved && elapsed <= CLICK_TIME) {
                if (touchState.count === 1) {
                    send("left");
                } else if (touchState.count === 2) {
                    send("right");
                }
            }
            
            // Sıfırla
            touchState.count = 0;
            touchState.moved = false;
            scrollState.initialized = false;
        }
    },
    { passive: false }
);

trackpad.addEventListener(
    "touchcancel",
    (event) => {
        event.preventDefault();

        touchState.count = 0;
        touchState.moved = false;
        scrollState.initialized = false;
    },
    {
        passive: false
    }
);

document.addEventListener(
    "touchmove",
    (event) => {
        event.preventDefault();
    },
    {
        passive: false
    }
);

document.addEventListener(
    "gesturestart",
    (event) => {
        event.preventDefault();
    },
    {
        passive: false
    }
);

document.addEventListener(
    "gesturechange",
    (event) => {
        event.preventDefault();
    },
    {
        passive: false
    }
);

document.addEventListener(
    "gestureend",
    (event) => {
        event.preventDefault();
    },
    {
        passive: false
    }
);

document.addEventListener(
    "visibilitychange",
    async () => {
        if (document.visibilityState === "visible") {
            await reconnectWakeLock();
        }
    }
);

window.addEventListener(
    "pageshow",
    async () => {
        await reconnectWakeLock();
    }
);

connectButton.addEventListener(
    "click",
    connect
);

ipInput.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Enter") {
            connect();
        }
    }
);

if ("serviceWorker" in navigator) {
    window.addEventListener(
        "load",
        () => {
            navigator.serviceWorker.register("sw.js")
                .catch(error => {
                    console.log(
                        "Service Worker kayıt hatası:",
                        error
                    );
                });
        }
    );
}
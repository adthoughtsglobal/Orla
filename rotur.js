const roturState = {
    is_connected: false,
    authenticated: false,
    user: {}
};

function randomString(length) {
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const max = characters.length;

    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * max));
    }

    return result;
}

async function login_prompt() {
    if (roturState.authenticated) return "Already Logged In";

    const styleUrl = "assets/roturstyle.css";
    const css = await fetch(styleUrl).then(r => r.text());
    const dataUri = `data:text/css;charset=utf-8,${encodeURIComponent(css)}`;

    const frame = document.createElement("iframe");
    frame.id = "rotur-auth";
    frame.src = `https://rotur.dev/auth?system=orion&styles=${encodeURIComponent(dataUri)}`;
    frame.style.visibility = "hidden";

    frame.addEventListener("load", () => {
        frame.style.visibility = "visible";
    });

    document.body.appendChild(frame);

    function authHandler(event) {
        if (event.origin !== "https://rotur.dev") return;
        if (event.data?.type !== "rotur-auth-token") return;

        frame.remove();
        window.removeEventListener("message", authHandler);

        roturState.userToken = event.data.token;

        localStorage.setItem(
            "orion-rotur",
            JSON.stringify({
                type: "token",
                token: event.data.token
            })
        );

        loginWithToken(event.data.token).catch(console.error);
    }

    window.addEventListener("message", authHandler);
    return "Auth window opened";
}

async function loginWithToken(token) {
    if (roturState.authenticated) return "Already Logged In";

    try {
        const response = await fetch(
            `https://social.rotur.dev/get_user?auth=${encodeURIComponent(token)}`
        );

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status}`);
        }

        const packet = await response.json();

        roturState.userToken = packet.key || token;
        roturState.user = { ...packet };

        delete roturState.user.key;
        delete roturState.user.password;

        const friends = roturState.user["sys.friends"] || [];
        const requests = roturState.user["sys.requests"] || [];

        roturState.friends = {
            list: friends,
            requests
        };

        delete roturState.user["sys.friends"];
        delete roturState.user["sys.requests"];

        roturState.username =
            roturState.designation +
            "-" +
            roturState.user.username +
            "§" +
            randomString(10);

        if (roturState.my_client) {
            roturState.my_client.username = roturState.username;
        }

        roturState.authenticated = true;

        say("Connected")
        greenflag();
        loader.hide();
        return `Logged in as ${roturState.user.username}`;
    } catch (error) {
        roturState.authenticated = false;

        say(
            "<h1>Rotur is down.</h1>Looks like RoturTW's servers or their providers are down. Try again in a few minutes.",
            "failed"
        );

        throw new Error(`Failed to login: ${error.message}`);
    }
}
async function restoreRoturLogin() {
    const saved = localStorage.getItem("orion-rotur");
    if (!saved) return false;

    try {
        const data = JSON.parse(saved);

        if (data.type === "token" && data.token) {
            try {
                let x = await loginWithToken(data.token);
                return x;
            } catch {
                localStorage.removeItem("orion-rotur");
            }
        }
    } catch {
        localStorage.removeItem("orion-rotur");
    }

    return false;
}

async function initRotur() {
    loader.show();
    const restored = await restoreRoturLogin();

    if (!restored) {
        await login_prompt();
    }
}

initRotur();
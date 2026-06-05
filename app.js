const customEmojisByServer = new Map();
let ws = null;
currentServer = "wss://dms.mistium.com/"
function createInitialState() {
    return {
        _currentChannel: null,
        members_list_shown: true,
        show_blocked_msgs: true,
        server: {},
        user: null,
        user_keys: null,
        validator: null,
        validator_key: null,
        users: {},
        online_users: {},
        reply_to: {},
        messages: {},
        unread: {},
        channels: {},
        busy: false,
        message_ontime_limit: 20,
        typingUsers: {},
        additionalMessageLoad: false,
        _embedCache: {},
        voice_connected: false,
        peer: null,

        renderWindowSize: 200,
        renderBuffer: 50,
        orderedMessages: [],
        renderStart: 0,
        renderEnd: 0,

        set currentChannel(value) {
            this._currentChannel = value;
            settings.set("currentServer", currentServer);
            this.messages = {};

            const ch = this.channelsArray.find(c => c.name === value);

            if (ws?.readyState === 1) {
                if (state.voice_connected) {
                    ws.send(JSON.stringify({
                        cmd: "voice_leave"
                    }));

                    state.peer = null;
                    state.voice_connected = false;
                }

                if (ch?.type === "forum" && isNaN(this._currentThread)) {
                    renderThreads(ch.threads);
                    return;
                }

                if (this._currentThread !== undefined && ch?.threads?.[this._currentThread]) {
                    const thread = ch.threads[this._currentThread];

                    ws.send(JSON.stringify({
                        cmd: "thread_messages",
                        channel: value,
                        thread_id: thread.id
                    }));
                } else if (ch?.type == "voice") {
                    if (window.confirm("Load 93KB for voice configuration?")) {
                        loadScriptOnce("assets/peer.js")
                            .then(() => {
                                state.peer = new Peer();

                                state.peer.on("open", (id) => {
                                    ws.send(JSON.stringify({
                                        cmd: "voice_join",
                                        channel: value,
                                        peer_id: id
                                    }));
                                });

                                state.voice_connected = true;
                            })
                            .catch(console.error);
                    }
                } else {
                    ws.send(JSON.stringify({
                        cmd: "messages_get",
                        channel: value,
                        limit: state.message_ontime_limit
                    }));
                }
            }
        },

        get currentChannel() {
            return this._currentChannel;
        },

        get settings() {
            return settings.get();
        }
    };
}

let state = createInitialState();

function resetState() {
    const fresh = createInitialState();

    for (const key of Object.keys(state)) {
        delete state[key];
    }

    Object.defineProperties(
        state,
        Object.getOwnPropertyDescriptors(fresh)
    );
}

const membersList = document.querySelector(".members_list");

document.getElementById("memberlistbtn")?.addEventListener("click", () => {
    membersList.style.display =
        membersList.style.display === "none" ? "" : "none";
});

function connectWebSocket() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    try { if (ws && ws.readyState === 1) ws.close(); } catch { }
    ws = new WebSocket(currentServer);
    attachWsHandlers();
}

function roturToken() {
    return roturState.userToken;
}

function attachWsHandlers() {
    ws.onmessage = async (event) => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch {
            console.warn("Non-JSON message", event.data);
            return;
        }
        switch (data.cmd) {
            case "handshake": {
                const vKey = data?.val?.validator_key;
                if (vKey) state.validator_key = vKey;
                state.server = data?.val?.server || {};
                state.server.url = currentServer;
                document
                    .getElementById("loader_image")
                    ?.setAttribute("src", state.server.icon || "");
                loader.show();
                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "cloud",
                        action: `
                            ${state.server.banner ? `<img src="${state.server.banner}" style="width:100%; max-width: 20em">` : ""}
                            <h1 style="margin:.3em 0;">${state.server.name ?? ""}</h1>
                            <span>${state.server.url ?? ""}</span>
                        `
                    })
                );
                setTimeout(() => {
                    runcmd("ls")
                }, 2500);

                const servers = settings.get("servers_index") || [];

                const sName = state.server.name || state.server.title || "Server";
                const sIcon = state.server.icon;
                const sURL = state.server.url;

                const exists = servers.some(server => server.url === sURL);

                if (!exists) {
                    servers.push({
                        name: sName,
                        icon: sIcon,
                        url: sURL
                    });

                    settings.set("servers_index", servers);
                }
                const authTok = roturToken();
                if (authTok && vKey) {
                    try {
                        await generateValidatorAndAuth(vKey, authTok);
                    } catch (e) { showError(e.message); }
                } else if (!authTok) {
                    showError("Not logged in to Rotur. Please authenticate.");
                }
                break;
            }
            case "auth_success": {
                ws.send(JSON.stringify({ cmd: "channels_get" }));
                ws.send(JSON.stringify({ cmd: "users_online" }));
                setTimeout(loader.hide, 500);
                const input = document.getElementById("mainTxtAr");
                if (input && !input._listenerAttached) {
                    attachAutoResize(input);

                    input.addEventListener("keydown", (ev) => {
                        if (ev.key === "Enter" && !ev.shiftKey) {
                            const payload = {
                                cmd: "message_new",
                                content: input.value,
                                channel: state.currentChannel,
                            };
                            const r = state.reply_to[state.currentChannel];
                            if (r) {
                                payload.reply_to = r.id;
                                state.reply_to[state.currentChannel] = null;
                                hidereplyPrompt();
                            }
                            ws.send(JSON.stringify(payload));
                            ev.preventDefault();
                            input.value = "";
                            input.style.height = "auto";
                        }
                    });

                    input._listenerAttached = true;
                }
                break;
            }
            case "ready": {
                state.user = data.user;
                updateUserPanel();
                break;
            }
            case "channels_get":
                if (data.val) listChannels(data.val);
                break;
            case "messages_get":
                if (data.messages) listMessages(data.messages);
                break;
            case "messages_around":
                handleMessagesAround(data);
                break;
            case "messages_pinned":
                if (data.messages) listInPane(data.messages);
                break;
            case "messages_search":
                console.log("inter")
                if (data.results) listInPane(data.results);
                break;
            case "thread_messages":
                if (data.messages) listMessages(data.messages);
                break;
            case "message_new":
                addMessage(data);
                break;
            case "message_delete": {
                const mid = data.id;
                let user = "someone";
                console.log(state.messages[mid])
                if (mid) {
                    if (state.messages[mid]) {
                        user = state.messages[mid].user;
                        delete state.messages[mid];
                    }

                    const node = document.querySelector(
                        `.msg[data-id="${CSS.escape(mid)}"]`,
                    );
                    if (node) {
                        node.querySelector(".contains_text").style.color = "red";
                    };

                    document
                        .querySelectorAll(`.reply-excerpt[data-ref="${CSS.escape(mid)}"]`)
                        .forEach((el) => {
                            el.classList.add("missing");
                            el.innerHTML = "Replying to deleted message";
                        });
                    document.getElementById("logspane").appendChild(
                        MessageBuilder.action({
                            icon: "close",
                            username: user,
                            action: "deleted a message"
                        })
                    )
                }
                break;
            }
            case "message_edit": {
                const mid = data.id;
                if (mid && state.messages[mid]) {
                    state.messages[mid].content = data.content;
                    state.messages[mid].edited = true;
                }
                const message = document.querySelector(
                    `.msg[data-id="${CSS.escape(data.id)}"]`
                );

                if (!message) return;
                console.log("elefound")
                message.classList.remove("pulse");

                const textNode = message.querySelector(".contains_text");

                if (textNode) {
                    textNode.innerHTML =
                        formatMessageContent(data.content) +
                        '<span class="edited-tag icon">edit</span>';
                }
                if (state.editing && state.editing.id === mid) cancelEdit();

                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "edit",
                        username: data.message.user,
                        action: "edited a message",
                        expiry: 5000
                    })
                )
                break;
            }
            case 'typing':
                const channel = data.channel;
                const user = data.user;
                if (user === state.currentUser?.username) break;

                if (!state.typingUsers[channel]) {
                    state.typingUsers[channel] = new Map();
                }

                const typingMap = state.typingUsers[channel];

                const now = Date.now();

                typingMap.set(user, {
                    startedAt: now,
                    expireAt: now + 5000
                });

                if (channel === state.currentChannel) {
                    updateTypingIndicator();
                }

                setTimeout(() => {
                    const entry = typingMap.get(user);
                    if (entry && entry.expireAt <= Date.now()) {
                        typingMap.delete(user);
                        updateTypingIndicator();
                    }
                }, 5000);

                break;
            case "users_list": {
                const arr = data.users || [];
                for (const u of arr) {
                    if (!u || !u.username) continue;
                    state.users[u.username] = u;
                }
                renderMembers();
                break;
            }
            case "users_online": {
                const arr = data.users || [];
                state.online_users = {};
                for (const u of arr) {
                    if (!u || !u.username) continue;
                    state.online_users[u.username] = u;
                    if (!state.users[u.username]) state.users[u.username] = u;
                }
                renderMembers();
                break;
            }
            case "user_connect": {
                const u = data.user;
                if (u?.username) {
                    state.online_users[u.username] = u;
                    state.users[u.username] = u;
                    renderMembers();
                    document.getElementById("logspane").appendChild(
                        MessageBuilder.action({
                            icon: "arrow_forward",
                            username: u.username,
                            action: "is online",
                            expiry: 5000
                        })
                    )
                }
                break;
            }
            case "user_disconnect": {
                const uname = data.username || data.user?.username;
                if (uname && state.online_users[uname]) {
                    delete state.online_users[uname];
                    renderMembers();
                    document.getElementById("logspane").appendChild(
                        MessageBuilder.action({
                            icon: "arrow_back",
                            username: uname,
                            action: "went offline",
                            expiry: 5000
                        })
                    )
                }
                break;
            }
            case "status_get": {
                if (data.status.text && state.users[data.username]?.status?.text != data.status.text)
                    document.getElementById("logspane").appendChild(
                        MessageBuilder.action({
                            icon: "add_reaction",
                            username: data.username,
                            action: "set status: " + data.status.text,
                            expiry: 5000
                        })
                    )

                state.users[data.username].status = data.status;
                break;
            }
            case 'message_react_add': {
                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "add_reaction",
                        username: data.from,
                        action: "reacted " + data.emoji + " to <strong>a_message</strong> in " + data.channel,
                        expiry: 5000
                    })
                )
                const message = state.messages[data.id];
                if (!message) break;

                if (!message.reactions) message.reactions = {};
                if (!message.reactions[data.emoji]) {
                    message.reactions[data.emoji] = [];
                }
                if (!message.reactions[data.emoji].includes(data.from)) {
                    message.reactions[data.emoji].push(data.from);
                }


                if (data.channel === state.currentChannel) {
                    updateMessageReactions(data.id);
                }
                break;
            }
            case 'message_react_remove': {
                const message = state.messages[data.channel].find(m => m.id === data.id);
                if (!message || !message.reactions || !message.reactions[data.emoji]) break;

                const users = message.reactions[data.emoji];
                const idx = users.indexOf(data.from);
                if (idx > -1) users.splice(idx, 1);

                if (users.length === 0) {
                    delete message.reactions[data.emoji];
                }

                if (data.channel === state.currentChannel?.name) {
                    updateMessageReactions(data.id);
                }
                MessageBuilder.action({
                    icon: "close",
                    username: data.from,
                    action: "unreacted " + data.emoji + " in <strong>a_message</strong> in " + data.channel,
                    expiry: 5000
                })
                break;
            }
            case "auth_error":
            case "error":
                showError(data.val || data.message || "Unknown error");
                break;
            case "ping":
                break;
        }
    };
    ws.onerror = (e) => showError("WebSocket error");
    ws.onclose = () => setTimeout(connectWebSocket, 5000);
}

function showError(msg) {
    console.error(msg);
    say(msg, "failed");
}
function listChannels(channelList) {
    const result = [];

    for (const channel of channelList) {
        if (channel.type === "text") {
            result.push({
                id: channel.name || "",
                name: channel.name || "",
                desc: channel.description || "",
                unread: state.unread[channel.name] || 0,
                type: "text"
            });
        } else if (channel.type === "chat") {
            result.push({
                id: channel.name || "",
                name: channel.display_name || channel.name || "",
                desc: channel.description || "",
                icon: channel.icon || "",
                unread: state.unread[channel.name] || 0,
                type: "chat"
            });
        } else if (channel.type === "forum") {
            result.push({
                id: channel.name || "",
                name: channel.name || "thread",
                type: "forum",
                threads: channel.threads
            });
        } else if (channel.type === "voice") {
            result.push({
                id: channel.name || "",
                name: channel.name,
                type: "voice",
                voice_state: channel.voice_state
            });
        } else if (channel.type === "separator") {
            result.push({ type: "separator" });
        }
    }

    state.channelsArray = result;

    const channelsState = settings.get("channels_state") || {};
    const saved = channelsState[currentServer];

    let target = null;

    if (saved && result.some(c => c.name === saved || c.id === saved)) {
        target = saved;
    } else if (result.length) {
        target = result[0].name;
    }

    if (target) changeChannel(target);
}

function generateValidatorAndAuth(vKey, authTok) {
    return (async () => {
        const url = `https://social.rotur.dev/generate_validator?key=${encodeURIComponent(vKey)}&auth=${encodeURIComponent(authTok)}`;
        const resp = await fetch(url);
        const j = await resp.json();
        if (j.error) throw new Error(j.error);
        state.validator = j.validator;
        settings.set("validator", j.validator);
        ws.send(JSON.stringify({ cmd: "auth", validator: j.validator }));
    })();
}

function userRoles() {
    const u = state.user;
    if (!u) return [];
    return Array.isArray(u.roles)
        ? u.roles.map((r) => String(r).toLowerCase())
        : [];
}
function canSend(channelName) {
    const ch = state.channels[channelName];
    if (!ch) return true;
    if (ch.send === false) return false;
    if (ch.permissions && ch.permissions.send === false) return false;
    const roles = userRoles();
    if (
        Array.isArray(ch.denied_roles) &&
        ch.denied_roles.some((r) => roles.includes(String(r).toLowerCase()))
    )
        return false;
    if (Array.isArray(ch.allowed_roles) && ch.allowed_roles.length) {
        const allow = ch.allowed_roles.map((r) => String(r).toLowerCase());
        if (!roles.some((r) => allow.includes(r))) return false;
    }
    if (
        Array.isArray(ch.required_permissions) &&
        ch.required_permissions.includes("send") &&
        roles.length === 0
    )
        return false;
    return true;
}
function canView(channelName, userObj) {
    const ch = state.channels[channelName];
    if (!ch) return true;
    const required = ch.permissions?.view || ["user"]
    const roles = Array.isArray(userObj?.roles) ? userObj.roles.map(r => String(r).toLowerCase()) : [];
    for (let i = 0; i < required.length; i++) {
        if (roles.includes(required[i])) return true;
    }
    return false;
}

function resolveCustomEmojis(text, store = []) {
    return text.replace(
        /originChats:(?:<emoji>)?\/\/([^/\s<]+)\/([^<\s]+)/g,
        (_, sUrl, emojiId) => {
            const token = `__CEMOJI_${store.length}_${Math.random().toString(36).slice(2)}__`;
            store.push({ token, sUrl, emojiId });
            return token;
        }
    ).replace(
        /originChats:\/\/([^/\s]+)\/([^\s]+)/g,
        (_, sUrl, emojiId) => {
            const token = `__CEMOJI_${store.length}_${Math.random().toString(36).slice(2)}__`;
            store.push({ token, sUrl, emojiId });
            return token;
        }
    );
}

function customEmojiHTML(sUrl, emojiId) {
    const currentServer = state.server.url;
    const localSet = customEmojisByServer.value?.[currentServer];
    const localEmoji = localSet?.[emojiId];

    function toHttpBase(url) {
        return url
            .replace(/^wss:\/\//, "https://")
            .replace(/^ws:\/\//, "http://");
    }

    function cleanEmojiPath(id) {
        return String(id).replace(/^\/?emojis\/+/, "");
    }

    if (localEmoji) {
        const baseUrl = toHttpBase(currentServer);
        return `<img class="custom-emoji" src="${baseUrl}/emojis/${cleanEmojiPath(localEmoji.fileName)}" alt=":${localEmoji.name}:" title="${localEmoji.name}" loading="lazy">`;
    }

    const remoteBase = toHttpBase(`wss://${sUrl}`);
    return `<img class="custom-emoji custom-emoji-remote" data-surl="${sUrl}" data-emoji-id="${emojiId}" src="${remoteBase}/emojis/${cleanEmojiPath(emojiId)}" loading="lazy">`;
}

function renderCustomEmojis(text) {
    const store = [];
    let out = resolveCustomEmojis(text, store);

    for (const e of store) {
        out = out.replace(e.token, customEmojiHTML(e.sUrl, e.emojiId));
    }

    return out;
}
function formatMessageContent(raw) {
    if (typeof raw !== "string") raw = String(raw ?? "");

    raw = raw
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\r?\n/g, "<br>");

    const emojiRegex = /^\p{Extended_Pictographic}$/u;
    if (emojiRegex.test(raw)) {
        return `<span style="font-size:2em;line-height:1">${raw}</span>`;
    }

    const codeBlocks = [];
    const markdownLinks = [];
    const urlPlaceholders = [];
    let i = 0;

    raw = raw.replace(/```(\w+)?([\s\S]*?)```/g, (_, lang, code) => {
        const token = `__CODE_${i++}__`;
        codeBlocks.push({
            token,
            html: `<div><pre><code class="language-${lang || ""}">${stripHtml(code)}</code></pre></div>`
        });
        return token;
    });

    raw = raw.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, name, url) => {
        const token = `__MD_${markdownLinks.length}__`;
        markdownLinks.push({ token, name, url });
        return token;
    });

    raw = raw.replace(/(https?:\/\/[^\s"'<>]+)/g, url => {
        const token = `__URL_${urlPlaceholders.length}__`;
        urlPlaceholders.push({ token, url });
        return token;
    });

    raw = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    raw = raw.replace(/\*(.+?)\*/g, "<i>$1</i>");
    raw = raw.replace(/`([^`]+)`/g, "<kbd>$1</kbd>");
    raw = raw.replace(/__([^_]+)__/g, "<u>$1</u>");

    raw = raw.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    raw = raw.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    raw = raw.replace(/^# (.+)$/gm, "<h1>$1</h1>");

    raw = raw.replace(/@(\w+)/g, `<span class="mention" onclick="launchSideBarApp('profile',{name:'$1'})">@$1</span>`);
    raw = raw.replace(/#(\w+)/g, `<span class="mention" onclick="changeChannel('$1')">#$1</span>`);

    raw = renderCustomEmojis(raw);

    for (const b of codeBlocks) raw = raw.replace(b.token, b.html);

    for (const l of markdownLinks) {
        raw = raw.replace(
            l.token,
            `<a href="${encodeURI(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(l.name)}</a>`
        );
    }

    for (const u of urlPlaceholders) {
        raw = raw.replace(
            u.token,
            `<a href="${encodeURI(u.url)}" target="_blank" rel="noopener noreferrer">${encodeURI(u.url)}</a>`
        );
    }

    return raw;
}

function renderReplyExcerpt(message) {
    if (!message.reply_to) return "";
    let replyId = null;
    let hintedUser = "";
    if (typeof message.reply_to === "object") {
        replyId = message.reply_to.id || null;
        hintedUser = message.reply_to.user || "";
    }
    if (!replyId) return "";
    lastmsgid = null;
    const ref =
        message.reply_to_message ||
        state.messages[replyId] ||
        findMessageById(replyId);
    if (!ref) {
        if (hintedUser) {
            const color = getUserColor(hintedUser);
            return `<div class="reply-excerpt missing" data-ref="${escapeHTML(replyId)}"><div class="symb rplarrow"></div>Replying to <span class="reply-user" style="color:${color}">@${escapeHTML(hintedUser)}</span></div>`;
        }
        return `<div class="reply-excerpt missing" data-ref="${escapeHTML(replyId)}"><div class="rplarrow"></div>Replying to unknown message</div>`;
    }
    if (!state.messages[replyId]) state.messages[replyId] = ref;
    const preview = escapeHTML(stripHtml(ref.content || "").slice(0, 120));
    const colorRaw = getUserColor(ref.user || hintedUser || "");
    const color = colorRaw;
    const userShown = escapeHTML(ref.user || hintedUser || "unknown");
    return `<div class="reply-excerpt" data-ref="${escapeHTML(replyId)}"><div class="rplarrow"></div>
        <span class="reply-user" style="color:${color}">@${userShown}</span>
        <span class="reply-preview">${preview}</span>
    </div>`;
}

function findMessageById(id) {
    if (!id) return null;

    if (state.messages[id]) return state.messages[id];

    const msgNode = document.querySelector(`.msg[data-id="${CSS.escape(id)}"]`);
    if (!msgNode) return null;

    const userEl = msgNode.querySelector(".data .bold");
    const contentEl = msgNode.querySelector(".inline.p");

    const user = userEl?.textContent || "";
    const content = contentEl?.innerText || contentEl?.textContent || "";

    const ref = { id, user, content };

    state.messages[id] = ref;

    return ref;
}

function attemptResolveAllMissingReplies() {
    document
        .querySelectorAll(".reply-excerpt.missing[data-ref]")
        .forEach((el) => {
            const refId = el.getAttribute("data-ref");
            if (!refId) return;
            const ref = state.messages[refId] || findMessageById(refId);
            if (ref) {
                const color = getUserColor(ref.user || "");
                const preview = stripHtml(ref.content || "").slice(0, 120);
                el.classList.remove("missing");
                el.innerHTML = `<span class="reply-user" style="color:${color}">@${escapeHTML(ref.user)}</span><span class="reply-preview">${escapeHTML(preview)}</span>`;
            }
        });
}

function attemptResolveMissingRepliesFor(newId) {
    if (!newId) return;
    const waiting = document.querySelectorAll(
        `.reply-excerpt.missing[data-ref="${CSS.escape(newId)}"]`,
    );
    if (!waiting.length) return;
    const ref = state.messages[newId] || findMessageById(newId);
    if (!ref) return;
    const color = getUserColor(ref.user || "");
    const preview = escapeHTML(stripHtml(ref.content || "").slice(0, 120));
    waiting.forEach((el) => {
        el.classList.remove("missing");
        el.innerHTML = `<span class="reply-user" style="color:${color}">@${escapeHTML(ref.user)}</span><span class="reply-preview">${preview}</span>`;
    });
}
function updateChannelUnread(channelName) {
    const link = document.getElementById(`channel_${channelName}`);
    if (!link) return;
    const count = state.unread[channelName] || 0;
    let badge = link.querySelector(".badge");
    if (count <= 0) {
        if (badge) badge.remove();
        return;
    }
    if (!badge) {
        badge = document.createElement("span");
        badge.className = "badge";
        link.appendChild(badge);
    }
}

function renderMessage(message) {
    if (message && message.id) {
        const mid = message.id;
        state.messages[mid] = message;
        if (!message.id) message.id = mid;
    }

    const prevmsg = state.messages[lastmsgid] ?? null;
    lastmsgid = message.id;

    const self = message.user === state.user.username;
    const blocked = !self && (roturState.user["sys.blocked"] ?? []).includes(message.user);
    if (blocked && !state.show_blocked_msgs) return;

    const node = blocked ? renderBlocked(message, prevmsg) : renderVisible(message, prevmsg);

    return node;
}


var lastmsgid = null;
function renderVisible(message, prevmsg) {
    if (!message) return document.createElement('div');

    const timestamp = typeof message.timestamp === 'number' ? message.timestamp : Date.now() / 1000;
    const date = new Date(timestamp * 1000);

    const timeStr = date.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    const user = message.user ?? 'unknown';

    const avatar = `https://avatars.rotur.dev/${encodeURIComponent(user)}`;

    const content = message.content ?? '';
    const text = (typeof formatMessageContent === 'function' ? formatMessageContent(content) : content)
        + (message.edited ? ' <span class="edited-tag icon">edit</span>' : '');

    if (typeof MessageBuilder?.message !== 'function') {
        const fallback = document.createElement('div');
        fallback.textContent = text;
        return fallback;
    }

    const msgEl = MessageBuilder.message({
        avatar,
        username: user,
        timeStr,
        text,
        message,
        prevMessage: prevmsg
    });

    setTimeout(() => {
        if (typeof renderReactions === 'function') {
            renderReactions(message, msgEl);
        }
    }, 0);

    return msgEl;
}

function renderBlocked(message, prevmsg) {
    const div = document.createElement("div");
    const header = document.createElement("div");
    header.classList.add("blockedheader");

    const icon = document.createElement("span");
    icon.classList.add("icon");
    icon.textContent = "no_accounts";

    const text = document.createElement("span");
    text.textContent = "Blocked message —";

    const link = document.createElement("a");
    link.textContent = "Show";
    link.href = "#";

    let node;

    link.addEventListener("click", e => {
        e.preventDefault();
        if (node) {
            link.textContent = "Show";
            header.scrollIntoView();
            node.remove();
            node = undefined;
            return;
        }
        node = renderVisible(message, prevmsg);
        div.appendChild(node);
        link.textContent = "Hide";
        node.scrollIntoView();
    });

    header.append(icon, text, link);
    div.appendChild(header);
    return div;
}

const threshold = 20
let missedWhileScrolledUp = 0, busymissed = 0;
function shouldAutoScroll(el) {
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
    return atBottom
}

function addMessage(messagePacket) {
    const chatArea = document.getElementById("interactive_logs");

    if (state.currentChannel == messagePacket.channel) {
        const message = messagePacket.message;
        chatArea.appendChild(renderMessage(message));
        attemptResolveMissingRepliesFor(message.id);

        const atBottom = shouldAutoScroll(chatArea);
        state.scrollLocked = atBottom;

        if (atBottom) {
            setTimeout(() => {
                chatArea.scrollTop = chatArea.scrollHeight;
                state.scrollLocked = true;
            }, 200);

            missedWhileScrolledUp = 0;
            updateMissedIndicator(0);
        } else {
            state.scrollLocked = false;
            missedWhileScrolledUp++;
            updateMissedIndicator(missedWhileScrolledUp);
        }

        if (state.busy) {
            busymissed++;
            document.title = "Orla Client • " + busymissed + " New";
        }
    } else {
        const ch = messagePacket["channel"];
        if (ch) {
            state.unread[ch] = (state.unread[ch] || 0) + 1;
            updateChannelUnread(ch);
        }
    }
}

function handleScroll() {
    const chatArea = document.getElementById("interactive_logs");
    if (shouldAutoScroll(chatArea)) {
        missedWhileScrolledUp = 0
        updateMissedIndicator(0)
    }
}

document.getElementById("interactive_logs").addEventListener("scroll", handleScroll)

function updateMissedIndicator(count) {
    let ele = document.getElementById("missedmsgs");
    let eledad = ele.parentElement;
    if (count) {
        eledad.style.display = "flex";
        ele.innerText = count;
    } else {
        eledad.style.display = "none";
    }
}
let oldestLoadedMessage = null;
let loadingHistory = false;
let currentObserver = null;
let loadTriggerEl = null;
function makeLoadTrigger(channelName) {
    const t = document.createElement("div");
    t.style.height = "500px";

    if (currentObserver) currentObserver.disconnect();

    let seen = false;
    const io = new IntersectionObserver(e => {
        const v = e[0].isIntersecting;
        if (v && !seen && !t._deactivated && state.hasMoreMessages !== false) {
            seen = true;
            setTimeout(() => {
                if (seen && !t._deactivated) {
                    loadOlderMessages();
                }
            }, 300);
        }
        if (!v) seen = false;
    });

    io.observe(t);
    t._observer = io; 
    currentObserver = io;

    return t;
}

function filterNewMessages(messages) {
    return messages.filter(msg => {
        return !state.messages[msg.id];
    });
}

function clearMessageState() {
    state.messages = {};

    oldestLoadedMessage = null;
    state.hasMoreMessages = true;

    if (currentObserver) {
        currentObserver.disconnect();
        currentObserver = null;
    }

    if (loadTriggerEl) {
        loadTriggerEl.remove();
        loadTriggerEl = null;
    }

    const chatArea = document.getElementById("interactive_logs");

    if (chatArea) {
        chatArea.innerHTML = "";
    }

    lastmsgid = null;
}

function loadOlderMessages() {
    if (!oldestLoadedMessage) {
        console.log("[loadOlderMessages] No oldest message loaded yet");
        return;
    }
    if (loadingHistory) {
        console.log("[loadOlderMessages] Already loading history, skipping");
        return;
    }

    console.log("[loadOlderMessages] Loading older messages around:", oldestLoadedMessage.id);
    loadingHistory = true;

    ws.send(JSON.stringify({
        cmd: "messages_around",
        channel: state.currentChannel,
        around: oldestLoadedMessage.id,
        bounds: {
            above: 0,
            below: 20
        }
    }));
}
async function listMessages(messageList) {
    if (!messageList?.length) {
        console.log("[listMessages] Empty message list");
        loadingHistory = false;
        state.hasMoreMessages = false;
        return;
    }

    const fresh = filterNewMessages(messageList);
    console.log("[listMessages] Processing", fresh.length, "new messages out of", messageList.length);

    if (!fresh.length) {
        console.log("[listMessages] All messages were duplicates");
        loadingHistory = false;
        return;
    }

    const chatArea = document.getElementById("interactive_logs");

    const refEl = chatArea.querySelector(".msg");
    const refTop = refEl?.getBoundingClientRect().top;

    console.log("[listMessages] Anchoring to message, screen pos:", refTop);

    const frag = document.createDocumentFragment();

    const oldTrigger = chatArea.querySelector(".load-trigger");
    if (oldTrigger) oldTrigger.remove();

    const trigger = makeLoadTrigger(state.currentChannel);
    trigger.className = "load-trigger";
    loadTriggerEl = trigger;
    frag.appendChild(trigger);

    for (const msg of fresh) {
        state.messages[msg.id] = msg;

        const node = renderMessage(msg);
        if (node) frag.appendChild(node);
    }

    const first = chatArea.firstChild;

    if (first) {
        chatArea.insertBefore(frag, first);
    } else {
        chatArea.appendChild(frag);
    }

    if (fresh.length) {
        oldestLoadedMessage = fresh[0];
    }

    if (refEl && refTop != null) {
        requestAnimationFrame(() => {
            const newRefTop = refEl.getBoundingClientRect().top;
            const diff = newRefTop - refTop;

            console.log("[listMessages] Scroll adjustment:", {
                refTop,
                newRefTop,
                diff,
                before: chatArea.scrollTop
            });

            chatArea.scrollTop += diff;

            console.log("[listMessages] After adjustment:", {
                scrollTop: chatArea.scrollTop
            });
        });
    }

    loadingHistory = false;
    attemptResolveAllMissingReplies();
}
async function changeServer(x) {
    currentServer = x;

    const channelsState = settings.get("channels_state") || {};
    const savedChannel = channelsState[currentServer];

    clearMessageState();

    try {
        ws.close();
    } catch (e) { }

    greenflag();

    const openSavedOrFirst = () => {
        const target =
            savedChannel &&
                state.channelsArray?.some(c => c.name === savedChannel)
                ? savedChannel
                : state.channelsArray?.[0]?.name;

        if (target) {
            changeChannel(target);
        }
    };

    const state = new Proxy({ channelsArray: [] }, {
        set(target, prop, value) {
            target[prop] = value;
            if (prop === 'channelsArray' && value?.length) {
                openSavedOrFirst();
            }
            return true;
        }
    });
}
function changeChannel(channel) {
    clearMessageState();

    const found = state.channelsArray.find(c => c.name === channel || c.id === channel);
    if (found?.type === "chat") {
        channel = found.id
    }

    state.currentChannel = channel;

    const channelsState = settings.get("channels_state") || {};
    channelsState[currentServer] = channel;
    settings.set("channels_state", channelsState);

    document.querySelectorAll(".single_chnl").forEach((el) => {
        el.classList.toggle("active", el.id === `channel_${channel}`);
    });

    const ch = state.channelsArray.find(c => c.name === channel);

    if (ch.type != "forum") {
        document.getElementById("logspane").appendChild(
            MessageBuilder.action({
                icon: "notifications_active",
                action: ch ? ch.desc : "Listening to " + channel,
                time: ""
            })
        );
    }

    if (state.unread[channel]) {
        state.unread[channel] = 0;
        updateChannelUnread(channel);
    }

    updatemainTxtArPermissions();
    renderMembers();

    setTimeout(() => {
        const chatArea = document.getElementById("interactive_logs");
        chatArea.scrollTop = chatArea.scrollHeight;
    }, 500);
}
function getUserColor(username) {
    const u = state?.users?.[username];
    const hex = u?.color || "#ffffff";
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
        h = 0;
        s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return `hsl(${Math.round(h)}, ${Math.round(s * 80)}%, ${Math.round(l * 100)}%)`;
}


function renderMembers() {
    Object.entries(state.users).forEach(([name, user]) => {
        const row = document.createElement("div")
        row.style.marginBottom = "8px"
        const result = toFormattedString({ name, ...user })
        const lines = Array.isArray(result) ? result : result ? [result] : []
        lines.forEach(line => row.appendChild(line))
        pane.appendChild(row)
    })
}

function updatemainTxtArPermissions() {
    const input = document.getElementById("mainTxtAr");
    if (!input) return;
    if (!canSend(state.currentChannel)) {
        input.disabled = true;
        input.placeholder = "Unable to message here";
        hidereplyPrompt();
    } else {
        input.disabled = false;
        input.placeholder = `Message #${state.currentChannel}`;
    }
}

updatemainTxtArPermissions();

function updateUserPanel() {
    const avatar = document.getElementById("userAvatar");
    const nameLabel = document.getElementById("usernameLabel");
    if (state.user) {
        const uname = extractUsername(state.user);
        if (avatar)
            avatar.src = `https://avatars.rotur.dev/${encodeURIComponent(uname)}`;
        if (nameLabel) nameLabel.textContent = uname;
    } else {
        if (nameLabel) nameLabel.textContent = "Not logged in";
        if (avatar) avatar.src = "assets/unknown.png";
    }
}

function showreplyPrompt(msg) {
    msg = state.messages[msg];
    document.querySelectorAll('.replyingto').forEach(el => el.classList.remove('replyingto'))
    const banner = document.getElementById("replyPrompt");
    if (!banner) return;
    if (!canSend(state.currentChannel)) return;
    if (state.editing) cancelEdit();
    state.reply_to[state.currentChannel] = msg;
    document.body.querySelector(`.msg[data-id="${msg.id}"]`).classList.add("replyingto");
    banner.classList.remove("hidden");
    const uname =
        msg.user || (typeof msg === "object" && msg.username) || "unknown";
    banner.innerHTML = `<span>Replying to <span id="replyun">${escapeHTML(uname)}</span>
                    </span><span class="icon" id="cancelReplyBtn">close</span>`;
    document.getElementById("cancelReplyBtn").onclick = () => {
        state.reply_to[state.currentChannel] = null;
        hidereplyPrompt(msg);
    };
}
function hidereplyPrompt() {
    const banner = document.getElementById("replyPrompt");
    if (banner) {
        banner.classList.add("hidden");
        banner.innerHTML = "";
    }
    document.querySelectorAll('.replyingto').forEach(el => el.classList.remove('replyingto'))
}

function formatTyping(users) {
    if (users.length === 1) {
        const u = users[0];
        return `${u.user} is typing (${u.elapsed}s)`;
    }

    if (users.length === 2) {
        return `${users[0].user} (${users[0].elapsed}s) and ${users[1].user} (${users[1].elapsed}s) are typing`;
    }

    const first = users[0];
    const rest = users.length - 1;
    return `${first.user} (${first.elapsed}s) and ${rest} others are typing`;
}
let dotState = 0;

function getDots() {
    dotState = (dotState + 1) % 3;
    return ".".repeat(dotState + 1);
}
function updateTypingIndicator() {
    const container = document.getElementById("typing-indicator");
    const typingMap = state.typingUsers[state.currentChannel];

    if (!typingMap || typingMap.size === 0) {
        container.textContent = "";
        return;
    }

    const now = Date.now();

    const activeUsers = Array.from(typingMap.entries())
        .filter(([_, v]) => v.expireAt > now)
        .map(([user, v]) => ({
            user,
            elapsed: Math.floor((now - v.startedAt) / 1000),
            startedAt: v.startedAt
        }))
        .sort((a, b) => a.startedAt - b.startedAt);

    if (activeUsers.length === 0) {
        container.textContent = "";
        return;
    }

    const text = formatTyping(activeUsers);
    container.textContent = text + getDots();
}
function sendTyping() {
    if (!settings.get("send_typing"))
        ws.send(JSON.stringify({ cmd: 'typing', channel: state.currentChannel }));
}

function greenflag() {
    connectWebSocket();
    setInterval(updateTypingIndicator, 1000);
}

function renderReactions(msg, container) {
    const reactions = msg.reactions;
    if (!reactions || Object.keys(reactions).length === 0) return;

    const reactionsDiv = document.createElement("div");
    reactionsDiv.className = "message-reactions";

    reactionsDiv.dataset.messageId = msg.id;

    for (const [rawEmoji, users] of Object.entries(reactions)) {
        const count = users.length;
        if (!count) continue;

        const emoji = renderCustomEmojis(rawEmoji);
        const hasReacted = users.includes(state.currentUser?.username);

        const reactionEl = document.createElement("span");
        reactionEl.className = "reaction" + (hasReacted ? " super" : "");
        reactionEl.setAttribute("data-emoji", rawEmoji);
        reactionEl.setAttribute("data-tooltip", users.join(", "));

        reactionEl.innerHTML =
            `[<span class="reaction-emoji">${emoji}</span>
<span class="reaction-count">${count}</span>]`;

        reactionsDiv.appendChild(reactionEl);
    }

    reactionsDiv.addEventListener("click", (e) => {
        e.stopPropagation();

        const el = e.target.closest(".reaction");
        if (!el) return;

        const emoji = el.dataset.emoji;
        const msgId = reactionsDiv.dataset.messageId;

        toggleReaction(msgId, emoji);
    });

    container.appendChild(reactionsDiv);
}

function updateMessageReactions(msgId) {
    const wrapper = document.querySelector(`[data-id="${msgId}"]`);
    if (!wrapper) return;

    const msg = state.messages[msgId];
    if (!msg) return;

    const groupContent = wrapper.querySelector('.data');
    if (groupContent) {
        renderReactions(msg, groupContent);
    }
}

function notify(text) {
    document.getElementById("logspane").appendChild(
        MessageBuilder.action({
            icon: "check",
            username: "",
            action: text,
            time: ""
        })
    )
}

function say(text) {
    notify(text)
}

function listInPane(messageList) {
    if (!messageList.length) return;

    console.log("rendering messgaes", messageList)
    state.additionalMessageLoad = false;
    const chatArea = document.getElementById("listspane");
    for (const message of messageList) {
        const msgEl = renderVisible(message)
        msgEl.addEventListener("click", () => {
            jumpToMessage(message.id)
        })

        if (msgEl) chatArea.appendChild(msgEl);
    }
}

function initialServerLoad() {
    if (settings.get("currentServer")) {
        currentServer = settings.get("currentServer");
    } else {
        settings.set("currentServer", "wss://dms.mistium.com");
        currentServer = settings.get("currentServer");
    }
    changeServer(currentServer);
}

function updateBusy() {
    state.busy = document.hidden
    if (!state.busy) {
        busymissed = 0;
        document.title = "Orla Client";
    }
}
document.addEventListener("visibilitychange", updateBusy)

window.addEventListener("blur", () => {
    state.wasScrollLockedBeforeBlur = state.scrollLocked

    if (state.scrollLocked) {
        const chatArea = document.getElementById("interactive_logs")
        chatArea.scrollTop = chatArea.scrollHeight
    }

    state.busy = true
})

window.addEventListener("focus", () => {
    updateBusy()

    if (state.wasScrollLockedBeforeBlur) {
        const chatArea = document.getElementById("interactive_logs")
        chatArea.scrollTop = chatArea.scrollHeight
        state.scrollLocked = true
    }
})

updateBusy()

function editMessage(mid) {
    const node = document.querySelector(`.msg[data-id="${CSS.escape(mid)}"]`);
    if (!node) return;

    node.classList.add("editing");
    state.editing = { id: mid };

    const textEl = node.querySelector(".contains_text>div");
    if (!textEl) return;

    textEl.style.display = "none";

    const textarea = document.createElement("textarea");
    textarea.value = state.messages[mid].content;
    textarea.className = "edit_area";

    textEl.insertAdjacentElement("afterend", textarea);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    function cleanup(save) {
        if (save) {
            const val = textarea.value;
            if (val != state.messages[mid].content) {
                state.messages[mid].content = val;
                textEl.textContent = val;
                node.classList.add("pulse");
                ws.send(JSON.stringify({ cmd: "message_edit", channel: state._currentChannel, id: mid, content: val }));
            }
        }
        textarea.remove();
        textEl.style.display = "";
        node.classList.remove("editing");
        state.editing = null;
    }

    textarea.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            cleanup(false);
        } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            cleanup(true);
        }
    });
}

function jumpToHistory(messageId) {
    console.log("[jumpToHistory] Jumping to message:", messageId);
    clearMessageState();

    ws.send(JSON.stringify({
        cmd: "messages_around",
        channel: state.currentChannel,
        around: messageId,
        bounds: {
            above: 50,
            below: 50
        }
    }));

    state.pendingJumpTarget = messageId;
}

function handleMessagesAround(data) {
    loadingHistory = false;
    const messages = (data.messages || []).filter(msg => !state.messages[msg.id]);
    if (!messages.length) {
        console.log("[handleMessagesAround] Empty message list received");
        return;
    }

    const isJump = !!state.pendingJumpTarget;
    console.log("[handleMessagesAround] Received", messages.length, "messages, isJump:", isJump);

    const chatArea = document.getElementById("interactive_logs");

    if (isJump) {
        chatArea.innerHTML = "";
    }

    const frag = document.createDocumentFragment();

    for (const msg of messages) {
        state.messages[msg.id] = msg;
        const node = renderMessage(msg);
        if (node) frag.appendChild(node);
    }

    if (isJump) {
        console.log("[handleMessagesAround] Jump mode: clearing and appending messages");
        chatArea.appendChild(frag);
    } else {
        const oldTrigger = chatArea.querySelector(".load-trigger");

        if (oldTrigger) {
            oldTrigger._deactivated = true;
            if (oldTrigger._observer) oldTrigger._observer.disconnect();
        }

        const refEl = oldTrigger;
        const scrollTopBefore = chatArea.scrollTop;
        const offsetTopBefore = refEl ? refEl.offsetTop : null;

        const first = chatArea.firstChild;
        if (first) {
            chatArea.insertBefore(frag, first);
        } else {
            chatArea.appendChild(frag);
        }

        const trigger2 = makeLoadTrigger(state.currentChannel);
        trigger2.className = "load-trigger";
        loadTriggerEl = trigger2;
        chatArea.insertBefore(trigger2, chatArea.firstChild);

        if (refEl && offsetTopBefore !== null) {
            const diff = refEl.offsetTop - offsetTopBefore;
            console.log("[handleMessagesAround] Scroll-up adjustment:", diff, "px");
            chatArea.scrollTop = scrollTopBefore + diff;
        } else {
            console.log("[handleMessagesAround] No valid anchor message found, not adjusting scroll");
        }

        if (oldTrigger) oldTrigger.remove();
    }

    if (messages.length) {
        oldestLoadedMessage = messages[0];
    }

    if (!messages.length || data.range?.start === 0) {
        state.hasMoreMessages = false;
    }

    if (isJump) {
        requestAnimationFrame(() => {
            if (state.pendingJumpTarget) {
                console.log("[handleMessagesAround] Executing jump to message:", state.pendingJumpTarget);
                jumpToMessage(state.pendingJumpTarget);
                state.pendingJumpTarget = null;
            }
        });
    }
}
function jumpToMessage(id) {
    const el = document.querySelector(
        `[data-id="${CSS.escape(id)}"]`
    );

    if (!el) {
        jumpToHistory(id);
        return;
    }

    const container =
        document.getElementById("interactive_logs");

    const containerRect =
        container.getBoundingClientRect();

    const elRect =
        el.getBoundingClientRect();

    const top =
        container.scrollTop +
        (elRect.top - containerRect.top) -
        (container.clientHeight / 2) +
        (elRect.height / 2);

    container.scrollTo({
        top,
        behavior: "smooth"
    });

    el.classList.add("pulseh");
    setTimeout(() => el.classList.remove("pulseh"), 3000);
}
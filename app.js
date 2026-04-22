const customEmojisByServer = new Map();
let ws = null;

let state = {
    _currentChannel: "cmds",
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
    set currentChannel(value) {
        this._currentChannel = value;
        const ch = this.channelsArray.find(c => c.name === value);

        if (ws?.readyState === 1) {
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
            } else {
                ws.send(JSON.stringify({
                    cmd: "messages_get",
                    channel: value,
                }));
            }
        }
    },
    get currentChannel() {
        return this._currentChannel;
    },
    typingUsers: {},
    additionalMessageLoad: false,
    _embedCache: {},
    get settings() {
        return settings.get()
    }
};

let emojis;

userKeysUpdate();
const membersList = document.querySelector(".members_list");

document.getElementById("memberlistbtn")?.addEventListener("click", () => {
    membersList.style.display =
        membersList.style.display === "none" ? "" : "none";
});
function userKeysUpdate() {
    // state.user_keys = roturExtension.user ?? {};
}

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
        console.log("WS", data);
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
                ws.send(JSON.stringify({ cmd: "users_list" }));
                ws.send(JSON.stringify({ cmd: "users_online" }));
                ws.send(
                    JSON.stringify({
                        cmd: "messages_get",
                        channel: state.currentChannel,
                        limit: 100
                    }),
                );
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
                const node = document.querySelector(
                    `.message[data-id="${CSS.escape(data.id)}"] .content`,
                );
                if (node)
                    node.innerHTML =
                        formatMessageContent(data.content) +
                        '<span class="edited-tag">(edited)</span>';
                if (state.editing && state.editing.id === mid) cancelEdit();

                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "edit",
                        username: data.message.user,
                        action: "edited a message"
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
                            time: ""
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
                            time: ""
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
                            time: ""
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
                        time: ""
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
                break;
            }
            case "emoji_get_all": {
                const map = {};

                for (const [id, emoji] of Object.entries(msg.emojis || {})) {
                    map[id] = {
                        name: emoji.name,
                        fileName: emoji.fileName
                    };
                }

                customEmojisByServer.set("chats.mistium.com", map);
                break
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
    ws.onclose = () => console.log("WebSocket closed");
}

function showError(msg) {
    console.error(msg);
    say(msg, "failed");
}
function listChannels(channelList) {
    const result = []

    for (const channel of channelList) {
        if (channel.type === "text") {
            result.push({
                id: channel.name || "",
                name: channel.name || "",
                desc: channel.description || "",
                unread: state.unread[channel.name] || 0,
                type: "text"
            })
        } else if (channel.type === "chat") {
            result.push({
                id: channel.name || "",
                name: channel.display_name || channel.name || "",
                desc: channel.description || "",
                unread: state.unread[channel.name] || 0,
                type: "chat"
            })
        } else if (channel.type === "forum") {
            result.push({
                id: channel.name || "",
                name: channel.name || "thread",
                type: "forum",
                threads: channel.threads
            })
        } else if (channel.type === "separator") {
            result.push({ type: "separator" })
        }
    }

    state.channelsArray = result
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
    if (!state.messages[replyId]) state.messages[replyId] = ref; // ensure cached
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
        + (message.edited ? ' (edited)' : '');

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

const threshold = 100
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

let loadedCount = 0;
let currentObserver = null;
function makeLoadTrigger(channelName, limit) {
    const channel = state.channelsArray.find(c => c.name === channelName);
    console.log(327, channel, channelName)
    const t = document.createElement("div");
    t.style.height = "1px";

    if (currentObserver) currentObserver.disconnect();

    let seen = false;
    const io = new IntersectionObserver(e => {
        const v = e[0].isIntersecting;
        if (v && !seen) {
            seen = true;
            setTimeout(() => {
                if (seen) {
                    console.log("rendering 888", channel)
                    ws.send(JSON.stringify({
                        cmd: "messages_get",
                        channel: channelName,
                        limit,
                        start: loadedCount
                    }));
                }
            }, 300);
        }
        if (!v) seen = false;
    });

    io.observe(t);
    currentObserver = io;

    return t;
}
function listMessages(messageList, channel = state._currentChannel, limit = 100) {
    if (!messageList?.length) return;

    const chatArea = document.getElementById("interactive_logs");
    if (!chatArea) return;

    loader.hide();

    const prev = chatArea.scrollHeight;

    const frag = document.createDocumentFragment();

    if (state.hasMoreMessages === true) {
        frag.appendChild(makeLoadTrigger(channel, limit));
    }

    for (const m of messageList) {
        const n = renderMessage(m);
        if (n) frag.appendChild(n);
    }

    const first = chatArea.firstChild;
    if (first) chatArea.insertBefore(frag, first);
    else chatArea.appendChild(frag);

    requestAnimationFrame(() => {
        const next = chatArea.scrollHeight;
        chatArea.scrollTop += next - prev;
    });

    loadedCount += messageList.length;

    attemptResolveAllMissingReplies();
}
async function changeServer(x) {
    currentServer = x;
    settings.set("currentServer", currentServer);

    const channelsState = settings.get("channels_state") || {};
    const savedChannel = channelsState[currentServer];

    const chatArea = document.getElementById("interactive_logs");
    chatArea.innerHTML = "";

    ws.close();
    greenflag();

    const openSavedOrFirst = () => {
        const target =
            savedChannel &&
                state.channelsArray?.some(c => c.name === savedChannel)
                ? savedChannel
                : state.channelsArray?.[0]?.name;

        if (target) changeChannel(target);
    };

    if (state.channelsArray?.length) {
        openSavedOrFirst();
    } else {
        const wait = setInterval(() => {
            if (state.channelsArray?.length) {
                clearInterval(wait);
                openSavedOrFirst();
            }
        }, 100);
    }
}

function changeChannel(channel) {
    loadedCount = 0;
    if (currentObserver) currentObserver.disconnect();
    lastmsgid = null;
    additionalMessageLoad = false;

    const found = state.channelsArray.find(c => c?.name === channel)

    if (found?.type === "chat") {
        channel = found.id
    }

    const chatArea = document.getElementById("interactive_logs");
    chatArea.innerHTML = "";
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
    const root = document.getElementsByClassName("members_lists")[0];
    if (!root) return;
    root.innerHTML = "";

    const owners = [];
    const online = [];
    const offline = [];
    const isOwner = (u) =>
        Array.isArray(u?.roles) &&
        u.roles.some((r) => String(r).toLowerCase() === "owner");

    for (const uname in state.users) {
        const u = state.users[uname];
        if (!u) continue;
        if (!canView(state.currentChannel, u)) continue;
        const isOn = !!state.online_users[uname];
        if (isOwner(u) && isOn) owners.push(u);
        else if (isOn) online.push(u);
        else offline.push(u);
    }

    const sortUsers = (arr) =>
        arr.sort((a, b) =>
            (a.displayName || a.username).localeCompare(b.displayName || b.username),
        );
    sortUsers(owners);
    sortUsers(online);
    sortUsers(offline);

    const section = (title, list, opts = {}) => {
        if (!list.length) return;
        const titleEl = document.createElement("div");
        titleEl.className = "sublist_title";
        titleEl.textContent = `${title.toUpperCase()} - ${list.length}`;
        root.appendChild(titleEl);
        for (const u of list) {
            const uname = u.username;
            const entry = document.createElement("div");
            entry.onclick = () => {
                launchSideBarApp("profile", { name: uname })
            }
            entry.className = "profile_card" + (opts.offline ? " offline" : "");
            const color = getUserColor(uname);
            const disp = escapeHTML(u.displayName || uname);
            entry.innerHTML = `
        <img src="https://avatars.rotur.dev/${encodeURIComponent(uname)}" alt="${disp}" class="pfp">
         <div class="data">
                            <div class="name" style="color:${color}">${disp} ${isOwner(u) ? '<span class="role-pill symb" title="Owner">crown</span>' : ""}</div>
                        </div>
        <span</span>
        
            `;
            root.appendChild(entry);
        }
    };

    section("Owner", owners);
    section("Online", online);
    section("Offline", offline, { offline: true });
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

    document.querySelectorAll('.replyingto').forEach(el => el.classList.remove('replyingto'))
    const banner = document.getElementById("replyPrompt");
    if (!banner) return;
    if (!canSend(state.currentChannel)) return;
    if (state.editing) cancelEdit();
    document.body.querySelector(`[data-id="${msg.id}"]`).classList.add("replyingto");
    banner.classList.remove("hidden");
    const uname =
        msg.user || (typeof msg === "object" && msg.username) || "unknown";
    banner.innerHTML = `<div>Replying to <div id="replyun">${escapeHTML(uname)}</div>
                    </div><div class="clsbtn symb" id="cancelReplyBtn">close</div>`;
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

    for (const [rawEmoji, users] of Object.entries(reactions)) {
        const count = users.length;
        if (!count) continue;

        const emoji = renderCustomEmojis(rawEmoji);
        const hasReacted = users.includes(state.currentUser?.username);

        const reactionEl = document.createElement("span");
        reactionEl.className = "reaction" + (hasReacted ? " super" : "");
        reactionEl.setAttribute("data-tooltip", users.join(", "));
        reactionEl.innerHTML = `
[<span class="reaction-emoji">${emoji}</span>
<span class="reaction-count">${count}</span>]
`;

        reactionEl.addEventListener("click", e => {
            e.stopPropagation();
            toggleReaction(msg.id, rawEmoji);
        });

        reactionsDiv.appendChild(reactionEl);
    }

    container.appendChild(reactionsDiv);
}

function updateMessageReactions(msgId) {
    const wrapper = document.querySelector(`[data-id="${msgId}"]`);
    if (!wrapper) return;

    const msg = state.messages[msgId];
    if (!msg) return;

    console.log("UPDATE MSG REA");

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
        if (msgEl) chatArea.appendChild(msgEl);
    }
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
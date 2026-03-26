if (localStorage.getItem("currentServer")) {
    currentServer = localStorage.getItem("currentServer");
} else {
    localStorage.setItem("currentServer", "wss://chats.mistium.com");
    currentServer = localStorage.getItem("currentServer");
}

let state = {
    _currentChannel: "general",
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
    set currentChannel(value) {
        this._currentChannel = value;
        lazier.start();

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
    _embedCache: {}
};

let emojis;

userKeysUpdate();
let ws = null;
const membersList = document.querySelector(".members_list");

document.getElementById("memberlistbtn")?.addEventListener("click", () => {
    membersList.style.display =
        membersList.style.display === "none" ? "" : "none";
});
function userKeysUpdate() {
    state.user_keys = roturExtension.user ?? {};
}

function connectWebSocket() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    try { if (ws && ws.readyState === 1) ws.close(); } catch { }
    ws = new WebSocket(currentServer);
    attachWsHandlers();
}

function escapeHTML(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// function replaceEmojis(str) {
//     for (const emoji of emojis)
//         str = str.replaceAll(":" + emoji.label.replaceAll(" ", "_") + ":", emoji.emoji);

//     return str;
// }

function roturToken() {
    return roturExtension.userToken;
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
                    .getElementById("currentServerIcon")
                    ?.setAttribute("src", state.server.icon || "");
                const sName = state.server.name || state.server.title || "Server";
                const headert = document.getElementById("serverHeaderName");
                if (headert) headert.textContent = sName;
                const sIcon = state.server.icon;
                const headerimg = document.getElementById("serverHeaderIcon");
                if (headerimg) headerimg.src = sIcon;
                const sURL = state.server.url;
                const headerurl = document.getElementById("serverHeaderURL");
                if (headerurl) headerurl.textContent = sURL;
                const authTok = roturToken();
                console.log(67, authTok, vKey)
                if (authTok && vKey) {
                    try {
                        console.log(67, authTok, vKey)
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
                    input.addEventListener('input', function () {
                        this.style.height = 'auto';
                        this.style.height = Math.min(this.scrollHeight - 20, 300) + 'px';
                    });

                    input.addEventListener("keydown", (ev) => {
                        if (ev.key === "Enter" && !ev.shiftKey) {
                            const payload = {
                                cmd: "message_new",
                                content: (input.value),
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
            case "thread_messages":
                if (data.messages) listMessages(data.messages);
                break;
            case "message_new":
                addMessage(data);
                handleMessageNotification(data);
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
                        `.message[data-id="${CSS.escape(mid)}"]`,
                    );
                    if (node) {
                        node.style.color = "red";
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

                if (channel === state.currentChannel) {
                    document.getElementById("logspane").appendChild(
                        MessageBuilder.action({
                            icon: "keyboard_keys",
                            username: user,
                            action: "is typing...",
                            time: ""
                        })
                    )
                    const typingMap = state.typingUsers[channel];

                    const expireAt = Date.now() + 5000;
                    typingMap.set(user, expireAt);

                    updateTypingIndicator();

                    setTimeout(() => {
                        if (typingMap.get(user) <= Date.now()) {
                            typingMap.delete(user);
                            state.typingUsers[channel] = typingMap;
                            updateTypingIndicator();
                        }
                    }, 5000);
                } else {
                    document.getElementById("logspane").appendChild(
                        MessageBuilder.action({
                            icon: "keyboard_keys",
                            username: user,
                            action: "is typing in #" + channel,
                            time: ""
                        })
                    )
                }


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
            case "auth_error":
            case "error":
                showError(data.val || data.message || "Unknown error");
                break;
            case "ping":
                break;
            default:
                say("Unhandled", data);
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
    const result = [];

    for (let channel of channelList) {
        if (channel.type === "text") {
            result.push({
                name: channel.name || "",
                desc: channel.description || "",
                unread: state.unread[channel.name] || 0,
                active: channel.name === state.currentChannel
            });
        } else if (channel.type === "forum") {
            result.push({
                name: channel.name || "thread",
                type: channel.type,
                threads: channel.threads
            });
        } else if (channel.type === "separator") {
            result.push({ type: "separator" });
        }
    }

    state.channelsArray = result;
}


function generateValidatorAndAuth(vKey, authTok) {
    return (async () => {
        const url = `https://social.rotur.dev/generate_validator?key=${encodeURIComponent(vKey)}&auth=${encodeURIComponent(authTok)}`;
        const resp = await fetch(url);
        const j = await resp.json();
        if (j.error) throw new Error(j.error);
        state.validator = j.validator;
        localStorage.setItem("validator", j.validator);
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

function extractUsername(u) {
    if (!u) return "";
    if (typeof u === "string") return u;
    if (typeof u === "object") {
        return (
            u.username || u.name || u.displayName || u.user || u.id || "[unknown]"
        );
    }
    return String(u);
}

function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
}

function formatMessageContent(raw) {
    if (typeof raw !== "string") raw = String(raw ?? "");
    // raw = replaceEmojis(raw);

    const emojiRegex = /^\p{Extended_Pictographic}$/u;
    if (emojiRegex.test(raw)) return `<span style="font-size:2em;line-height:1">${raw}</span>`;

    const codeBlockRegex = /```(\w+)?([\s\S]*?)```/g;
    const codeBlocks = [];
    let i = 0;

    raw = raw.replace(codeBlockRegex, (_, lang, code) => {
        const token = `__CDBLK_${i}__`;
        codeBlocks.push({
            token,
            html: `<div><pre><code class="language-${lang}">${escapeHTML(code)}</code></pre></div>`
        });
        i++;
        return token;
    });

    const inlineFormats = [
        { r: /\*\*(.+?)\*\*/g, t: "<b>$1</b>" },
        { r: /\*(.+?)\*/g, t: "<i>$1</i>" },
        { r: /`([^`]+)`/g, t: "<kbd>$1</kbd>" },
        { r: /__([^_]+)__/g, t: "<u>$1</u>" }
    ];
    inlineFormats.forEach(f => raw = raw.replace(f.r, f.t));

    const headingRegex = [
        { r: /^# (.+)$/gm, t: "<h1>$1</h1>" },
        { r: /^## (.+)$/gm, t: "<h2>$1</h2>" },
        { r: /^### (.+)$/gm, t: "<h3>$1</h3>" },
        { r: /^-# (.+)$/gm, t: "<div style=\"font-size:0.8em;font-weight:bold\">$1</div>" }
    ];
    headingRegex.forEach(f => raw = raw.replace(f.r, f.t));

    raw = raw.replace(/@(\w+)/g, `<span class="mention" onclick="launchSideBarApp('profile',{name:'$1'})">@$1</span>`);
    raw = raw.replace(/#(\w+)/g, `<span class="mention" onclick="changeChannel('$1')">#$1</span>`);

    const urlRegex = /(https?:\/\/[^\s]+)/g;

    let out = "";
    let last = 0;
    let m;
    const checks = [];

    function tryConvertToImage(a, url) {
        fetch(url, { method: "HEAD" })
            .then(r => {
                const t = r.headers.get("content-type") || "";
                if (!t.startsWith("image/")) return;

                const img = document.createElement("img");
                img.src = proxyImageUrl(url);
                img.className = "message-image";
                img.loading = "lazy";
                img.onclick = () => window.openImageModal && window.openImageModal(url);

                a.replaceWith(img);
            })
            .catch(() => { });
    }

    while ((m = urlRegex.exec(raw))) {
        const url = m[0];
        const idx = m.index;

        if (idx > last) out += raw.slice(last, idx);

        const safe = encodeURI(url);
        const id = "url_" + Math.random().toString(36).slice(2);

        out += `<a id="${id}" href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
        checks.push({ id, url });

        last = idx + url.length;
    }

    if (last < raw.length) out += raw.slice(last);

    out = out.replace(/\r?\n/g, "<br>");

    codeBlocks.forEach(b => out = out.replace(b.token, b.html));

    setTimeout(() => {
        checks.forEach(c => {
            const a = document.getElementById(c.id);
            if (a) tryConvertToImage(a, c.url);
        });
    });

    return out;
}
function escapeHTML(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
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
    const msgNode = document.querySelector(
        `.message[data-id="${CSS.escape(id)}"]`,
    );
    if (msgNode) {
        const user =
            msgNode.getAttribute("data-user") ||
            msgNode.querySelector(".meta strong")?.textContent ||
            "";
        const contentEl = msgNode.querySelector(".content");
        const content = contentEl?.innerText || contentEl?.textContent || "";
        return { id, user, content };
    }
    return null;
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
    const blocked = !self && (state.user_keys["sys.blocked"] ?? []).includes(message.user);
    if (blocked && !state.show_blocked_msgs) return;

    const node = blocked ? renderBlocked(message, prevmsg) : renderVisible(message, prevmsg);

    // if (!blocked) detectEmbeds(node, message.content || "");

    return node;
}


var lastmsgid = null;
function renderVisible(message, prevmsg) {
    const date = new Date(message.timestamp * 1000);
    const timeStr = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const avatar = `https://avatars.rotur.dev/${encodeURIComponent(message.user)}`;
    const text = formatMessageContent(message.content) + (message.edited ? " (edited)" : "");

    const msgEl = MessageBuilder.message({
        avatar,
        username: message.user,
        time: timeStr,
        text,
        message
    });
    setTimeout(() => renderReactions(message, msgEl), 0);

    // msgEl.appendChild(buildActions(message));
    return msgEl;
}

function renderBlocked(message, prevmsg) {
    const div = document.createElement("div");
    const header = document.createElement("div");
    header.classList.add("blockedheader");

    const icon = document.createElement("span");
    icon.classList.add("symb");
    icon.textContent = "block";

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

function buildActions(message) {
    // const wrap = document.createElement("div");
    // wrap.className = "msg_actions";

    // const reply = document.createElement("a");
    // reply.textContent = "reply";
    // reply.onclick = () => {
    //     if (state.editing) cancelEdit();
    //     state.reply_to[state.currentChannel] = message;
    //     if (canSend(state.currentChannel)) showreplyPrompt(message);
    // };

    // wrap.appendChild(reply);

    // if (message.user === state.user.username) {
    //     const del = document.createElement("a");
    //     del.textContent = "delete";
    //     del.onclick = () => ws.send(JSON.stringify({ cmd: "message_delete", channel: state.currentChannel, id: message.id }));
    //     wrap.appendChild(del);
    // }

    // const copy = document.createElement("a");
    // copy.textContent = "copy ID";
    // copy.onclick = () => navigator.clipboard?.writeText(message.id || "").catch(() => {});

    // wrap.appendChild(copy);

    // return wrap;
}


function attachYouTubeEmbed(container, url) {
    const api = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    fetch(api)
        .then(r => r.json())
        .then(d => {
            const wrap = document.createElement("div");
            wrap.classList.add("yt_embed");

            const ch = document.createElement("div");
            ch.classList.add("yt_channel");
            ch.textContent = d.author_name;

            const ti = document.createElement("div");
            ti.classList.add("yt_title");
            ti.textContent = d.title;

            const iframe = document.createElement("iframe");
            iframe.src = url.replace("watch?v=", "embed/");
            iframe.allowFullscreen = true;
            iframe.loading = "lazy";

            wrap.appendChild(ch);
            wrap.appendChild(ti);
            wrap.appendChild(iframe);
            container.appendChild(wrap);
        })
        .catch(() => { });
}

function detectYouTubeEmbeds(messageDiv, text) {
    const urls = [...text.matchAll(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+/g)].map(m => m[0]);
    for (const u of urls) attachYouTubeEmbed(messageDiv, u);
}

const threshold = 100
let missedWhileScrolledUp = 0

function shouldAutoScroll(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}

function addMessage(messagePacket) {
    const chatArea = document.getElementById("interactive_logs");
    if (state.currentChannel == messagePacket["channel"]) {
        const message = messagePacket["message"];
        chatArea.appendChild(renderMessage(message));
        attemptResolveMissingRepliesFor(message.id);

        const atBottom = shouldAutoScroll(chatArea)

        if (atBottom) {
            chatArea.scrollTop = chatArea.scrollHeight
            missedWhileScrolledUp = 0
            updateMissedIndicator(0)
        } else {
            missedWhileScrolledUp++
            updateMissedIndicator(missedWhileScrolledUp)
        }
    } else {
        const ch = messagePacket["channel"];
        if (ch) {
            state.unread[ch] = (state.unread[ch] || 0) + 1;
            updateChannelUnread(ch);
        }
    }
    setTimeout(() => {
        lazyRenderMessages();
    }, 2000);
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
let currentObserver;
function makeLoadTrigger(channelName, limit) {
    const channel = state.channelsArray.find(c => c.name === channelName);
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
                        channel,
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
function listMessages(messageList, channel = state.currentChannel, limit = 100) {
    if (!messageList.length) return;

    console.log("rendering messgaes", messageList)
    state.additionalMessageLoad = false;
    const chatArea = document.getElementById("interactive_logs");
    const prev = chatArea.scrollHeight;

    const frag = document.createDocumentFragment();
    if (chatArea.scrollHeight > chatArea.clientHeight || chatArea.firstChild) {
        const trigger = makeLoadTrigger(channel, limit);
        frag.appendChild(trigger);
    }

    for (const m of messageList) {
        const n = renderMessage(m);
        if (n) frag.appendChild(n);
    }

    const first = chatArea.firstChild;
    chatArea.insertBefore(frag, first);

    const next = chatArea.scrollHeight;
    chatArea.scrollTop += next - prev;

    loadedCount += messageList.length;

    lazier.end();
    attemptResolveAllMissingReplies();
    setTimeout(lazyRenderMessages, 100);
}
function changeChannel(channel) {
    loadedCount = 0;
    if (currentObserver) currentObserver.disconnect();
    lastmsgid = null;
    additionalMessageLoad = false;
    state.currentChannel = channel;

    document.querySelectorAll(".single_chnl").forEach((el) => {
        el.classList.toggle("active", el.id === `channel_${channel}`);
    });

    const ch = state.channelsArray.find(c => c.name === channel)

    if (ch.type != "forum") {
        document.getElementById("logspane").appendChild(
            MessageBuilder.action({
                icon: "notifications_active",
                action: ch ? ch.desc : "Listening to " + channel,
                time: ""
            })
        )
        const chatArea = document.getElementById("interactive_logs");
        if (chatArea) chatArea.innerHTML = "";
    }

    if (state.unread[channel]) {
        state.unread[channel] = 0;
        updateChannelUnread(channel);
    }

    updatemainTxtArPermissions();
    renderMembers();
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

var loaderElement = document.getElementById("orion")
var loader = {
    show: () => {
        loaderElement.style.display = 'flex';
        loaderElement.style.opacity = '1';
    },
    hide: () => {
        loaderElement.style.opacity = '0';
        loaderElement.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            loaderElement.style.display = 'none';
        }, 300);
    },
}

var lazier = {
    start: () => {
        document.body.classList.add("lazier_loader")
    },
    end: () => {
        document.body.classList.remove("lazier_loader")
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

async function changeServer() {
    currentServer = await ask("Enter a server URL:") || currentServer;
    localStorage.setItem("currentServer", currentServer);
    ws.close();
    greenflag();
}


function updateTypingIndicator() {
    const typingEl = document.getElementById("typing");
    if (!typingEl) return;

    const channel = state.currentChannel;
    if (!channel) return;

    const typingMap = state.typingUsers[channel];
    if (!typingMap) return;

    const now = Date.now();
    for (const [user, expiry] of typingMap) {
        if (expiry < now) typingMap.delete(user);
    }

    const users = [...typingMap.keys()];

    if (users.length === 0) {
        typingEl.style.opacity = "0";
        setTimeout(typingEl.textContent = "...", 500)
        return;
    }

    typingEl.style.opacity = ".8";

    let text = "";
    if (users.length === 1) {
        text = `${users[0]} is typing...`;
    } else if (users.length === 2) {
        text = `${users[0]} and ${users[1]} are typing...`;
    } else {
        text = `${users.length} people are typing...`;
    }

    typingEl.innerHTML = `<div class="loader2"></div>` + escapeHTML(text);
}
function handleMessageNotification() {

}

function sendTyping() {
    if (!settings.get("send_typing"))
        ws.send(JSON.stringify({ cmd: 'typing', channel: state.currentChannel }));
}

function greenflag() {
    // document.getElementById("usernameLabel").innerText = roturExtension.user.username;
    // document.getElementById("userAvatar").src = `https://avatars.rotur.dev/${encodeURIComponent(roturExtension.user.username)}`;
    // fetch("emojis.json").then(async r => {
    // try {
    //     if (!r.ok) {
    //         console.warn("Failed to get emojis!")
    //         emojis = [];
    //     }

    //     emojis = await r.json();
    // } catch (error) {

    // }
    connectWebSocket();
    // const container = document.getElementById("emojiscrollable");
    // const frag = document.createDocumentFragment();

    // for (const emoji of emojis) {
    //     if (!emoji.emoji) continue;
    //     const x = document.createElement("div");
    //     x.dataset.char = emoji.emoji;
    //     x.classList.add("single_emoji");
    //     x.title = emoji.label.replaceAll(" ", "_");
    //     x.onclick = () => {
    //         document.getElementById("mainTxtAr").value += `:${x.title}:`
    //     }
    //     frag.appendChild(x);
    // }
    // container.appendChild(frag);

    // const obs = new IntersectionObserver(entries => {
    //     for (const e of entries) {
    //         if (e.isIntersecting) {
    //             const el = e.target;
    //             el.innerText = el.dataset.char;
    //             obs.unobserve(el);
    //         }
    //     }
    // });

    // document.querySelectorAll(".single_emoji").forEach(el => obs.observe(el));
    // const input = document.getElementById("emojiSearch");

    // const match = (text, q) => {
    //     let i = 0, j = 0;
    //     while (i < text.length && j < q.length) {
    //         if (text[i] === q[j]) j++;
    //         i++;
    //     }
    //     return j === q.length;
    // };

    // input.addEventListener("input", e => {
    //     const q = e.target.value.toLowerCase();
    //     document.querySelectorAll(".single_emoji").forEach(el => {
    //         const t = (el.title + el.dataset.char).toLowerCase();
    //         el.style.display = match(t, q) ? "" : "none";
    //     });
    // });

    // })
}

function toggleEmojiMenu() {
    const picker = document.getElementById("emojipicker");
    if (picker.style.display != "block") {
        picker.style.display = "block"
    } else {
        picker.style.display = "none"
    }
}
function lazyRenderMessages(selector = '.sing_msg') {
    if (lazyRenderMessages._observer) return;
    const messages = document.querySelectorAll(selector);

    messages.forEach(msg => {
        if (msg.dataset.lazyInit) return;
        const h = msg.scrollHeight;
        msg.dataset.h = h;
        msg.dataset.content = msg.innerHTML;
        msg.innerHTML = '<div style="height:' + h + 'px"></div>';
        msg.dataset.lazyInit = 'true';
    });

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const msg = entry.target;
            if (entry.isIntersecting) {
                msg.innerHTML = msg.dataset.content;
            } else {
                const h = msg.dataset.h;
                msg.innerHTML = '<div style="height:' + h + 'px"></div>';
            }
        });
    }, { threshold: 0.1, rootMargin: '200px 0px 200px 0px' });

    messages.forEach(msg => observer.observe(msg));
    lazyRenderMessages._observer = observer;
}

function renderReactions(msg, container) {
    const reactions = msg.reactions;
    if (!reactions || Object.keys(reactions).length === 0) return;

    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'message-reactions';

    for (const [emoji, users] of Object.entries(reactions)) {
        const count = users.length;
        if (count === 0) continue;

        const hasReacted = users.includes(state.currentUser?.username);

        const reactionEl = document.createElement('span');
        reactionEl.className = 'reaction' + (hasReacted ? ' super' : '');
        reactionEl.setAttribute("data-tooltip", users.toString());
        reactionEl.innerHTML = `
            [<span class="reaction-emoji">${emoji}</span>
            <span class="reaction-count">${count}</span>]
        `;
        reactionEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleReaction(msg.id, emoji);
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
let currentPickerTab = 'emojis';
let gifSearchTimer = null;
let favoriteGifs = [];
function switchPickerTab(tab) {
    currentPickerTab = tab;

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabs = document.querySelectorAll('.picker-tab');

    tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    tabs.forEach(t => {
        if (t.id === `${tab}-tab`) {
            t.classList.add('active');
            t.style.display = 'block';
        } else {
            t.classList.remove('active');
            t.style.display = 'none';
        }
    });

    const input = document.querySelector(`#${tab}-tab input`);
    if (input) input.focus();
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

var settings = {
    get: () => { return 0 }, set: () => { return 0 }
}

class TimeUtil {
    static now() {
        return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
}
class MessageGrouper {
    static shouldConnect(prev, curr) {
        if (!prev || !curr) return false
        if (prev.user !== curr.user) return false
        if (curr.reply_to) return false

        const t1 = (prev.timestamp || 0) * 1000
        const t2 = (curr.timestamp || 0) * 1000

        return Math.abs(t2 - t1) < 5 * 60 * 1000
    }
}

class ElementFactory {
    static div(cls, text) {
        const el = document.createElement("div")
        if (cls) el.className = cls
        if (text !== undefined) el.textContent = text
        return el
    }

    static img(cls, src) {
        const el = document.createElement("img")
        el.className = cls
        el.src = src
        return el
    }

    static link(text) {
        const el = document.createElement("a")
        el.textContent = text
        return el
    }

    static icnBtn(icon, text) {
        const el = document.createElement("a");
        el.className = "icon";
        el.setAttribute("data-tooltip", text)
        el.textContent = icon;
        return el
    }
}

class ReplyBuilder {
    static build(message) {
        if (!message.reply_to) return null

        let replyId = null
        let hintedUser = ""

        if (typeof message.reply_to === "object") {
            replyId = message.reply_to.id || null
            hintedUser = message.reply_to.user || ""
        }

        if (!replyId) return null

        const ref =
            message.reply_to_message ||
            state.messages[replyId] ||
            findMessageById(replyId)

        const el = ElementFactory.div("reply-excerpt")
        el.dataset.ref = replyId

        const arrow = ElementFactory.div("rplarrow")
        el.appendChild(arrow)

        if (!ref) {
            el.classList.add("missing")

            const text = document.createElement("span")

            if (hintedUser) {
                const user = document.createElement("span")
                user.className = "reply-user"
                user.style.color = getUserColor(hintedUser)
                user.textContent = "@" + hintedUser

                text.textContent = "Replying to "
                el.append(text, user)
            } else {
                text.textContent = "Replying to unknown message"
                el.appendChild(text)
            }

            return el
        }

        if (!state.messages[replyId]) state.messages[replyId] = ref

        const user = document.createElement("span")
        user.className = "reply-user"
        user.style.color = getUserColor(ref.user || hintedUser || "")
        user.textContent = "@" + (ref.user || hintedUser || "unknown")

        const preview = document.createElement("span")
        preview.className = "reply-preview"
        preview.textContent = stripHtml(ref.content || "").slice(0, 120)

        el.append(user, preview)
        return el
    }
}
class MessageActions {
    static build(message) {
        const actions = ElementFactory.div("msg_actions")

        const reply = ElementFactory.icnBtn("reply", "reply")
        reply.addEventListener("click", () => {
            runcmd(`reply ${message.id}`)
        })

        const del = ElementFactory.icnBtn("delete", "delete")
        del.addEventListener("click", () => {
            runcmd(`delete ${message.id}`)
        })

        const copy = ElementFactory.icnBtn("content_copy", "copy_id")
        copy.addEventListener("click", () => {
            copy.innerText = "check"
            navigator.clipboard.writeText(message.id)
            setTimeout(() => {
                copy.innerText = "content_copy"
            }, 2000)
        })

        actions.append(reply, del, copy)
        return actions
    }
}
class MessageBuilder {
    static message({ avatar, username, timeStr, text, message, prevMessage }) {
        const connected = MessageGrouper.shouldConnect(prevMessage, message)

        const root = ElementFactory.div("msg")
        if (connected) root.classList.add("connected")
        root.setAttribute("data-id", message.id)
        root.dataset.context = "message";

        const data = ElementFactory.div("data")

        if (!connected) {
            const img = ElementFactory.img("pfp", avatar)

            const name = ElementFactory.div("inline bold", username)
            name.style.color = state.users[username]?.color
            name.addEventListener("click", () => {
                runcmd(`profile ${username.toLowerCase()}`)
            })

            const time = ElementFactory.div("time", timeStr)
            const fill = ElementFactory.div("fill")
            const actions = MessageActions.build(message)

            data.append(img, name, fill, actions, time)
        } else {
            root.classList.add("connected")
            const actions = MessageActions.build(message)
            const time = ElementFactory.div("time", timeStr)
            data.append(actions, time)
        }


        let msg = ElementFactory.div("inline p")
        if (text && text.trim()) {
            msg.classList.add("contains_text")
            const parsed = ContentParser.parse(text)
            msg.appendChild(parsed)
        }

        const reply = ReplyBuilder.build(message)
        const attachments = AttachmentBuilder.build(message.attachments)

        if (attachments) msg.append(attachments || "");
        if (connected) {
            root.append(
                msg || "",
                data
            )

        } else {
            root.append(
                reply || "",
                data,
                msg || ""
            )
        }

        return root
    }

    static action(args) {
        return ActionBuilder.build(args)
    }
}

class ActionBuilder {
    static lastAction = null

    static build({ icon, username, action, expiry }) {
        const last = this.lastAction

        if (
            last &&
            last.icon === icon &&
            last.username === username &&
            last.action === action
        ) {
            last.count++
            last.timeNode.textContent = TimeUtil.now()
            last.actNode.textContent = `${action} x${last.count}`

            if (last.timer) clearTimeout(last.timer)
            if (expiry) {
                last.timer = setTimeout(() => {
                    last.root.remove()
                    if (this.lastAction === last) this.lastAction = null
                }, expiry)
            }

            return last.root
        }

        const root = ElementFactory.div("msg")
        const data = ElementFactory.div("data")

        const ic = ElementFactory.div("icon", icon || "info_i")
        const name = ElementFactory.div("inline bold")
        name.innerHTML = username

        const act = ElementFactory.div("inline")
        act.innerHTML = action

        username && data.appendChild(name)
        action && data.appendChild(act)

        const time = ElementFactory.div("time", TimeUtil.now())
        root.append(ic, data, time)

        let timer = null
        if (expiry) {
            timer = setTimeout(() => {
                root.remove()
                if (this.lastAction && this.lastAction.root === root) this.lastAction = null
            }, expiry)
        }

        this.lastAction = {
            icon,
            username,
            action,
            root,
            timeNode: time,
            actNode: act,
            count: 1,
            timer
        }

        return root
    }
}
class ContentParser {
    static imageRegex = /(https?:\/\/[^\s]+)/gi

    static parse(text) {
        const container = document.createElement("div")
        container.innerHTML = text
        this.replaceTextLinks(container)
        return container
    }

    static isLikelyImage(url) {
        return /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)(\?|$)/i.test(url)
    }

    static createImage(url) {
        const img = document.createElement("img")
        img.src = url
        img.className = "msg_img"
        img.loading = "lazy"
        return img
    }

    static async probe(url) {
        return new Promise(res => {
            const img = new Image()
            img.onload = () => res(true)
            img.onerror = () => res(false)
            img.src = url
        })
    }

    static replaceTextLinks(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        const nodes = []
        while (walker.nextNode()) nodes.push(walker.currentNode)

        nodes.forEach(node => {
            const matches = [...node.nodeValue.matchAll(this.imageRegex)]
            if (!matches.length) return

            const frag = document.createDocumentFragment()
            let lastIndex = 0

            matches.forEach(match => {
                const url = match[0]
                const start = match.index
                const end = start + url.length

                if (start > lastIndex) {
                    frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, start)))
                }

                if (this.isLikelyImage(url)) {
                    frag.appendChild(this.createImage(url))
                } else {
                    const a = document.createElement("a")
                    a.href = url
                    a.textContent = url

                    this.probe(url).then(ok => {
                        if (ok && a.parentNode) {
                            a.replaceWith(this.createImage(url))
                        }
                    })

                    frag.appendChild(a)
                }

                lastIndex = end
            })

            if (lastIndex < node.nodeValue.length) {
                frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)))
            }

            node.replaceWith(frag)
        })

        const links = root.querySelectorAll("a[href]")
        links.forEach(a => {
            const url = a.href

            if (this.isLikelyImage(url)) {
                a.replaceWith(this.createImage(url))
            } else {
                this.probe(url).then(ok => {
                    if (ok && a.parentNode) {
                        a.replaceWith(this.createImage(url))
                    }
                })
            }
        })
    }
}

class AttachmentBuilder {
    static isImage(att) {
        return att.mime_type && att.mime_type.startsWith("image/")
    }

    static build(attachments) {
        if (!attachments || !attachments.length) return null

        const wrap = document.createElement("div")
        wrap.className = "attachments"

        attachments.forEach(att => {
            if (this.isImage(att)) {
                const img = document.createElement("img")
                img.src = att.url
                img.className = "msg_img"
                img.loading = "lazy"
                wrap.appendChild(img)
            } else {
                const a = document.createElement("a")
                a.href = att.url
                a.textContent = att.name || "attachment"
                a.target = "_blank"
                wrap.appendChild(a)
            }
        })

        return wrap
    }
}
const tooltip = document.createElement("div")
tooltip.style.position = "fixed"
tooltip.style.pointerEvents = "none"
tooltip.style.zIndex = "999999"
tooltip.style.padding = "6px 10px"
tooltip.style.background = "rgb(var(--three))"
tooltip.style.color = "#fff"
tooltip.style.borderRadius = "4px"
tooltip.style.fontSize = "12px"
tooltip.style.whiteSpace = "pre-line"
tooltip.style.transition = "opacity 0.1s ease"
tooltip.style.opacity = "0"
document.body.appendChild(tooltip)

let active = null
const gap = 12
const pull = 0.22
const offset = 18
const drift = 8

document.addEventListener("mouseover", e => {
    const el = e.target.closest("[data-tooltip]")
    if (!el) return
    active = el
    tooltip.textContent = el.dataset.tooltip.replace(/\\n/g, "\n")
    tooltip.style.opacity = "1"
})

document.addEventListener("mousemove", e => {
    if (!active) return

    const host = active.getBoundingClientRect()
    const rect = tooltip.getBoundingClientRect()
    const dir = active.dataset.tooltipDirection || "top"

    const cx = host.left + host.width / 2
    const cy = host.top + host.height / 2

    let x = cx
    let y = cy
    let tx = "-50%"
    let ty = "-100%"

    if (dir === "top" || dir === "bottom") {
        x = cx + (e.clientX - cx) * pull
        const half = rect.width / 2
        if (x - half < gap) x = half + gap
        if (x + half > innerWidth - gap) x = innerWidth - half - gap
    }

    if (dir === "top") {
        y = host.top - offset + Math.max(-drift, Math.min(drift, (e.clientY - cy) * 0.08))
        ty = "-100%"
    }

    if (dir === "bottom") {
        y = host.bottom + offset + Math.max(-drift, Math.min(drift, (e.clientY - cy) * 0.08))
        ty = "0"
    }

    if (dir === "left") {
        x = host.left - offset + Math.max(-drift, Math.min(drift, (e.clientX - cx) * 0.08))
        y = cy + (e.clientY - cy) * pull
        if (y < gap) y = gap
        if (y + rect.height > innerHeight - gap) y = innerHeight - rect.height - gap
        tx = "-100%"
        ty = "-50%"
    }

    if (dir === "right") {
        x = host.right + offset + Math.max(-drift, Math.min(drift, (e.clientX - cx) * 0.08))
        y = cy + (e.clientY - cy) * pull
        if (y < gap) y = gap
        if (y + rect.height > innerHeight - gap) y = innerHeight - rect.height - gap
        tx = "0"
        ty = "-50%"
    }

    tooltip.style.transform = `translate(${tx}, ${ty})`
    tooltip.style.left = x + "px"
    tooltip.style.top = y + "px"
})

document.addEventListener("mouseout", e => {
    if (!active) return
    if (!e.relatedTarget || !active.contains(e.relatedTarget)) {
        tooltip.style.opacity = "0"
        active = null
    }
})
function attachAutoResize(textarea, max = 300, offset = 32) {
    if (!textarea || textarea._autoResizeAttached) return;

    textarea.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight - offset, max) + "px";
    });

    textarea._autoResizeAttached = true;
}
function loadServers() {
    const localServers = settings.get("servers_index") || [];
    const list = document.getElementById("servers_list");
    list.innerHTML = "";
    const sName = "Direct Messages";
    const sIcon = "assets/logo_vector.svg";
    const sURL = "wss://dms.mistium.com";

    const filtered = localServers.filter(server => server.url !== sURL);

    const servers = [
        {
            name: sName,
            icon: sIcon,
            url: sURL
        },
        ...filtered
    ];

    settings.set("servers_index", servers);

    servers.forEach(server => {
        const img = document.createElement("img");
        img.className = "server_shortcut";
        img.dataset.tooltip = server.name + "\n" + server.url;
        img.dataset.tooltipDirection = "right";
        img.dataset.context = "server";
        img.dataset.name = server.name;
        img.dataset.url = server.url;
        img.addEventListener("click", () => {
            runcmd("cls");
            runcmd("server " + server.url);
        });
        img.src = server.icon || "";
        list.appendChild(img);
    });
}
document.addEventListener("DOMContentLoaded", () => {
    loadServers();
    if (settings.get("currentServer")) {
        currentServer = settings.get("currentServer");
    } else {
        settings.set("currentServer", "wss://dms.mistium.com");
        currentServer = settings.get("currentServer");
    }
});

function deleteServer(url) {
    const localServers = settings.get("servers_index") || [];

    const updated = localServers.filter(server => server.url !== url);

    settings.set("servers_index", updated);

    loadServers()
}

const menu = document.getElementById("contextMenu")

const menus = {
    server: [
        { text: "Open Server", action: el => el.click },
        {
            text: "Copy URL", action: el => {
                navigator.clipboard.writeText(text);
                say("Copied URL!")
            }
        },
        { text: "Reload Icon", action: el => el.src = el.src },
        { text: "Delete Server", action: el => deleteServer(el.dataset.url) }
    ],
    message: [
        { text: "Reply", action: el => console.log("reply", el) },
        { text: "Edit", action: el => console.log("edit", el) },
        { text: "Delete", action: el => console.log("delete message", el) }
    ],
    default: [
        { text: "Refresh", action: el => location.reload() }
    ]
}

let currentTarget = null

function buildMenu(type, target) {
    menu.innerHTML = ""
    const items = menus[type] || menus.default

    items.forEach(item => {
        const div = document.createElement("div")
        div.className = "context-item"
        div.textContent = item.text
        div.onclick = () => {
            item.action(target)
            hideMenu()
        }
        menu.appendChild(div)
    })
}

function showMenu(x, y) {
    menu.style.display = "block"
    const w = menu.offsetWidth
    const h = menu.offsetHeight
    const px = Math.min(x, window.innerWidth - w - 8)
    const py = Math.min(y, window.innerHeight - h - 8)
    menu.style.left = px + "px"
    menu.style.top = py + "px"
}

function hideMenu() {
    menu.style.display = "none"
}

document.addEventListener("contextmenu", e => {
    const target = e.target.closest("[data-context]")
    if (!target) return hideMenu()

    e.preventDefault()
    currentTarget = target
    const type = target.dataset.context
    buildMenu(type, target)
    showMenu(e.clientX, e.clientY)
})

document.addEventListener("click", hideMenu)
window.addEventListener("resize", hideMenu)
document.addEventListener("scroll", hideMenu, true)
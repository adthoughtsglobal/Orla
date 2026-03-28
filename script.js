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
    static build() {
        const actions = ElementFactory.div("msg_actions")
        actions.append(
            ElementFactory.link("reply"),
            ElementFactory.link("delete"),
            ElementFactory.link("copy_ID")
        )
        return actions
    }
}
class MessageBuilder {
    static message({ avatar, username, timeStr, text, message, prevMessage }) {
        const connected = MessageGrouper.shouldConnect(prevMessage, message)

        const root = ElementFactory.div("msg")
        if (connected) root.classList.add("connected")
        root.setAttribute("data-id", message.id)

        const data = ElementFactory.div("data")

        if (!connected) {
            const img = ElementFactory.img("pfp", avatar)

            const name = ElementFactory.div("inline bold", username)
            name.style.color = state.users[username].color
            name.addEventListener("click", () => {
                runcmd(`profile ${username.toLowerCase()}`)
            })

            const time = ElementFactory.div("time", timeStr)
            const fill = ElementFactory.div("fill")
            const actions = MessageActions.build()

            data.append(img, name, time, fill, actions)
        } else {
            const time = ElementFactory.div("time", timeStr)
            data.appendChild(time)
        }


        let msg = null
        if (text && text.trim()) {
            msg = ElementFactory.div("inline p")
            const parsed = ContentParser.parse(text)
            msg.appendChild(parsed)
        }

        const reply = ReplyBuilder.build(message)
        const attachments = AttachmentBuilder.build(message.attachments)

        root.append(
            reply || "",
            data,
            msg || "",
            attachments || ""
        )

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

        const ic = ElementFactory.div("icon", icon)
        const name = ElementFactory.div("inline bold")
        name.innerHTML = username

        const act = ElementFactory.div("inline")
        act.innerHTML = action

        icon && data.appendChild(ic)
        username && data.appendChild(name)
        action && data.appendChild(act)

        const time = ElementFactory.div("time", TimeUtil.now())
        root.append(data, time)

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
tooltip.style.whiteSpace = "nowrap"
tooltip.style.transform = "translate(-50%, -135%)"
tooltip.style.transition = "opacity 0.1s ease"
tooltip.style.opacity = "0"
document.body.appendChild(tooltip)

let active = null

document.addEventListener("mouseover", e => {
    const el = e.target.closest("[data-tooltip]")
    if (!el) return
    active = el
    tooltip.textContent = el.getAttribute("data-tooltip")
    tooltip.style.opacity = "1"
})

document.addEventListener("mousemove", e => {
    if (!active) return
    tooltip.style.left = e.clientX + "px"
    tooltip.style.top = e.clientY + "px"
})

document.addEventListener("mouseout", e => {
    if (!active) return
    if (!e.relatedTarget || !active.contains(e.relatedTarget)) {
        tooltip.style.opacity = "0"
        active = null
    }
})
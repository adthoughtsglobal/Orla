class MessageBuilder {
    static lastAction = null

    static now() {
        return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }

    static message({ avatar, username, text, message }) {
        const root = document.createElement("div")
        root.className = "msg"
        root.setAttribute("data-id", message.id)

        const data = document.createElement("div")
        data.className = "data"

        const img = document.createElement("img")
        img.className = "pfp"
        img.src = avatar

        const name = document.createElement("div")
        name.className = "inline bold"
        name.textContent = username
        name.style.color = state.users[username].color
        name.addEventListener("click", ()=> {runcmd(`profile ${username.toLowerCase()}`)})

        const t = document.createElement("div")
        t.className = "time"
        t.textContent = this.now()

        const fill = document.createElement("div")
        fill.className = "fill"

        const actions = document.createElement("div")
        actions.className = "msg_actions"

        const reply = document.createElement("a")
        reply.textContent = "reply"

        const del = document.createElement("a")
        del.textContent = "delete"

        const copy = document.createElement("a")
        copy.textContent = "copy_ID"

        actions.append(reply, del, copy)
        data.append(img, name, t, fill, actions)

        const msg = document.createElement("div")
        msg.className = "inline p"
        msg.innerHTML = text

        root.append(data, msg)
        return root
    }

    static action({ icon, username, action, expiry }) {
        const last = this.lastAction

        if (
            last &&
            last.icon === icon &&
            last.username === username &&
            last.action === action
        ) {
            last.count++
            last.timeNode.textContent = this.now()
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

        const root = document.createElement("div")
        root.className = "msg"

        const data = document.createElement("div")
        data.className = "data"

        const ic = document.createElement("div")
        ic.className = "icon"
        ic.textContent = icon

        const name = document.createElement("div")
        name.className = "inline bold"
        name.innerHTML = username

        const act = document.createElement("div")
        act.className = "inline"
        act.innerHTML = action

        icon && data.appendChild(ic)
        username && data.appendChild(name)
        action && data.appendChild(act)

        const t = document.createElement("div")
        t.className = "time"
        t.textContent = this.now()

        root.append(data, t)

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
            timeNode: t,
            actNode: act,
            count: 1,
            timer
        }

        return root
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
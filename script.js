class MessageBuilder {
    static lastAction = null

    static now() {
        return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }

    static message({ avatar, username, text }) {
        const root = document.createElement("div")
        root.className = "msg"

        const data = document.createElement("div")
        data.className = "data"

        const img = document.createElement("img")
        img.className = "pfp"
        img.src = avatar

        const name = document.createElement("div")
        name.className = "inline bold"
        name.textContent = username

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

    static action({ icon, username, action }) {
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

        this.lastAction = {
            icon,
            username,
            action,
            root,
            timeNode: t,
            actNode: act,
            count: 1
        }

        return root
    }
}
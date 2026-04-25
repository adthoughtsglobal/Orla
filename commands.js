var commandinput = document.getElementById("commandinput")
var pane = document.getElementById("listspane");
let submitOnRelease = false
const listsSearchInputsElement = document.querySelector('.listssearch.inputs')
const listsPaneElement = document.getElementById('listspane')

let areListsPanelsVisible = false

function toggleBoth() {
    const v = areListsPanelsVisible ? '' : 'none'
    listsPaneElement.style.display = v
    listsSearchInputsElement.style.display = v
    areListsPanelsVisible = !areListsPanelsVisible;
}

toggleBoth();

attachAutoResize(commandinput);
let autocompleteIndex = -1
let autocompleteSuggestions = []
const autocompleteList = document.getElementById("autocomplete_list")

function renderAutocomplete() {
    if (autocompleteSuggestions.length === 0) {
        autocompleteList.innerHTML = ""
        return
    }
    autocompleteList.innerHTML = autocompleteSuggestions.map((cmd, i) =>
        `<div class="autocomplete_item${i === autocompleteIndex ? " active" : ""}">${i === autocompleteIndex ? "->" : "  "} ${cmd}</div>`
    ).join("")

    autocompleteList.querySelectorAll(".autocomplete_item").forEach((el, i) => {
        el.addEventListener("mousedown", (e) => {
            e.preventDefault()
            autocompleteIndex = i
            commandinput.value = autocompleteSuggestions[i]
            autocompleteSuggestions = []
            autocompleteIndex = -1
            autocompleteList.innerHTML = ""
            commandinput.focus()
        })
    })
}

commandinput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        submitOnRelease = true
        autocompleteIndex = -1
        autocompleteSuggestions = []
        autocompleteList.innerHTML = ""
    } else if (event.key === "ArrowDown") {
        if (autocompleteSuggestions.length === 0) return
        event.preventDefault()
        autocompleteIndex = (autocompleteIndex + 1) % autocompleteSuggestions.length
        renderAutocomplete()
    } else if (event.key === "ArrowUp") {
        if (autocompleteSuggestions.length === 0) return
        event.preventDefault()
        autocompleteIndex = (autocompleteIndex - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length
        renderAutocomplete()
    } else if (event.key === "Tab") {
        if (autocompleteIndex >= 0) {
            event.preventDefault()
            commandinput.value = autocompleteSuggestions[autocompleteIndex]
            autocompleteSuggestions = []
            autocompleteIndex = -1
            autocompleteList.innerHTML = ""
        }
    } else if (event.key === "Escape") {
        autocompleteIndex = -1
        autocompleteSuggestions = []
        autocompleteList.innerHTML = ""
    } else {
        submitOnRelease = false
        autocompleteIndex = -1
        autocompleteSuggestions = []
        autocompleteList.innerHTML = ""
    }
})
function fuzzyScore(query, str) {
    query = query.toLowerCase()
    str = str.toLowerCase()

    if (str.startsWith(query)) return 1000 - str.length

    let score = 0
    let qi = 0

    for (let i = 0; i < str.length && qi < query.length; i++) {
        if (str[i] === query[qi]) {
            score += 10
            qi++
        }
    }

    if (qi < query.length) return -1

    if (str.includes(query)) score += 50

    return score - str.length
}

commandinput.addEventListener("input", () => {
    const parts = commandinput.value.trim().split(" ")

    if (parts.length === 1 && parts[0].length > 0) {
        const q = parts[0]

        autocompleteSuggestions = Object.keys(commands)
            .map(cmd => ({ cmd, score: fuzzyScore(q, cmd) }))
            .filter(x => x.score >= 0)
            .sort((a, b) => b.score - a.score || a.cmd.localeCompare(b.cmd))
            .map(x => x.cmd)

        autocompleteIndex = autocompleteSuggestions.length > 0 ? 0 : -1
        renderAutocomplete()
    } else {
        autocompleteSuggestions = []
        autocompleteIndex = -1
        autocompleteList.innerHTML = ""
    }
})
commandinput.addEventListener("keyup", async (event) => {
    if (event.key === "Enter" && submitOnRelease) {
        submitOnRelease = false
        await processCommand()
        document.getElementById("logspane").scrollTop = document.getElementById("logspane").scrollHeight
    }
})

commandinput.addEventListener("blur", () => {
    setTimeout(() => { autocompleteList.innerHTML = "" }, 100)
})

commandinput.addEventListener("keyup", async (event) => {
    if (event.key === "Enter" && submitOnRelease) {
        submitOnRelease = false
        await processCommand()
        document.getElementById("logspane").scrollTop = document.getElementById("logspane").scrollHeight
    }
})
const commands = {
    ls: async (output) => {
        const rows = state.channelsArray
            .filter(c => c?.name)
            .map((c, i) => {
                const idx = String(i).padStart(2, "0")
                const label = c.name
                const name = c.name == state.currentChannel ? `<strong>${label}</strong>` : label;
                const icon = c.icon;
                return `${(icon) ? `<img src='${icon}' class="custom-emoji">` : "<span class='custom-emoji icon'>tag</span>"} ${idx} | ${name}`
            })

        document.getElementById("logspane")?.appendChild(
            MessageBuilder.action({ icon: "wand_stars", action: rows.join("<br>"), time: "" })
        )
    },

    cd: async (output) => {
        const channels = state.channelsArray.filter(c => c.name)
        const arg = output.params[0]
        if (!arg) return

        let [channelPart, threadPart] = arg.split("/")
        let targetChannel = channelPart

        if (/^\d+$/.test(channelPart)) {
            const i = parseInt(channelPart, 10)
            if (i >= 0 && i < channels.length) targetChannel = channels[i].name
            else return
        }

        state._currentThread = undefined
        if (threadPart !== undefined) {
            const ch = channels.find(c => c.name === targetChannel)
            if (ch && ch.threads) {
                const threadIdx = parseInt(threadPart, 10)
                if (!isNaN(threadIdx) && threadIdx >= 0 && threadIdx < ch.threads.length) {
                    state._currentThread = threadIdx
                    const thread = ch.threads[threadIdx]
                    if (thread) {
                        const chatArea = document.getElementById("interactive_logs")
                        if (chatArea) chatArea.innerHTML = ""
                        document.getElementById("logspane").appendChild(
                            MessageBuilder.action({ icon: "forum", action: `Switched to thread: <strong>${thread.name}</strong>`, time: "" })
                        )
                    }
                }
            }
        }

        changeChannel(targetChannel)
    },

    online: async (output) => {
        document.getElementById("logspane").appendChild(
            MessageBuilder.action({
                icon: "wand_stars",
                action: Object.keys(state.online_users).join("<br>"),
                time: ""
            })
        )
    },

    cls: async (output) => {
        document.getElementById("logspane").innerHTML = ""
    },
    theme: async (output) => {
        const themes = ["bright", "crt", "cute-dark", "cute-light", "green", "neon", "collapse-server-bar"]
        const [subcommand, themeName] = output.params

        const getLinks = () => [...document.querySelectorAll('link.theme-stylesheet')]
        const getActive = () => getLinks().map(el => el.dataset.theme)
        const log = (action) => document.getElementById("logspane").appendChild(
            MessageBuilder.action({ icon: "brush", action, time: "" })
        )
        const resolveTheme = (arg) => /^\d+$/.test(arg) ? themes[parseInt(arg)] : arg
        const addTheme = async (name) => {
            if (!name || getActive().includes(name)) return

            const res = await fetch('themes/' + name + '.css')
            const text = await res.text()
            const firstLine = text.split('\n')[0].trim()

            let msg = ''
            const match = firstLine.match(/orla-theme-text:\s*"(.*)"/)
            if (match) msg = match[1]

            const style = document.createElement('style')
            style.id = 'theme-transition'
            style.textContent = `*{transition:color 5s, background-color 5s, border-color 5s}`
            document.head.appendChild(style)

            setTimeout(() => {
                style.remove()
            }, 5000)

            if (msg) {
                const overlay = document.createElement('div')
                overlay.id = 'theme-text'
                overlay.textContent = msg
                Object.assign(overlay.style, {
                    position: 'fixed',
                    inset: '0',
                    display: 'flex',
                    alignItems: 'center',
                    textAlign: 'center',
                    justifyContent: 'center',
                    fontSize: '8vw',
                    zIndex: '9999',
                    pointerEvents: 'none',
                    animation: "slowin 5s"
                })
                document.body.appendChild(overlay)
                setTimeout(() => overlay.remove(), 4500)
            }

            const link = Object.assign(document.createElement('link'), {
                rel: 'stylesheet',
                href: 'themes/' + name + '.css'
            })
            link.classList.add('theme-stylesheet')
            link.dataset.theme = name

            document.head.appendChild(link)
        }

        if (!subcommand) {
            const active = getActive()
            log(`Available themes:<br>${themes.map((t, i) => `${i} | ${t}`).join("<br>")}<br>Active: ${active.length ? active.join(", ") : "none"}`)
            return
        }

        switch (subcommand) {
            case "add":
                if (!themeName) return
                const resolved = resolveTheme(themeName)
                if (getActive().includes(resolved)) { log(`Theme "${resolved}" is already active`); return }
                addTheme(resolved)
                break
            case "remove":
                if (!themeName) return
                if (themeName === "all") { getLinks().forEach(el => el.remove()); break }
                document.querySelector(`link.theme-stylesheet[data-theme="${resolveTheme(themeName)}"]`)?.remove()
                break
            default:
                addTheme(resolveTheme(subcommand))
        }
    },

    help: async (output) => {
        if (output.params[0] === "pane") {
            document.getElementById("logspane").appendChild(
                MessageBuilder.action({
                    icon: "wand_stars",
                    action: `Orla Pane Help<br><ul>
<li><strong>pane</strong>: closes the pane</li>
<b>Pane subcommands</b>
<li><strong>search</strong> [keywords]: searches the current channel</li>
<li><strong>members</strong>: shows a list of all members in the current server</li>
<li><strong>pinned</strong>: shows all pinned messages in the current channel</li>
<li><strong>state</strong> [variable]: outputs the value of an Orla state variable</li>
</ul>`,
                    time: ""
                })
            )
            return
        }
        document.getElementById("logspane").appendChild(
            MessageBuilder.action({
                icon: "wand_stars",
                action: `Orla Client: commands<br><ul>
<li><strong>online</strong>: shows a list of online users</li>
<li><strong>ls</strong>: lists all channels with IDs</li>
<li><strong>cd</strong> [channel_name/local_id]: navigate to a channel or display channel name</li>
<li><strong>profile</strong> [*username]: displays user data</li>
<b>Orla Specific:</b>
<li><strong>help</strong>: shows this message</li>
<li><strong>cls</strong>: clear command logs</li>
<li><strong>pane</strong> [subcommand]: opens a secondary pane</li>
<li><strong>theme</strong> [name]: applies or lists available themes</li>
<b>Rotur:</b>
<li><strong>transfer</strong> [username],[amount]: send credits to user</li>
<li><strong>balance</strong> [*username]: shows rotur credit balance</li>
</ul>* = optional &nbsp; Use help [pane] for pane help.`,
                time: ""
            })
        )
    },

    profile: async (output) => {
        let user = output.params[0] || state.user.username
        try {
            const res = await fetch(`https://api.rotur.dev/profile?name=${encodeURIComponent(user)}&include_posts=0`)
            const data = await res.json()

            const usersLowercase = Object.fromEntries(
                Object.entries(state.users).map(([key, value]) => [key.toLowerCase(), value])
            )

            let u = usersLowercase[user.toLowerCase()] || {}
            const statusText = u.status?.text || "N/A"
            const statusType = u.status?.status || "N/A"

            let lines = []
            lines.push(`<strong>${u.nickname && u.nickname != user ? `${u.nickname} (${user})` : user}</strong>`)
            if (data.private || data.system)
                lines.push([data.private ? `privacy: ${data.private}` : null, data.system ? `system: ${data.system}` : null].filter(Boolean).join(" • "))
            if (data.pronouns) lines.push(`pronouns: ${data.pronouns}`)
            lines.push(`status: ${statusText} (${statusType})`)
            if (u.roles?.length) lines.push(`roles: ${u.roles.join(", ")}`)
            if (data.following || data.followers) lines.push(`following: ${data.following || 0} • followers: ${data.followers || 0}`)
            if (data.bio) lines.push(`bio: ${data.bio}`)
            if (data.created) lines.push(`created: ${(new Date(data.created)).toString()}`)
            if (data.badges?.length) lines.push(`badges: ${data.badges.map(a => a.name).join(", ")}`)

            document.getElementById("logspane").appendChild(
                MessageBuilder.action({
                    icon: "wand_stars",
                    action: `<div style="display:flex; gap:.5em; width:100%;"><img class="pfp" src="https://avatars.rotur.dev/${user}"><div style="flex:1">${lines.join("<br>")}</div></div>`,
                    time: ""
                })
            )
        } catch (err) {
            console.error("Failed to fetch profile", err)
        }
    },

    info: async (output) => {
        const logo = [
            "      ********************     ",
            "   **************************  ",
            "  *****#@@@@@@@@************** ",
            " ****#@@@@#++@@@@@*************",
            "****@@@@:......+@@@*****%@#****",
            "****@@@:........+@@***@@@@@@%**",
            "****@@@:........-@@#*%@@...@@**",
            "****@@@%.......:@@@***@@#+%@@**",
            "*****@@@@#-.:+@@@@******@@%****",
            "******@@@@@@@@@@@**************",
            "****#@@***%@%******************",
            "***@@%*************************",
            "**@@***************************",
            "@@@****************************",
            "  *****************************",
            "   ****************************",
            "     **************************"
        ]
        const entries = [
            ["User", state.user.username],
            ["Status", state.user.status.status],
            ["Channel", state._currentChannel],
            ["Server", state.server.name],
            ["Server URL", state.server.url],
            ["Server Owner", state.server.owner.name],
            ["Client", "Orla Client"],
            ["Client Repository", "adthoughtsglobal/Orla"]
        ]
        const pad = (s, n) => s + " ".repeat(Math.max(n - s.length, 0))
        const maxKey = Math.max(...entries.map(([k]) => k.length))
        const formatEntry = (k, v, width) => {
            const lines = String(v).split("\n")
            return [pad(k + ":", width) + lines[0], ...lines.slice(1).map(l => " ".repeat(width) + l)].join("\n")
        }
        notify(
            '<div class="overflowable" style="display:flex; font-family:monospace;">' +
            '<pre style="margin:0; white-space:pre; line-height:1;">' + logo.join("\n") + '</pre>' +
            '<pre style="margin:0; padding-left:12px; white-space:pre-wrap; word-break:break-word;">' +
            entries.map(([k, v]) => formatEntry(k, v, maxKey + 1)).join("\n") + '</pre></div>'
        )
    },

    balance: async (output) => {
        const user = output.params[0] || state.user.username
        const res = await fetch(`https://api.rotur.dev/profile?name=${encodeURIComponent(user)}&include_posts=0`)
        const data = await res.json()
        document.getElementById("logspane").appendChild(
            MessageBuilder.action({ icon: "attach_money", action: `${user} has ${data.currency} rotur credits` })
        )
    },

    transfer: async (output) => {
        try {
            const result = await roturExtension.transferCurrency({ AMOUNT: Number(output.params[1]), USER: output.params[0] })
            document.getElementById("logspane").appendChild(
                MessageBuilder.action({ icon: "attach_money", action: result || "Transaction state is unknown." })
            )
        } catch {
            document.getElementById("logspane").appendChild(
                MessageBuilder.action({ icon: "attach_money", action: "Transaction failed." })
            )
        }
    },

    server: async (output) => {
        changeServer(output.params[0])
    },

    delete: async (output) => {
        ws.send(JSON.stringify({ cmd: "message_delete", channel: state._currentChannel, id: output.params[0] }))
    },

    edit: async (output) => {
        editMessage(output.params[0])
    },

    pane: async (output) => {
        if ((!areListsPanelsVisible && !output.params[0]) || (areListsPanelsVisible && output.params[0])) toggleBoth()
        pane.innerHTML = `<div class="empty">no data</div>`
        state.paneState = output.params[0]

        const paneCommands = {
            members: () => {
                ws.send(JSON.stringify({ cmd: "users_list" }));
                state.members_list_requested = true;
                pane.innerHTML = ""
                filterPane()
            },
            state: () => {
                pane.innerHTML = `<p>state.${output.params[1]}:</p>`
                if (state[output.params[1]]) pane.appendChild(toFormattedString(state[output.params[1]]))
            },
            list: () => { },
            pinned: () => {
                pane.innerHTML = `<p>Pinned messages in #${state.currentChannel}:</p>`
                ws.send(JSON.stringify({ cmd: "messages_pinned", channel: state.currentChannel }))
            },
            search: () => {
                pane.innerHTML = `<p>Messages containing "${output.params[1]}":</p>`
                ws.send(JSON.stringify({ cmd: "messages_search", channel: state.currentChannel, query: output.params[1] }))
            }
        }

        paneCommands[output.params[0]]?.()
    }
}

async function processCommand() {
    function parse(input) {
        let i = 0

        while (i < input.length && input[i] === ' ') i++

        let cmd = ''
        while (i < input.length && input[i] !== ' ') cmd += input[i++]

        let params = []
        let cur = ''
        let quote = null

        while (i < input.length) {
            let c = input[i++]

            if ((c === '"' || c === "'")) {
                if (quote === null) {
                    quote = c
                    continue
                }
                if (quote === c) {
                    quote = null
                    continue
                }
            }

            if (c === ' ' && quote === null) {
                if (cur.length) {
                    params.push(cur)
                    cur = ''
                }
                while (i < input.length && input[i] === ' ') i++
                continue
            }

            cur += c
        }

        if (cur.length) params.push(cur)

        return { command: cmd, params }
    }
    var output = parse(commandinput.value);

    document.getElementById("logspane").appendChild(
        MessageBuilder.action({
            icon: "terminal",
            action: commandinput.value,
            time: ""
        })
    )
    console.log(5405840545, output)
    const handler = commands[output.command]
    if (handler) await handler(output)

    commandinput.value = "";
}

async function runcmd(cmd) {
    const chatArea = document.getElementById("logspane");
    const atBottom = shouldAutoScroll(chatArea);

    commandinput.value = cmd;
    await processCommand();

    if (atBottom) {
        setTimeout(() => {
            chatArea.scrollTo({
                top: chatArea.scrollHeight,
                behavior: "smooth"
            });
        }, 1000);
    }
}
const search = document.getElementById("paneSearch")

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function clearHighlight(el) {
    el.querySelectorAll("mark").forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent))
    })
    el.normalize()
}

function highlight(el, q) {
    clearHighlight(el)
    if (!q) return

    const re = new RegExp(escapeRegExp(q), "gi")
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes = []

    while (walker.nextNode()) nodes.push(walker.currentNode)

    nodes.forEach(node => {
        const text = node.nodeValue
        if (!text.trim()) return
        if (!re.test(text)) return

        re.lastIndex = 0
        const frag = document.createDocumentFragment()
        let last = 0

        text.replace(re, (match, offset) => {
            frag.append(text.slice(last, offset))
            const mark = document.createElement("mark")
            mark.textContent = match
            frag.append(mark)
            last = offset + match.length
        })

        frag.append(text.slice(last))
        node.parentNode.replaceChild(frag, node)
    })
}

function parseQuery(input) {
    const tokens = []
    const re = /(\w+):\s*([^:]+)|(\S+)/g
    let m

    while ((m = re.exec(input))) {
        if (m[1]) {
            tokens.push({
                type: "field",
                key: m[1].toLowerCase(),
                value: m[2].trim().toLowerCase()
            })
        } else if (m[3]) {
            tokens.push({
                type: "text",
                value: m[3].toLowerCase()
            })
        }
    }

    return tokens
}

function rowMatches(row, tokens) {
    const text = row.textContent.toLowerCase()

    return tokens.every(token => {
        if (token.type === "text") {
            return text.includes(token.value)
        }

        const re = new RegExp(
            `${escapeRegExp(token.key)}\\s*:\\s*([\\s\\S]*?)($|\\n)`,
            "i"
        )

        const match = row.innerText.match(re)
        if (!match) return false

        return match[1].toLowerCase().includes(token.value)
    })
}

function filterPane() {
    const raw = search.value.trim()
    const tokens = parseQuery(raw)
    const rows = Array.from(pane.children)

    rows.forEach(row => {
        const show = !tokens.length || rowMatches(row, tokens)

        row.style.display = show ? "" : "none"
        if (show) highlight(row, raw)
        else clearHighlight(row)
    })
}

search.addEventListener("input", filterPane)
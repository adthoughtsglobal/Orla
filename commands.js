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

commandinput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        submitOnRelease = true
    } else {
        submitOnRelease = false
    }
})

commandinput.addEventListener("keyup", async (event) => {
    if (event.key === "Enter" && submitOnRelease) {
        submitOnRelease = false
        await processCommand();
        document.getElementById("logspane").scrollTop = document.getElementById("logspane").scrollHeight;
    }
})

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
    switch (output.command) {
        case "ls":
            const rows = state.channelsArray
                .filter(c => c?.name)
                .map((c, i) => {
                    const idx = String(i).padStart(2, "0")
                    const label = c.name
                    const name = c.name == state.currentChannel ? `<strong>${label}</strong>` : label
                    return `${idx} | ${name}`
                })

            const table = rows.join("<br>")

            document.getElementById("logspane")?.appendChild(
                MessageBuilder.action({
                    icon: "wand_stars",
                    action: table,
                    time: ""
                })
            )
            break;
        case "cd": {
            const channels = state.channelsArray.filter(c => c.name);
            const arg = output.params[0];
            if (!arg) return;

            let [channelPart, threadPart] = arg.split("/");

            let targetChannel = channelPart;

            if (/^\d+$/.test(channelPart)) {
                const i = parseInt(channelPart, 10);
                if (i >= 0 && i < channels.length) targetChannel = channels[i].name;
                else return;
            }

            state._currentThread = undefined;
            if (threadPart !== undefined) {
                const ch = channels.find(c => c.name === targetChannel);
                if (ch && ch.threads) {
                    const threadIdx = parseInt(threadPart, 10);
                    if (!isNaN(threadIdx) && threadIdx >= 0 && threadIdx < ch.threads.length) {
                        state._currentThread = threadIdx;
                        const thread = ch.threads[threadIdx];
                        if (thread) {

                            const chatArea = document.getElementById("interactive_logs");
                            if (chatArea) chatArea.innerHTML = "";
                            document.getElementById("logspane").appendChild(
                                MessageBuilder.action({
                                    icon: "forum",
                                    action: `Switched to thread: <strong>${thread.name}</strong>`,
                                    time: ""
                                })
                            );
                        }
                    }
                }
            }

            changeChannel(targetChannel);
            break;
        }
        case "online": {
            document.getElementById("logspane").appendChild(
                MessageBuilder.action({
                    icon: "wand_stars",
                    action: Object.keys(state.online_users)
                        .map((c) => c).join("<br>"),
                    time: ""
                })
            )
            break;
        }
        case "cls": {
            document.getElementById("logspane").innerHTML = "";
            break;
        }
        case "theme": {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = 'themes/' + output.params[0] + '.css'
            document.head.appendChild(link)
            break;
        }
        case "help": {
            if (output.params[0] == "pane") {
                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "wand_stars",
                        action: `
                       Orla Pane Help<br>
<ul>
<li><strong>pane</strong>: closes the pane</li>
<b>Pane subcommands</b>
<li><strong>search</strong> [keywords]: searches the current channel</li>
<li><strong>members</strong>: shows a list of all members in the current server</li>
<li><strong>pinned</strong>: shows all pinned messages in the current channel</li>
<li><strong>state</strong> [variable]: outputs the value of an Orla state variable</li>
</ul>
                        `,
                        time: ""
                    })
                )
                break;
            }
            document.getElementById("logspane").appendChild(
                MessageBuilder.action({
                    icon: "wand_stars",
                    action: `
                       Orla Client: commands<br>
<ul>
<li><strong>online</strong>: shows a list of online users</li>
<li><strong>ls</strong>: lists all channels with IDs</li>
<li><strong>cd</strong> [channel_name/local_id]: navigate to a channel or display channel name</li>
<li><strong>profile</strong> [*username]: displays user data</li>
<b>Orla Specific:</b>
<li><strong>help</strong>: shows this message</li>
<li><strong>cls</strong>: clear command logs</li>
<li><strong>pane</strong> [subcommand]: opens a secondary pane</li>
<b>Rotur:</b>
<li><strong>transfer</strong> [username],[amount]: send credits to user</li>
<li><strong>balance</strong> [*username]: shows rotur credit balance</li>
</ul>
* = optional &nbsp; Use help [pane] for pane help.
                        `,
                    time: ""
                })
            )
            break;
        }
        case "profile": {
            let user = output.params[0];
            if (!user) user = state.user.username;
            (async () => {
                try {
                    const res = await fetch(`https://api.rotur.dev/profile?name=${encodeURIComponent(user)}&include_posts=0`);
                    const data = await res.json();

                    const usersLowercase = Object.fromEntries(
                        Object.entries(state.users).map(([key, value]) => [key.toLowerCase(), value])
                    );

                    let u = usersLowercase[user.toLowerCase()] || {};
                    const statusText = u.status?.text || "N/A";
                    const statusType = u.status?.status || "N/A";

                    let lines = [];

                    lines.push(`<strong>${u.nickname && u.nickname != user ? `${u.nickname} (${user})` : user}</strong>`);

                    if (data.private || data.system) {
                        lines.push(
                            [data.private ? `privacy: ${data.private}` : null, data.system ? `system: ${data.system}` : null]
                                .filter(Boolean).join(" • ")
                        );
                    }

                    if (data.pronouns) lines.push(`pronouns: ${data.pronouns}`);
                    lines.push(`status: ${statusText} (${statusType})`);
                    if (u.roles?.length) lines.push(`roles: ${u.roles.join(", ")}`);
                    if (data.following || data.followers) lines.push(`following: ${data.following || 0} • followers: ${data.followers || 0}`);
                    if (data.bio) lines.push(`bio: ${data.bio}`);
                    if (data.created) lines.push(`created: ${(new Date(data.created)).toString()}`);
                    if (data.badges?.length) lines.push(`badges: ${data.badges.map(a => a.name).join(", ")}`);

                    const el = MessageBuilder.action({
                        icon: "wand_stars",
                        action: `
<div style="display:flex; gap: .5em; width: 100%;">
    <img class="pfp" src="https://avatars.rotur.dev/${user}">
    <div style="flex: 1">${lines.join("<br>")}</div>
</div>
`
                        ,
                        time: ""
                    });

                    document.getElementById("logspane").appendChild(el);
                } catch (err) {
                    console.error("Failed to fetch profile", err);
                }
            })();
            break;
        }
        case "info": {
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

            const logoText = logo.join("\n")

            const formatEntry = (k, v, width) => {
                const lines = String(v).split("\n")
                const first = pad(k + ":", width) + lines[0]
                const rest = lines.slice(1).map(line => " ".repeat(width) + line)
                return [first, ...rest].join("\n")
            }

            const infoText = entries
                .map(([k, v]) => formatEntry(k, v, maxKey + 1))
                .join("\n")

            notify(
                '<div class="overflowable" style="display:flex; font-family:monospace;">' +
                '<pre style="margin:0; white-space:pre; line-height:1;">' + logoText + '</pre>' +
                '<pre style="margin:0; padding-left:12px; white-space:pre-wrap; word-break:break-word;">' + infoText + '</pre>' +
                '</div>'
            )
            break;
        }
        case "balance": {
            (async () => {
                let argtwo;
                if (!output.params[0]) {
                    argtwo = state.user.username;
                } else {
                    argtwo = output.params[0]
                }
                const res = await fetch(`https://api.rotur.dev/profile?name=${encodeURIComponent(argtwo)}&include_posts=0`);
                const data = await res.json();
                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "attach_money",
                        action: `${argtwo} has ${data.currency} rotur credits`
                    })
                )
            })();
            break;
        }
        case "transfer": {
            (async () => {
                try {
                    const result = await roturExtension.transferCurrency({
                        AMOUNT: Number(output.params[1]),
                        USER: output.params[0]
                    });

                    document.getElementById("logspane").appendChild(
                        MessageBuilder.action({
                            icon: "attach_money",
                            action: result || "Transaction state is unknown."
                        })
                    );
                } catch (e) {
                    document.getElementById("logspane").appendChild(
                        MessageBuilder.action({
                            icon: "attach_money",
                            action: "Transaction failed."
                        })
                    );
                }
            })();
            break;
        }
        case "server": {
            changeServer(output.params[0])
            break;
        }
        case "delete": {
            let messageID = output.params[0];
            ws.send(JSON.stringify({
                cmd: "message_delete",
                channel: state._currentChannel,
                id: messageID
            }));
            break;
        }
        case "pane": {
            if ((!areListsPanelsVisible && !output.params[0]) || (areListsPanelsVisible && output.params[0])) {
                toggleBoth();
            }
            pane.innerHTML = `<div class="empty">no data</div>`;
            state.paneState = output.params[0];
            switch (output.params[0]) {
                case "members":
                    pane.innerHTML = ""

                    Object.entries(state.users).forEach(([name, user]) => {
                        const row = document.createElement("div")
                        row.style.marginBottom = "8px"

                        const result = toFormattedString({
                            name,
                            ...user
                        })

                        const lines = Array.isArray(result) ? result : result ? [result] : []

                        lines.forEach(line => row.appendChild(line))
                        pane.appendChild(row)
                    })

                    filterPane()
                    break;
                case "state":
                    pane.innerHTML = `<p>state.${output.params[1]}:</p>`
                    if (state[output.params[1]]) {
                        pane.appendChild(toFormattedString(state[output.params[1]]));
                    }
                    break;
                case "list":
                    break;
                case "pinned":
                    pane.innerHTML = `<p>Pinned messages in #${state.currentChannel}:</p>`
                    ws.send(JSON.stringify({
                        cmd: "messages_pinned",
                        channel: state.currentChannel,
                    }));
                    break;
                case "search":
                    pane.innerHTML = `<p>Messages containing "${output.params[1]}":</p>`
                    console.log(output)
                    ws.send(JSON.stringify({
                        cmd: "messages_search",
                        channel: state.currentChannel,
                        query: output.params[1]
                    }));
                    break;
            }
            break;
        }
    }

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
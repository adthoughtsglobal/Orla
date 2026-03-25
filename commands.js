var commandinput = document.getElementById("commandinput")

let submitOnRelease = false

commandinput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        submitOnRelease = true
    } else {
        submitOnRelease = false
    }
})

commandinput.addEventListener("keyup", (event) => {
    if (event.key === "Enter" && submitOnRelease) {
        submitOnRelease = false
        function parse(input) {
            let i = 0
            while (i < input.length && input[i] === ' ') i++
            let cmd = ''
            while (i < input.length && input[i] !== ' ' && input[i] !== ',') cmd += input[i++]

            let params = []
            let cur = ''
            let inQuotes = false

            while (i < input.length) {
                let c = input[i++]

                if (c === '"') {
                    inQuotes = !inQuotes
                    continue
                }

                if (c === ',' && !inQuotes) {
                    if (cur.trim().length) params.push(cur.trim())
                    cur = ''
                    continue
                }

                if (c === ' ' && !inQuotes) {
                    if (cur.length === 0) continue
                }

                cur += c
            }

            if (cur.trim().length) params.push(cur.trim())

            return { command: cmd, params }
        }
        let output = parse(commandinput.value);

        document.getElementById("logspane").appendChild(
            MessageBuilder.action({
                icon: "terminal",
                action: commandinput.value,
                time: ""
            })
        )
        switch (output.command) {
            case "ls":
                const rows = state.channelsArray
                    .filter(c => c.name)
                    .map((c, i) => {
                        const idx = String(i).padStart(2, "0")
                        const name = c.name === state._currentChannel
                            ? `<strong>${c.name}</strong>`
                            : c.name
                        return `${idx} | ${name}`
                    })

                const table = rows.join("<br>")

                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "wand_stars",
                        action: table,
                        time: ""
                    })
                )
                break;
            case "cd": {
                const channels = state.channelsArray.filter(c => c.name)
                const arg = output.params[0]

                let target = arg

                if (/^\d+$/.test(arg)) {
                    const i = parseInt(arg, 10)
                    if (i >= 0 && i < channels.length) {
                        target = channels[i].name
                    } else {
                        return
                    }
                }

                changeChannel(target)
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
                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "wand_stars",
                        action: `
                       Orla Client: commands<br>
<ul>
<li><strong>online</strong>: shows a list of online users</li>
<li><strong>ls</strong> [*threads]: lists all channels or threads in the current channel with IDs</li>
<li><strong>cd</strong> [channel_name/local_id]: navigate to a channel or display channel name</li>
<li><strong>profile</strong> [*username]: displays user data</li>
<b>Orla Specific:</b>
<li><strong>help</strong>: shows this message</li>
<li><strong>cls</strong>: clear command logs</li>
<li><strong>pane</strong> [settings/stats/info]: opens a secondary pane</li>
<b>Rotur:</b>
<li><strong>transfer</strong> [username],[amount]: send credits to user</li>
<li><strong>balance</strong> [*username]: opens settings</li>
</ul>
* = optional
                        `,
                        time: ""
                    })
                )
                break;
            }
            case "profile": {
                let user = output.params[0];
                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "wand_stars",
                        action: '<div style="display:flex; gap: .5em">' +
                            '<img class="pfp" src="https://avatars.rotur.dev/' + user + '">' +
                            `<div><strong>${(state.users[user].nickname && state.users[user].nickname != user) ? (state.users[user].nickname + ` (${user})`) : user}</strong><br>
                    status: ${state.users[user].status.text + ` (${state.users[user].status?.status})` || state.users[user].status.status}
                    <br>roles: ${state.users[user].roles.toString()}
                    </div>
                    `
                            + '</div>',
                        time: ""
                    })
                )
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

                const infoText = entries
                    .map(([k, v]) => pad(k + ":", maxKey + 1) + v)
                    .join("\n")

                notify(
                    '<div style="display:flex; font-family:monospace;">' +
                    '<pre style="margin:0; white-space:pre; line-height:1;">' + logoText + '</pre>' +
                    '<pre style="margin:0; padding-left:12px; white-space:pre-wrap; word-break:break-word;">' + infoText + '</pre>' +
                    '</div>'
                )
                break;
            }
            case "balance": {
                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "attach_money",
                        action: `You have ${roturExtension.getBalance()} rotur credits`
                    })
                )
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
        }

        commandinput.value = "";
    }
})
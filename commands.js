var commandinput = document.getElementById("commandinput");
commandinput.addEventListener("keypress", (event) => {
    if (event.key == "Enter") {
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
                break
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
            }
        }
    }
})
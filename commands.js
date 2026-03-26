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
<li><strong>balance</strong> [*username]: shows rotur credit balance</li>
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
            if (output.params[0]) {
                (async () => {
                    const res = await fetch(`https://api.rotur.dev/profile?name=${encodeURIComponent(output.params[0])}&include_posts=0`);
                    const data = await res.json();
                    document.getElementById("logspane").appendChild(
                        MessageBuilder.action({
                            icon: "attach_money",
                            action: `${output.params[0]} has ${data.currency} rotur credits`
                        })
                    )
                })();
            } else {

                document.getElementById("logspane").appendChild(
                    MessageBuilder.action({
                        icon: "attach_money",
                        action: `You have ${roturExtension.getBalance()} rotur credits`
                    })
                )
            }
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
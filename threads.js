function renderThreads(threads) {
    const chatArea = document.getElementById("interactive_logs")
    if (!chatArea) return

    chatArea.innerHTML =`
    <div class="emptyChannel">
    <span>[Choose a thread]</span>
    </div>
    `

    const rows = threads
        .filter(t => t.name)
        .map((t, i) => {
            const idx = String(i).padStart(2, "0")
            const name = t.name === state._currentChannel
                ? `<strong>${t.name}</strong>`
                : t.name
            return `${idx} | ${name}`
        })

    const table = "Choose a thread: (click)<br>" +  rows.join("<br>") + "<br><br>You can call <kbd>cd [channel_name], [thread_name]</kbd> next time"

    document.getElementById("logspane").appendChild(
        MessageBuilder.action({
            icon: "wand_stars",
            action: table,
            time: ""
        })
    )
}
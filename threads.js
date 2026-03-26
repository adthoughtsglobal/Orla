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
            const name = `<span onclick="runcmd('cd ${state._currentChannel}/${idx}')">${t.name}</span>`;
            return `${idx} | ${name}`
        })

    const table = "Choose a thread: (click)<br>" +  rows.join("<br>") + "<br><br>You can also call <kbd>cd [channel_name], [thread_id]</kbd>"

    document.getElementById("logspane").appendChild(
        MessageBuilder.action({
            icon: "wand_stars",
            action: table
        })
    )
}
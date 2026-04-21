
function escapeHTML(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
const toFormattedString = (value, indent = 0, seen = new WeakSet()) => {
    const frag = document.createDocumentFragment()
    const pad = (n) => `${n * 12 + 16}px`

    const primitive = (v) => {
        if (typeof v === "string") return `"${v}"`
        if (typeof v === "function") return v.name ? `[Function ${v.name}]` : "[Function]"
        if (typeof v === "symbol") return v.toString()
        if (v instanceof Date) return v.toISOString()
        if (v instanceof RegExp) return v.toString()
        return String(v)
    }

    const preview = (v) => {
        if (v == null || typeof v !== "object") return primitive(v)
        if (seen.has(v)) return "[Circular]"

        if (Array.isArray(v)) {
            if (!v.length) return "[]"
            return `[${preview(v[0])}${v.length > 1 ? ", …" : ""}]`
        }

        const entries = Object.entries(v).filter(([, x]) => x != null)
        if (!entries.length) return "{}"

        const [k, val] = entries[0]
        return `{ ${k}: ${preview(val)}${entries.length > 1 ? ", …" : ""} }`
    }

    const line = (text, level = indent) => {
        const div = document.createElement("div")
        div.style.paddingLeft = pad(level)
        div.textContent = text
        frag.appendChild(div)
    }

    const keyLine = (key, valueText, level) => {
        const div = document.createElement("div")
        div.style.paddingLeft = pad(level)

        const strong = document.createElement("strong")
        strong.textContent = key

        div.appendChild(strong)
        div.appendChild(document.createTextNode(`: ${valueText}`))
        frag.appendChild(div)
    }

    const collapsible = (key, valueText, child, level) => {
        const details = document.createElement("details")
        details.style.paddingLeft = pad(level)

        const summary = document.createElement("summary")

        const strong = document.createElement("strong")
        strong.textContent = key

        summary.appendChild(strong)
        summary.appendChild(document.createTextNode(`: ${valueText}`))
        details.appendChild(summary)

        const body = document.createElement("div")
        body.appendChild(child)
        details.appendChild(body)

        frag.appendChild(details)
    }

    if (value == null) return frag
    if (typeof value !== "object") return line(primitive(value)), frag
    if (seen.has(value)) return line("[Circular]"), frag
    seen.add(value)

    if (Array.isArray(value)) {
        line("[")
        for (const item of value) {
            if (item && typeof item === "object") {
                const child = toFormattedString(item, indent + 2, seen)
                const label = Array.isArray(item) ? preview(item) : preview(item)
                const details = document.createElement("details")
                details.style.paddingLeft = pad(indent + 1)

                const summary = document.createElement("summary")
                summary.textContent = label
                details.appendChild(summary)

                const body = document.createElement("div")
                body.appendChild(child)
                details.appendChild(body)

                frag.appendChild(details)
            } else {
                frag.appendChild(toFormattedString(item, indent + 1, seen))
            }
        }
        line("]")
        return frag
    }

    line("{")

    for (const [key, val] of Object.entries(value)) {
        if (val == null) continue

        if (val && typeof val === "object") {
            collapsible(key, preview(val), toFormattedString(val, indent + 2, seen), indent + 1)
        } else {
            keyLine(key, primitive(val), indent + 1)
        }
    }

    line("}")

    seen.delete(value)
    return frag
}


function extractUsername(u) {
    if (!u) return "";
    if (typeof u === "string") return u;
    if (typeof u === "object") {
        return (
            u.username || u.name || u.displayName || u.user || u.id || "[unknown]"
        );
    }
    return String(u);
}

function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
}
function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
}

var loaderElement = document.getElementById("fullloader")
var loader = {
    show: () => {
        loaderElement.style.display = 'flex';
        loaderElement.style.opacity = '1';
    },
    hide: () => {
        loaderElement.style.opacity = '0';
        loaderElement.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            loaderElement.style.display = 'none';
        }, 300);
    },
}
var settings = {
    queue: Promise.resolve(),

    get: key => {
        const store = localStorage.getItem('orla-store')
        const data = store ? JSON.parse(store) : {}

        if (key === undefined) return data
        if (!(key in data)) return 0
        return data[key]
    },

    set: (key, value) => {
        if (value === undefined) {
            value = key
            key = null
        }

        settings.queue = settings.queue.then(() => {
            const store = localStorage.getItem('orla-store')
            const data = store ? JSON.parse(store) : {}

            if (key === null && typeof value === 'object' && value !== null) {
                Object.assign(data, value)
            } else {
                data[key] = value
            }

            localStorage.setItem('orla-store', JSON.stringify(data))
            return value
        })

        return settings.queue
    }
}
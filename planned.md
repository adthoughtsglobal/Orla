- listenerctl [listenerID] [boolean]: displays or manages listeners (filter logs)
- transfer [user] [amount]: sends credits
- request [user] [amount]: requests credits

- status [set] [idle/online/dnd/invisible] [string]
- status [clear]

- keys [set] [key] [value]
- keys [remove] [key]

- theme [url]
- setting [ping_sfx]

AutoResponder
- autoresponder [list]: lists autoresponders with ids.
- autoresponder [add] [string/regex] [pattern] [response]
- autoresponder [remove] [id].

AwayHandler
- afk [set] [string]
- afk [end]

TextReplace
- textreplace [add] [string] [string]
- textreplace [list]

Privacy
- setting [send_typing] [boolean]
- setting [load_media] [boolean]

moonshot
- rob [user] [amount]: 50% chance of actually robbing the target user. (the user has to enable addon and must have the balance and must be online). 50% chance to lose the amount from your balance (half goes to the user, half goes to me).

Lists pane: lists stuff like members, message search results, pinned messages, 

To Do
- reply
- message md formatting
- copy message id
- list threads messages
- message in threads
- add and remove reactions
- per user message grouping
- role colors
- attatchments
- mentions and pings
- channel links
- pinned messages
- message searching
- server bar and server switching
- rate limit handling
- dms server
- dms by default
- timeouts handling
- server leaving and management
- voice channels
- media servers
- server discovery
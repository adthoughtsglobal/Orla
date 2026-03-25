- listenerctl [listenerID] [boolean]: displays or manages listeners (filter logs)
- transfer [user] [amount]: sends credits
- request [user] [amount]: requests credits

- status [set] [idle/online/dnd/invisible] [string]
- status [clear]

- keys [set] [key] [value]
- keys [remove] [key]

- theme [url]
- setting [ping_sfx]
- 

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
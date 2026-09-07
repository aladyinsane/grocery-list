# shortcuts

The Apple Shortcut that gives us Siri, plus its install instructions.

**Not yet implemented — this arrives in PR 4, alongside ADR-0007.**

The plan: a shortcut named "Grocery" that asks for dictated text and POSTs it to
`/api/quick-add`, which splits a phrase like "milk, eggs and bread" into three items.
Distributed as an iCloud link so installing it is one tap per phone.

ADR-0002 explains why Siri arrives this way rather than as a native App Intent, and what
we give up by doing it.

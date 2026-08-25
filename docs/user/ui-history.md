# Checked screens

Croki keeps screens that were actually inspected in Preview with the Thread
that produced them. After a turn changes likely user-visible files, the Thread
shows one evidence receipt:

- **Checked _n_ screens** shows the captured screens from that turn. Each
  thumbnail includes its page, viewport, and recorded console or network issue
  count. Open any thumbnail to move through the available screens as a gallery.
- **Not checked** means the completed checkpoint contains likely user-visible
  changes but no screen was captured.
- **Check unavailable** means Croki could identify likely user-visible changes,
  but the checkpoint or screen evidence was not available.

Preview's **UI history** control shows the recent checked screens for the active
Thread. Opening or reviewing checked screens does not add them to a provider
message. They remain read-only evidence until you explicitly reference or
attach something in the composer.

When a model explicitly captures several alternatives as concepts in one turn,
the receipt becomes a ranked concept set instead of a generic screenshot
gallery. Croki keeps every captured option (up to ten) in the model's initial
order. You can then:

- select an option to inspect its captured screen and tradeoff;
- drag options into a new rank, or use the focused drag handle with the
  keyboard, without losing the originals;
- mark each option **Keep**, **Question**, or **Reject**;
- compare the selected option with one other option; and
- continue with one option or remix the kept options.

Continue and Remix add a visible summary of your choices to the composer. You
can edit or remove it before sending; Croki never sends a concept choice on its
own. Ordinary Preview snapshots remain checked-screen evidence and are never
inferred to be concepts.

Checked means that Croki preserved a screen inspected during the turn. It does
not claim that every state, interaction, breakpoint, accessibility condition,
or production environment was verified.

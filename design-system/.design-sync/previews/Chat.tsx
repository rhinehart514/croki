import {
  Chat,
  ChatHeader,
  ChatIconButton,
  ChatAttachment,
  ChatMessage,
  ChatReply,
  ChatToolCall,
  ChatDocRef,
  ChatPill,
  ChatComposer,
} from "@gtm-ide/design-system";

/* Inline glyphs — no icon dependency, sized by the Chat CSS. */
const Panel = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);
const Pen = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const Doc = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);
const Chevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const Copy = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
const Refresh = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);
const Star = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
  </svg>
);
const Plus = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Mic = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const Send = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);

// The resident GTM operator assistant — grounding a draft in account research.
export function OutreachAssistant() {
  return (
    <div data-skin="glass">
      <Chat
        header={
          <ChatHeader
            title="Outreach assistant"
            actions={
              <>
                <ChatIconButton icon={Panel} aria-label="Toggle panel" />
                <ChatIconButton icon={Pen} aria-label="New chat" />
              </>
            }
          />
        }
        composer={
          <ChatComposer
            input={<textarea placeholder="Ask anything, @ for context and skills" rows={1} />}
            plusIcon={Plus}
            micIcon={Mic}
            sendIcon={Send}
            controls={
              <>
                <ChatPill variant="link" icon={Pen}>
                  Canvas
                </ChatPill>
                <ChatPill variant="outline" icon={Star} trailing={Chevron}>
                  Sonnet 4.5
                </ChatPill>
              </>
            }
          />
        }
      >
        <ChatAttachment
          name="Northwind-account-research.pdf"
          meta="PDF document"
          icon={Doc}
          tone="danger"
        />

        <ChatMessage role="user">
          You are a GTM engineer helping me compose outreach. First, summarize the buying signals
          from this account in plain English.
        </ChatMessage>

        <ChatMessage
          role="assistant"
          avatar={Star}
          actions={
            <>
              <ChatIconButton icon={Copy} aria-label="Copy" />
              <ChatIconButton icon={Refresh} aria-label="Regenerate" />
            </>
          }
        >
          <ChatToolCall icon={Doc} trailing={Chevron} tone="danger">
            Read <b>&ldquo;Northwind-account-research.pdf&rdquo;</b>
          </ChatToolCall>
          <ChatDocRef icon={Doc} tone="generate">
            Northwind Outreach Brief
          </ChatDocRef>
          <ChatReply>
            I&rsquo;ve drafted a brief with the buying signals, three outreach themes, and a
            recommended opener grounded in the research. Want me to expand it into a full send
            sequence next?
          </ChatReply>
        </ChatMessage>
      </Chat>
    </div>
  );
}

// The empty-state composer — a placeholder field with a model selector.
export function EmptyComposer() {
  return (
    <div data-skin="glass">
      <Chat
        header={<ChatHeader title="New conversation" actions={<ChatIconButton icon={Pen} aria-label="New chat" />} />}
        composer={
          <ChatComposer
            placeholder="Describe the GTM change you want…"
            plusIcon={Plus}
            micIcon={Mic}
            sendIcon={Send}
            sendDisabled
            controls={
              <ChatPill variant="outline" icon={Star} trailing={Chevron}>
                Opus 4.8
              </ChatPill>
            }
          />
        }
      >
        <ChatMessage role="assistant" avatar={Star}>
          <ChatReply>
            Point me at a flow or paste a goal — I&rsquo;ll inspect the graph and propose the next
            move, stopping at every founder gate.
          </ChatReply>
        </ChatMessage>
      </Chat>
    </div>
  );
}

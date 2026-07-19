export function ThreadHome({ attention, active }: { attention: number; active: number }) {
  return <section className="thread-home"><span>Drover</span><h2>What do you want to work on?</h2><p>{attention ? `${attention} ${attention === 1 ? "thread needs" : "threads need"} your judgment.` : active ? `${active} ${active === 1 ? "agent is" : "agents are"} working now.` : "Start a direction, or ask what matters most right now."}</p></section>;
}

export function ThreadHome({ attention, active }: { attention: number; active: number }) {
  return <section className="thread-home"><span>Croki</span><h2>What do you want to build?</h2><p>{attention ? `${attention} ${attention === 1 ? "thread needs" : "threads need"} your judgment.` : active ? `${active} ${active === 1 ? "agent is" : "agents are"} working now.` : "Start a coding task, ask about the repository, or open Canvas when the relationships matter."}</p></section>;
}
